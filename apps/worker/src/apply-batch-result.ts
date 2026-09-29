import {
  clearStoriesDeferred,
  commitRevision,
  confirmRevision,
  markStoriesDeferred,
  type RuntimeDb,
} from "@newsplatform/db";
import type { BatchResult } from "@newsplatform/pipeline";

export interface AppliedBatchResult {
  /** 커밋한(또는 이미 있던) 개정판의 사건과 새로 넣었는지. `result.revisions` 순서. */
  readonly published: readonly { readonly storyId: string; readonly inserted: boolean }[];
  readonly publishFailures: readonly { readonly storyId: string; readonly reason: string }[];
}

/**
 * 배치 결과 반영(ADR-0009, #55 `stories.deferred_at`): 개정판마다 커밋(사건마다 한 트랜잭션, 실패는 그 사건만),
 * 확인마다 확인 시각 기록, 처리한 사건의 분석 대기 표시 해제, 미룬 사건의 표시. 워커 슬롯과 데모 적재가 쓴다.
 */
export async function applyBatchResult(
  db: RuntimeDb["db"],
  result: Pick<BatchResult, "revisions" | "changes" | "confirmed"> & {
    readonly report: Pick<BatchResult["report"], "failures" | "deferredStories">;
  },
  options: { readonly deferredAt: Date },
): Promise<AppliedBatchResult> {
  const changesByRevision = new Map(result.changes.map((c) => [c.revisionId, c.changes]));
  const published: { storyId: string; inserted: boolean }[] = [];
  const publishFailures: { storyId: string; reason: string }[] = [];
  for (const revision of result.revisions) {
    try {
      // 출처·기사·기사 버전은 수집·배정(데모는 `saveDemoStoryRecords`)이 이미 저장했다.
      const { inserted } = await commitRevision(db, {
        revision,
        changes: changesByRevision.get(revision.id) ?? [],
      });
      published.push({ storyId: revision.storyId, inserted });
    } catch (error) {
      publishFailures.push({
        storyId: revision.storyId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  for (const confirmed of result.confirmed) {
    await confirmRevision(db, { revisionId: confirmed.revisionId, checkedAt: confirmed.checkedAt });
  }
  // 실패한 사건도 표시를 지운다 — 영구히 실패하는 사건이 매 배치 맨 앞에서 예산을 먹지 않게(다음 배치에서는 보통 순서).
  await clearStoriesDeferred(db, [
    ...published.map((p) => p.storyId),
    ...result.confirmed.map((c) => c.storyId),
    ...result.report.failures.map((f) => f.storyId),
  ]);
  await markStoriesDeferred(db, {
    storyIds: result.report.deferredStories,
    at: options.deferredAt,
  });
  return { published, publishFailures };
}
