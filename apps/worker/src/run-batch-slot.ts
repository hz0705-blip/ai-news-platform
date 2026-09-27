import {
  addBatchRunSpend,
  clearStoriesDeferred,
  confirmRevision,
  finishBatchRun,
  loadBatchStories,
  loadLastCompletedSlot,
  loadSpendBetween,
  markStoriesDeferred,
  publishRevision,
  type RuntimeDb,
  startBatchRun,
} from "@newsplatform/db";
import {
  type BatchReport,
  type CollectGnewsDeps,
  type EmbeddingClient,
  type ModelClient,
  runBatch,
} from "@newsplatform/pipeline";
import { assignStories } from "./assign.ts";
import { type CollectResult, collectFromGnews } from "./collect.ts";
import { kstDayRange, slotAtOf } from "./slot.ts";

/** 파이프라인 일일 예산(USD; 스펙 "개발 중 결정 항목" 토큰 계량). 시도가 실제로 도는 KST 날짜의 모든 실행이 나눠 쓴다. */
export const DAILY_PIPELINE_BUDGET_USD = 1.2;
/** 토큰 상한은 USD 상한의 보조다(gpt-5-mini 출력 단가 기준 $1.20 ≈ 60만 출력 토큰). */
export const DAILY_PIPELINE_BUDGET_TOKENS = 2_000_000;
/** 활성 잡 만료 = DB 리스 90분(스펙 "배포와 운영" 스케줄러). */
export const BATCH_LEASE_MS = 90 * 60 * 1000;
/** 배치 기한: 시작 70분 뒤에는 모델 호출을 시작하지 않는다(잡 만료보다 짧게, #55 Ruling). */
export const BATCH_MODEL_DEADLINE_MS = 70 * 60 * 1000;
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
        readonly newArticles: number;
        readonly mergedArticles: number;
        readonly savedVersions: number;
        readonly failures: CollectResult["failures"];
      };
  readonly assignment: {
    readonly processed: number;
    readonly assigned: number;
    readonly newStories: number;
    readonly kept: number;
    readonly usage: { readonly tokens: number; readonly spend: number };
  };
  readonly pipeline: BatchReport;
  readonly published: number;
  readonly confirmed: number;
  readonly deferred: number;
  readonly failed: number;
  readonly publishFailures: readonly { readonly storyId: string; readonly reason: string }[];
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
  readonly embeddingClient: EmbeddingClient;
  readonly modelClient: ModelClient;
  readonly clock: () => Date;
  /** 발행 뒤 웹 캐시 무효화. 없으면 건너뛴다(로컬). */
  readonly invalidateCache?: (tags: readonly string[]) => Promise<void>;
  /** 구조화 JSON 로그 한 줄. 기본은 stdout. */
  readonly log?: (event: Record<string, unknown>) => void;
  readonly concurrency?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

class UnknownSlotError extends Error {
  override readonly name = "UnknownSlotError";
}

/**
 * 슬롯 하나의 배치(#55): 원장·리스 → 수집(#52) → 배정(#53) → 입력이 바뀐 사건만 `runBatch`(#54) → 발행 →
 * 캐시 무효화 → 리포트. 예산은 같은 KST 날짜의 앞선 지출(임베딩 포함)을 뺀 잔액이다.
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
        newArticles: collected.newArticles,
        mergedArticles: collected.mergedArticles,
        savedVersions: collected.savedVersions.length,
        failures: collected.failures,
      };
      stageLog("collect", { result: "ok", ...collection });
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
    const remainingUsd = Math.max(0, DAILY_PIPELINE_BUDGET_USD - spentTodayUsd);
    const { stories, sources } = await loadBatchStories(deps.db);
    const batchStartedAt = deps.clock();
    const result = await runBatch(
      {
        articles: stories.flatMap((s) => s.articles),
        now: batchStartedAt,
        dailyBudget: { tokens: DAILY_PIPELINE_BUDGET_TOKENS, spend: remainingUsd },
        sources,
        existingStories: stories.map(({ story, latestRevision, deferredSince }) => ({
          story,
          ...(latestRevision === undefined ? {} : { latestRevision }),
          ...(deferredSince === undefined ? {} : { deferredSince }),
        })),
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
    const storyById = new Map(stories.map((s) => [s.story.id, s]));
    const publishFailures: { storyId: string; reason: string }[] = [];
    const publishedStoryIds: string[] = [];
    for (const revision of result.revisions) {
      const state = storyById.get(revision.storyId);
      if (state === undefined) continue;
      try {
        // 출처·기사·기사 버전은 수집·배정이 이미 저장했다. 개정판·주장·근거만 새로 쓴다.
        await publishRevision(deps.db, {
          story: state.story,
          revision,
          articles: [],
          articleVersions: [],
          sources: [],
        });
        publishedStoryIds.push(revision.storyId);
      } catch (error) {
        publishFailures.push({
          storyId: revision.storyId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    for (const confirmed of result.confirmed) {
      await confirmRevision(deps.db, {
        revisionId: confirmed.revisionId,
        checkedAt: confirmed.checkedAt,
      });
    }
    // 실패한 사건도 표시를 지운다 — 영구히 실패하는 사건이 매 배치 맨 앞에서 예산을 먹지 않게(다음 배치에서는 보통 순서).
    await clearStoriesDeferred(deps.db, [
      ...publishedStoryIds,
      ...result.confirmed.map((c) => c.storyId),
      ...result.report.failures.map((f) => f.storyId),
    ]);
    await markStoriesDeferred(deps.db, {
      storyIds: result.report.deferredStories,
      at: batchStartedAt,
    });

    // 5. 발행 뒤 웹 캐시 무효화(오늘 + 발행된 사건의 최신 포인터).
    let cacheInvalidated = false;
    if (deps.invalidateCache !== undefined && publishedStoryIds.length > 0) {
      await deps.invalidateCache([
        TODAY_CACHE_TAG,
        ...publishedStoryIds.map((id) => `story:${id}:latest`),
      ]);
      cacheInvalidated = true;
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
      assignment,
      pipeline: result.report,
      published: publishedStoryIds.length,
      confirmed: result.confirmed.length,
      deferred: result.report.deferred,
      failed: result.report.failed + publishFailures.length,
      publishFailures,
      spend: {
        budgetUsd: DAILY_PIPELINE_BUDGET_USD,
        previousTodayUsd,
        embeddingUsd,
        modelUsd,
        totalUsd,
        budgetReached: result.report.budgetReached,
      },
      cacheInvalidated,
    };
    await finishBatchRun(deps.db, {
      slotKey: input.slotKey,
      status: "completed",
      finishedAt,
      report,
    });
    log({ at: finishedAt.toISOString(), stage: "finish", result: "completed", ...report });
    return { kind: "completed", report };
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
    stageLog("finish", {
      result: "failed",
      error: message,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      spendUsd: embeddingUsd + modelUsd,
    });
    throw error;
  }
}
