import {
  addGnewsRequests,
  loadDormantSampledToday,
  loadGnewsLedgerDay,
  loadRecheckCandidates,
  loadRecheckTargets,
  type RuntimeDb,
  saveRecheckResult,
} from "@newstrail/db";
import {
  articleVersionIdFor,
  canStartRecheck,
  GNEWS_RECHECK_SHARE,
  type GnewsLedgerDay,
  gnewsLedgerDate,
  gnewsLedgerRemaining,
  judgeRecheckedBody,
  NORMALIZATION_VERSION,
  planRechecks,
} from "@newstrail/domain";
import { type CollectGnewsDeps, searchByExactTitle } from "@newstrail/pipeline";

/** 원문 재수집 단계의 배치 리포트(#86). */
export interface RecheckStageReport {
  /** 일정상 오늘 재수집 대상인 기사 수(몫으로 자르기 전). */
  readonly due: number;
  readonly attempted: number;
  readonly found: number;
  readonly unconfirmed: number;
  /** 요청 자체가 실패한 수(429·5xx·네트워크). 미확인이 아니며 일정을 기록하지 않아 다음 실행에 다시 한다. */
  readonly requestFailures: number;
  readonly newVersions: number;
  readonly correctionCandidates: number;
  /** 이 단계가 보낸 GNews 요청 수(재시도 포함). */
  readonly requestCount: number;
  /** 원장 잔량: 끝난 뒤 그 UTC 날짜의 일 한도 잔량과 재수집 몫 잔량. */
  readonly ledger: {
    readonly utcDate: string;
    readonly remaining: number;
    readonly recheckRemaining: number;
  };
  /** 재수집 몫(또는 일 한도)에 닿아 멈췄는가. */
  readonly stoppedByLedger: boolean;
  /** 새 버전이 생겨 재처리 대상으로 올린 사건. */
  readonly storyIds: readonly string[];
}

/**
 * 원문 재수집 단계(#86): 일정(`planRechecks`) → 원장 몫 확인 → GNews 정확 제목 조회 → 판정(`judgeRecheckedBody`)
 * → 저장(일정 기록·새 기사 버전·사건 재처리 대상). 배치에서 수집 뒤, 사건 재처리 전에 돈다.
 * 요청은 한 번에 하나씩 보내고 매번 원장에 더하며, 몫을 다 쓰면 남은 대상은 다음 실행으로 넘긴다(일정 기록을 남기지 않는다).
 */
export async function runRecheckStage(
  input: { readonly now: Date },
  deps: {
    readonly db: RuntimeDb["db"];
    readonly gnews: CollectGnewsDeps;
    readonly clock: () => Date;
  },
): Promise<RecheckStageReport> {
  const { db } = deps;
  const utcDate = gnewsLedgerDate(input.now);
  const planned = planRechecks({
    candidates: await loadRecheckCandidates(db, input.now),
    now: input.now,
    sampledToday: await loadDormantSampledToday(db, utcDate),
  });
  const targets = new Map(
    (await loadRecheckTargets(db, [...new Set(planned.map((p) => p.articleId))])).map((t) => [
      t.articleId,
      t,
    ]),
  );

  let day: GnewsLedgerDay = await loadGnewsLedgerDay(db, utcDate);
  const counts = {
    attempted: 0,
    found: 0,
    unconfirmed: 0,
    requestFailures: 0,
    newVersions: 0,
    correctionCandidates: 0,
    requestCount: 0,
  };
  const storyIds = new Set<string>();
  let stoppedByLedger = false;

  for (const plan of planned) {
    const target = targets.get(plan.articleId);
    if (target === undefined) continue;
    // 실행이 UTC 자정을 넘기면 새 날짜의 원장으로 센다.
    const date = gnewsLedgerDate(deps.clock());
    if (date !== day.utcDate) day = await loadGnewsLedgerDay(db, date);
    if (!canStartRecheck(day)) {
      stoppedByLedger = true;
      break;
    }
    counts.attempted++;
    const { result, requestCount, error } = await searchByExactTitle(target, deps.gnews);
    await addGnewsRequests(db, { utcDate: day.utcDate, purpose: "recheck", count: requestCount });
    day = { ...day, recheck: day.recheck + requestCount };
    counts.requestCount += requestCount;
    const checkedAt = deps.clock();

    // 요청 자체가 실패했으면(429·5xx·네트워크) 못 찾은 것이 아니므로 일정을 기록하지 않고 다음 실행에 다시 한다.
    if (error !== undefined) {
      counts.requestFailures++;
      continue;
    }
    if (result.kind === "unconfirmed") {
      counts.unconfirmed++;
      await saveRecheckResult(db, {
        articleId: target.articleId,
        storyId: target.storyId,
        slot: plan.slot,
        checkedAt,
        outcome: "미확인",
      });
      continue;
    }
    counts.found++;
    const judged = judgeRecheckedBody(target.latest, result.article.content);
    const inserted = await saveRecheckResult(db, {
      articleId: target.articleId,
      storyId: target.storyId,
      slot: plan.slot,
      checkedAt,
      outcome: "찾음",
      ...(judged.kind === "새 버전"
        ? {
            newVersion: {
              version: {
                id: articleVersionIdFor(target.articleId, judged.bodyHash),
                articleId: target.articleId,
                body: judged.body,
                normalizationVersion: NORMALIZATION_VERSION,
                bodyHash: judged.bodyHash,
                capturedAt: checkedAt,
              },
              publishedAt: target.publishedAt,
              correctionCandidate: judged.change === "정정 후보",
            },
          }
        : {}),
    });
    if (inserted && judged.kind === "새 버전") {
      counts.newVersions++;
      if (judged.change === "정정 후보") counts.correctionCandidates++;
      storyIds.add(target.storyId);
    }
  }

  return {
    due: planned.length,
    ...counts,
    ledger: {
      utcDate: day.utcDate,
      remaining: gnewsLedgerRemaining(day),
      recheckRemaining: Math.max(0, GNEWS_RECHECK_SHARE - day.recheck),
    },
    stoppedByLedger,
    storyIds: [...storyIds],
  };
}
