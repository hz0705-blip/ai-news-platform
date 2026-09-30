import type { ChangeKind } from "@newstrail/domain";
import type { RevisionStripItemView } from "./story-view.ts";

/** "읽은 이후 변화": 마지막으로 본 개정판 뒤 개정판들의 변화 종류별 개수 합(스펙 "마지막으로 본 개정판", #105). */
export interface SinceLastSeen {
  readonly lastSeenRevisionNumber: number;
  /** 마지막으로 본 개정판 뒤, 지금 보이는 개정판까지의 개정판 수. 0이면 읽은 이후 새 개정판이 없다. */
  readonly revisionCount: number;
  /** 변화 종류별 합(띠의 종류 순서, 0 포함). */
  readonly counts: readonly { readonly kind: ChangeKind; readonly count: number }[];
}

/**
 * 개정판 띠(지금 보이는 개정판까지, 번호 오름차순)와 마지막으로 본 개정판에서 읽은 이후 변화를 합산한다.
 * 본 적 없는 사건(`null`)은 기준이 없으므로 `undefined`다 — 사건 전체가 처음이라 "읽은 이후"를 따로 보이지 않는다(Ruling).
 * 마지막으로 본 개정판이 띠에 없으면(옛 개정판 고정 URL에서 그보다 뒤를 이미 읽었다) 역시 `undefined`.
 */
export function changesSinceLastSeen(
  revisions: readonly RevisionStripItemView[],
  lastSeenRevisionId: string | null,
): SinceLastSeen | undefined {
  if (lastSeenRevisionId === null) return undefined;
  const seen = revisions.find((r) => r.id === lastSeenRevisionId);
  if (seen === undefined) return undefined;
  const after = revisions.filter((r) => r.revisionNumber > seen.revisionNumber);
  const counts = seen.counts.map(({ kind }) => ({
    kind,
    count: after.reduce((sum, r) => sum + (r.counts.find((c) => c.kind === kind)?.count ?? 0), 0),
  }));
  return { lastSeenRevisionNumber: seen.revisionNumber, revisionCount: after.length, counts };
}
