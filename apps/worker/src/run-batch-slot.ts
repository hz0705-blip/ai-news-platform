import {
  addBatchRunSpend,
  addGnewsRequests,
  finishBatchRun,
  loadBatchStories,
  loadLastCompletedSlot,
  loadSpendBetween,
  type RuntimeDb,
  startBatchRun,
} from "@newsplatform/db";
import { gnewsLedgerDate } from "@newsplatform/domain";
import { kstDayRange, slotAtOf } from "@newsplatform/domain/batch-slot";
import {
  type BatchReport,
  type Budget,
  type CollectGdeltDeps,
  type CollectGnewsDeps,
  type EmbeddingClient,
  type ModelClient,
  runBatch,
} from "@newsplatform/pipeline";
import { applyBatchResult } from "./apply-batch-result.ts";
import { assignStories } from "./assign.ts";
import { DAILY_PIPELINE_BUDGET_TOKENS, DAILY_PIPELINE_BUDGET_USD } from "./budget.ts";
import { type CollectResult, collectFromGnews } from "./collect.ts";
import { type GdeltStageReport, runGdeltStage } from "./gdelt.ts";
import { type RecheckStageReport, runRecheckStage } from "./recheck.ts";
import { fillSearchEmbeddings, type SearchEmbeddingReport } from "./search-embedding.ts";

/** 활성 잡 만료 = DB 리스 90분(스펙 "배포와 운영" 스케줄러). */
export const BATCH_LEASE_MS = 90 * 60 * 1000;
/** 배치 기한: 시작 70분 뒤에는 모델 호출을 시작하지 않는다(잡 만료보다 짧게, #55 Ruling). */
export const BATCH_MODEL_DEADLINE_MS = 70 * 60 * 1000;
/** GDELT 단계 기한: 시작 80분 뒤에는 GDELT 요청을 시작하지 않는다(리스 90분 안, #77 Ruling). */
export const BATCH_GDELT_DEADLINE_MS = 80 * 60 * 1000;
/** 첫 배치(원장이 비었을 때)의 수집 창 시작: 슬롯 12시간 전. */
const FIRST_COLLECTION_WINDOW_MS = 12 * 60 * 60 * 1000;

/** 오늘 화면의 공개 캐시 태그(apps/web/lib/today-cache.ts). */
export const TODAY_CACHE_TAG = "today:ko";

/** 배치 리포트 행(`batch_runs.report`)이자 구조화 로그의 본문. */
export interface BatchSlotReport {
  readonly slotKey: string;
  readonly slotAt: string;
  readonly attempt: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly collection:
    | { readonly skipped: true }
    | {
        readonly from: string;
        readonly to: string;
        readonly requestCount: number;
        readonly excludedArticles: number;
        readonly newArticles: number;
        readonly mergedArticles: number;
        readonly savedVersions: number;
        readonly failures: CollectResult["failures"];
      };
  /** 원문 재수집(#86). 수집을 건너뛰면 건너뛴다. 단계 자체가 던지면 `error`만 남기고 배치는 계속한다. */
  readonly recheck: { readonly skipped: true } | { readonly error: string } | RecheckStageReport;
  readonly assignment: {
    readonly processed: number;
    readonly assigned: number;
    readonly newStories: number;
    readonly kept: number;
    readonly usage: { readonly tokens: number; readonly spend: number };
  };
  readonly pipeline: BatchReport;
  /** 근거 구간 좌표 정렬 비율(#86) = 성공 / 시도. 시도가 없으면 null. */
  readonly spanRealignmentRatio: number | null;
  readonly published: number;
  readonly confirmed: number;
  readonly deferred: number;
  readonly failed: number;
  readonly publishFailures: readonly { readonly storyId: string; readonly reason: string }[];
  /** GDELT 단계(#77). 단계 자체가 던지면 `error`만 남기고 배치는 완료한다. */
  readonly gdelt: { readonly skipped: true } | { readonly error: string } | GdeltStageReport;
  /**
   * 검색 임베딩(#124). 일일 상한에 이미 닿았으면 건너뛰고, 실패(`failure`·`error`)해도 발행을 되돌리지 않는다 —
   * 빈 임베딩은 다음 배치·백필이 채운다.
   */
  readonly searchEmbedding:
    | { readonly skipped: "budget-reached" }
    | { readonly error: string }
    | SearchEmbeddingReport;
  readonly spend: {
    readonly budgetUsd: number;
    readonly previousTodayUsd: number;
    readonly embeddingUsd: number;
    readonly modelUsd: number;
    readonly totalUsd: number;
    readonly budgetReached: boolean;
  };
  readonly cacheInvalidated: boolean;
}

export type RunBatchSlotResult =
  | { readonly kind: "completed"; readonly report: BatchSlotReport }
  | { readonly kind: "skipped"; readonly reason: "already-completed" | "busy" };

export interface RunBatchSlotDeps {
  readonly db: RuntimeDb["db"];
  /** 없으면 수집을 건너뛴다(테스트, 수동 실행 `--skip-collect`). */
  readonly gnews?: CollectGnewsDeps;
  /** 없으면 GDELT 단계를 건너뛴다(테스트, 로컬). */
  readonly gdelt?: CollectGdeltDeps;
  readonly embeddingClient: EmbeddingClient;
  readonly modelClient: ModelClient;
  readonly clock: () => Date;
  /** 발행 뒤 웹 캐시 무효화. 없으면 건너뛴다(로컬). */
  readonly invalidateCache?: (tags: readonly string[]) => Promise<void>;
  /** 구조화 JSON 로그 한 줄. 기본은 stdout. */
  readonly log?: (event: Record<string, unknown>) => void;
  readonly concurrency?: number;
  /** 파이프라인 일일 예산(`pipelineDailyBudget`). 기본 스펙 값 $1.20. */
  readonly dailyBudget?: Budget;
  readonly sleep?: (ms: number) => Promise<void>;
}

class UnknownSlotError extends Error {
  override readonly name = "UnknownSlotError";
}

/**
 * 슬롯 하나의 배치(#55): 원장·리스 → 수집(#52) → 원문 재수집(#86) → 배정(#53) → 입력이 바뀐 사건만 `runBatch`(#54) → 발행 →
 * GDELT 링크(#77) → 검색 임베딩(#124) → 캐시 무효화 → 리포트. 예산은 같은 KST 날짜의 앞선 지출(임베딩 포함)을 뺀 잔액이다.
 * 같은 슬롯이 이미 완료됐거나 다른 배치의 리스가 살아 있으면 아무것도 하지 않는다.
 * 단계가 던지면 원장에 실패로 적고 다시 던진다(pg-boss가 재시도한다). OpenAI 호출 중에는 DB 트랜잭션이 없다.
 */
export async function runBatchSlot(
  input: { readonly slotKey: string },
  deps: RunBatchSlotDeps,
): Promise<RunBatchSlotResult> {
  const slotAt = slotAtOf(input.slotKey);
  if (slotAt === undefined) throw new UnknownSlotError(`슬롯 키가 아니다: ${input.slotKey}`);
  const log = deps.log ?? ((event) => console.log(JSON.stringify(event)));
  const startedAt = deps.clock();
  const budget = deps.dailyBudget ?? {
    spend: DAILY_PIPELINE_BUDGET_USD,
    tokens: DAILY_PIPELINE_BUDGET_TOKENS,
  };
  const base = { slotKey: input.slotKey, slotAt: slotAt.toISOString() };

  const start = await startBatchRun(deps.db, {
    slotKey: input.slotKey,
    slotAt,
    now: startedAt,
    leaseMs: BATCH_LEASE_MS,
  });
  if (start.kind !== "started") {
    log({
      ...base,
      at: startedAt.toISOString(),
      stage: "start",
      result: "skipped",
      reason: start.kind,
    });
    return { kind: "skipped", reason: start.kind };
  }
  const attempt = start.attempt;
  const stageLog = (stage: string, fields: Record<string, unknown>) =>
    log({ ...base, at: deps.clock().toISOString(), attempt, stage, ...fields });
  stageLog("start", { result: "started" });

  let embeddingUsd = 0;
  let modelUsd = 0;
  try {
    // 1. 수집: `from` = 직전 완료 슬롯 − 1시간(겹침은 중복 제거가 흡수), `to` = 이 슬롯.
    let collection: BatchSlotReport["collection"] = { skipped: true };
    let collectedArticleIds: readonly string[] | undefined;
    if (deps.gnews !== undefined) {
      const previous = await loadLastCompletedSlot(deps.db);
      const previousTo =
        previous?.slotAt ?? new Date(slotAt.getTime() - FIRST_COLLECTION_WINDOW_MS);
      const collected = await collectFromGnews(
        { slotAt, previousTo },
        { db: deps.db, gnews: deps.gnews },
      );
      collectedArticleIds = [...new Set(collected.savedVersions.map((v) => v.articleId))];
      collection = {
        from: previousTo.toISOString(),
        to: slotAt.toISOString(),
        requestCount: collected.requestCount,
        excludedArticles: collected.excludedArticles,
        newArticles: collected.newArticles,
        mergedArticles: collected.mergedArticles,
        savedVersions: collected.savedVersions.length,
        failures: collected.failures,
      };
      stageLog("collect", { result: "ok", ...collection });
      // 발견(정규 수집)도 GNews 요청 원장에 기록한다(#86).
      await addGnewsRequests(deps.db, {
        utcDate: gnewsLedgerDate(deps.clock()),
        purpose: "discovery",
        count: collected.requestCount,
      });
    }

    // 1-2. 원문 재수집(#86): 일정에 든 기사를 정확 제목으로 다시 찾아 새 버전이면 저장하고 그 사건을 재처리 대상으로 올린다.
    let recheck: BatchSlotReport["recheck"] = { skipped: true };
    if (deps.gnews !== undefined) {
      try {
        const rechecked = await runRecheckStage(
          { now: deps.clock() },
          { db: deps.db, gnews: deps.gnews, clock: deps.clock },
        );
        recheck = rechecked;
        stageLog("recheck", { result: "ok", ...rechecked });
      } catch (recheckError) {
        recheck = {
          error: recheckError instanceof Error ? recheckError.message : String(recheckError),
        };
        stageLog("recheck", { result: "failed", ...recheck });
      }
    }

    // 2. 배정: 수집이 돌려준 기사(수집을 건너뛰면 사건 없는 기사 전부).
    const assigned = await assignStories(
      {
        now: deps.clock(),
        ...(collectedArticleIds === undefined ? {} : { articleIds: collectedArticleIds }),
      },
      { db: deps.db, embeddingClient: deps.embeddingClient },
    );
    embeddingUsd = assigned.usage.spend;
    await addBatchRunSpend(deps.db, { slotKey: input.slotKey, spendUsd: embeddingUsd });
    const assignment: BatchSlotReport["assignment"] = {
      processed: assigned.outcomes.length,
      assigned: assigned.outcomes.filter((o) => o.kind === "assigned").length,
      newStories: assigned.outcomes.filter((o) => o.kind === "new-story").length,
      kept: assigned.outcomes.filter((o) => o.kind === "kept").length,
      usage: assigned.usage,
    };
    stageLog("assign", { result: "ok", ...assignment });

    // 3. 예산 잔액: 이 시도가 도는 KST 날짜에 시작한 모든 실행의 지출(이 슬롯의 이전 시도·이번 임베딩 포함)을 뺀다.
    const spentTodayUsd = await loadSpendBetween(deps.db, kstDayRange(startedAt));
    const previousTodayUsd = Math.max(0, spentTodayUsd - embeddingUsd);
    const remainingUsd = Math.max(0, budget.spend - spentTodayUsd);
    const { stories, sources } = await loadBatchStories(deps.db, { now: startedAt });
    const batchStartedAt = deps.clock();
    const result = await runBatch(
      {
        articles: stories.flatMap((s) => s.articles),
        now: batchStartedAt,
        dailyBudget: { tokens: budget.tokens, spend: remainingUsd },
        sources,
        existingStories: stories.map(
          ({
            story,
            latestRevision,
            deferredSince,
            linkOnlySources,
            previousVersionBodies,
            openEpisodeClaims,
            carriedClaims,
          }) => ({
            story,
            ...(latestRevision === undefined ? {} : { latestRevision }),
            ...(deferredSince === undefined ? {} : { deferredSince }),
            ...(linkOnlySources === undefined ? {} : { linkOnlySources }),
            ...(previousVersionBodies === undefined ? {} : { previousVersionBodies }),
            ...(openEpisodeClaims === undefined ? {} : { openEpisodeClaims }),
            ...(carriedClaims === undefined ? {} : { carriedClaims }),
          }),
        ),
        deadline: new Date(startedAt.getTime() + BATCH_MODEL_DEADLINE_MS),
        ...(deps.concurrency === undefined ? {} : { concurrency: deps.concurrency }),
      },
      {
        modelClient: deps.modelClient,
        embeddingClient: deps.embeddingClient,
        clock: deps.clock,
        ...(deps.sleep === undefined ? {} : { sleep: deps.sleep }),
        // 사건이 끝날 때마다 원장에 지출을 더한다(OpenAI 호출 밖, 트랜잭션 없음).
        onUsage: (delta) =>
          addBatchRunSpend(deps.db, { slotKey: input.slotKey, spendUsd: delta.spend }),
      },
    );
    modelUsd = result.report.usage.reduce((sum, u) => sum + u.spend, 0);
    stageLog("pipeline", {
      result: "ok",
      candidates: stories.length,
      processed: result.report.processed,
      deferred: result.report.deferred,
      failed: result.report.failed,
      tokens: result.report.usage.reduce((sum, u) => sum + u.tokens, 0),
      spendUsd: modelUsd,
      remainingBudgetUsd: remainingUsd,
      budgetReached: result.report.budgetReached,
      deadlineReached: result.report.deadlineReached,
    });

    // 4. 발행(사건마다 한 트랜잭션) · 확인 · 미룸 표시.
    const applied = await applyBatchResult(deps.db, result, { deferredAt: batchStartedAt });
    const publishedStoryIds = applied.published.map((p) => p.storyId);

    // 5. GDELT(#77): 이번 배치에서 발행된 사건에 링크만 기사를 붙이고 출처 추가 개정판을 낸다(모델 호출 없음).
    // 429·오류는 그 사건만 건너뛰고, 단계가 통째로 던져도 이미 발행한 배치를 실패로 만들지 않는다.
    let gdelt: BatchSlotReport["gdelt"] = { skipped: true };
    const revisedStoryIds: string[] = [];
    if (deps.gdelt !== undefined) {
      try {
        const linked = await runGdeltStage(
          {
            storyIds: publishedStoryIds,
            batchStartedAt: startedAt,
            now: deps.clock(),
            deadline: new Date(startedAt.getTime() + BATCH_GDELT_DEADLINE_MS),
          },
          {
            db: deps.db,
            // 기한은 배치 시계 기준이므로 GDELT 간격·기한도 같은 시계로 잰다.
            gdelt: { clock: deps.clock, ...deps.gdelt },
            embeddingClient: deps.embeddingClient,
          },
        );
        embeddingUsd += linked.usage.spend;
        await addBatchRunSpend(deps.db, { slotKey: input.slotKey, spendUsd: linked.usage.spend });
        revisedStoryIds.push(...linked.revisedStoryIds);
        gdelt = linked;
        stageLog("gdelt", { result: "ok", ...linked });
      } catch (gdeltError) {
        gdelt = { error: gdeltError instanceof Error ? gdeltError.message : String(gdeltError) };
        stageLog("gdelt", { result: "failed", ...gdelt });
      }
    }

    // 5-2. 검색 임베딩(#124): 발행·GDELT 뒤 임베딩이 빈 사건 제목·주장 문장을 채운다(앞선 배치에서 빈 것 포함).
    // 비용은 임베딩 지출로 원장에 더하고, 오늘 지출이 이미 상한이면 건너뛴다.
    let searchEmbedding: BatchSlotReport["searchEmbedding"];
    if ((await loadSpendBetween(deps.db, kstDayRange(startedAt))) >= budget.spend) {
      searchEmbedding = { skipped: "budget-reached" };
      stageLog("search-embedding", { result: "skipped", ...searchEmbedding });
    } else {
      try {
        const filled = await fillSearchEmbeddings({
          db: deps.db,
          embeddingClient: deps.embeddingClient,
        });
        embeddingUsd += filled.usage.spend;
        await addBatchRunSpend(deps.db, { slotKey: input.slotKey, spendUsd: filled.usage.spend });
        searchEmbedding = filled;
        stageLog("search-embedding", {
          result: filled.failure === undefined ? "ok" : "failed",
          ...filled,
        });
      } catch (searchError) {
        searchEmbedding = {
          error: searchError instanceof Error ? searchError.message : String(searchError),
        };
        stageLog("search-embedding", { result: "failed", ...searchEmbedding });
      }
    }

    const finishedAt = deps.clock();
    const totalUsd = embeddingUsd + modelUsd;
    const report: BatchSlotReport = {
      ...base,
      attempt,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      collection,
      recheck,
      assignment,
      pipeline: result.report,
      spanRealignmentRatio:
        result.report.spanRealignment.attempted === 0
          ? null
          : result.report.spanRealignment.aligned / result.report.spanRealignment.attempted,
      published: publishedStoryIds.length,
      confirmed: result.confirmed.length,
      deferred: result.report.deferred,
      failed: result.report.failed + applied.publishFailures.length,
      publishFailures: applied.publishFailures,
      gdelt,
      searchEmbedding,
      spend: {
        budgetUsd: budget.spend,
        previousTodayUsd,
        embeddingUsd,
        modelUsd,
        totalUsd,
        budgetReached: result.report.budgetReached,
      },
      cacheInvalidated: false,
    };
    await finishBatchRun(deps.db, {
      slotKey: input.slotKey,
      status: "completed",
      finishedAt,
      report,
    });

    // 6. 웹 캐시 무효화(오늘 + 발행된 사건의 최신 포인터). 원장이 `completed`로 커밋된 뒤에 만료해야 그 사이의
    // 요청이 `running` 행을 다시 캐시하지 않는다. 오늘 화면은 배치 상태도 보이므로 발행이 없어도 오늘 태그를
    // 만료한다(#56). 이미 완료한 슬롯이므로 무효화·기록 실패는 배치를 실패로 만들지 않고 로그만 남긴다.
    let finalReport = report;
    if (deps.invalidateCache !== undefined) {
      try {
        await deps.invalidateCache([
          TODAY_CACHE_TAG,
          ...[...new Set([...publishedStoryIds, ...revisedStoryIds])].map(
            (id) => `story:${id}:latest`,
          ),
        ]);
        finalReport = { ...report, cacheInvalidated: true };
        await finishBatchRun(deps.db, {
          slotKey: input.slotKey,
          status: "completed",
          finishedAt,
          report: finalReport,
        });
      } catch (cacheError) {
        stageLog("invalidate", { result: "failed", error: String(cacheError) });
      }
    }
    log({ at: finishedAt.toISOString(), stage: "finish", result: "completed", ...finalReport });
    return { kind: "completed", report: finalReport };
  } catch (error) {
    const finishedAt = deps.clock();
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    // 원장 기록이 실패해도(DB 장애) 원래 오류를 덮지 않는다. 리스는 만료로 풀린다.
    await finishBatchRun(deps.db, {
      slotKey: input.slotKey,
      status: "failed",
      finishedAt,
      error: message,
    }).catch((ledgerError: unknown) =>
      stageLog("finish", { result: "ledger-failed", error: String(ledgerError) }),
    );
    // 오늘 화면이 "갱신 진행 중" 대신 "배치 실패"를 보이도록 오늘 태그를 만료한다(#56). 실패해도 원래 오류를 덮지 않는다.
    await deps
      .invalidateCache?.([TODAY_CACHE_TAG])
      .catch((cacheError: unknown) =>
        stageLog("finish", { result: "invalidate-failed", error: String(cacheError) }),
      );
    stageLog("finish", {
      result: "failed",
      error: message,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      spendUsd: embeddingUsd + modelUsd,
    });
    throw error;
  }
}
