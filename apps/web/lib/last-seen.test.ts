import type { ChangeKind } from "@newstrail/domain";
import { describe, expect, it } from "vitest";
import { changesSinceLastSeen } from "./last-seen.ts";
import type { RevisionStripItemView } from "./story-view.ts";

const KINDS: ChangeKind[] = ["주장 추가·삭제·수정", "상충 상태 변화", "원문 변경", "출처 추가"];

function revision(n: number, counts: number[]): RevisionStripItemView {
  return {
    id: `s:rev-${n}`,
    revisionNumber: n,
    href: `/story/s/revision/s%3Arev-${n}`,
    publishedAt: new Date(Date.UTC(2026, 8, 20, n)),
    isCurrent: false,
    counts: KINDS.map((kind, i) => ({ kind, count: counts[i] ?? 0 })),
  };
}

const strip = [revision(1, []), revision(2, [2, 1, 0, 3]), revision(3, [1, 0, 1, 2])];

describe("changesSinceLastSeen — 읽은 이후 변화", () => {
  it("마지막으로 본 개정판 뒤 개정판들의 변화를 종류별로 합산한다", () => {
    expect(changesSinceLastSeen(strip, "s:rev-1")).toEqual({
      lastSeenRevisionNumber: 1,
      revisionCount: 2,
      counts: [
        { kind: "주장 추가·삭제·수정", count: 3 },
        { kind: "상충 상태 변화", count: 1 },
        { kind: "원문 변경", count: 1 },
        { kind: "출처 추가", count: 5 },
      ],
    });
  });

  it("지금 보이는 개정판을 이미 봤으면 새 개정판 0개, 변화 0이다", () => {
    expect(changesSinceLastSeen(strip, "s:rev-3")).toMatchObject({
      lastSeenRevisionNumber: 3,
      revisionCount: 0,
      counts: KINDS.map((kind) => ({ kind, count: 0 })),
    });
  });

  it("본 적 없는 사건은 기준이 없어 읽은 이후 변화가 없다(undefined)", () => {
    expect(changesSinceLastSeen(strip, null)).toBeUndefined();
  });

  it("마지막으로 본 개정판이 지금 보이는 개정판보다 뒤라 띠에 없으면 undefined다", () => {
    expect(changesSinceLastSeen(strip.slice(0, 2), "s:rev-3")).toBeUndefined();
  });
});
