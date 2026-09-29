import { sha256Hex } from "./hash.ts";
import type { StoryLifecycle } from "./story.ts";
import { isActiveStory } from "./story-assignment.ts";

/**
 * 원문 재수집 일정(docs/spec/v1.md "개발 중 결정 항목" 원문 재수집과 변경 판별, #86).
 * 활성 사건 기사: 수집 뒤 12시간·60시간 각 1회. 휴면 사건 기사: 수집 뒤 7·14·28일째(그 날 24시간 창) 표본,
 * 나이대마다 하루(UTC 날짜) 40건 상한. 본문 삭제(보존 기한) 뒤, 종료 사건, 링크만 기사, 데모 사건은 하지 않는다.
 * 활성은 `isActiveStory`(마지막 신규 보도 뒤 72시간)로 정하고 재수집은 이 시계를 건드리지 않는다.
 *
 * 휴면 표본(#86 Ruling): 그날 창에 든 기사를 `sha256(UTC 날짜 | 나이대 | 기사 식별자)` 오름차순으로 늘어놓고,
 * 그날 그 나이대에서 이미 재수집한 수를 뺀 만큼 앞에서 고른다(결정론 시드 = 날짜).
 */
export const RECHECK_SLOTS = ["12h", "60h", "7d", "14d", "28d"] as const;
export type RecheckSlot = (typeof RECHECK_SLOTS)[number];

export type DormantRecheckSlot = "7d" | "14d" | "28d";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** 활성 사건 기사: 수집 뒤 이 시간이 지나면 한 번(늦은 쪽부터 본다). */
const ACTIVE_SLOTS: readonly { readonly slot: RecheckSlot; readonly afterMs: number }[] = [
  { slot: "60h", afterMs: 60 * HOUR_MS },
  { slot: "12h", afterMs: 12 * HOUR_MS },
];

/** 휴면 사건 기사: 수집 뒤 이 날수째(그 날 24시간 창). */
const DORMANT_SLOTS: readonly { readonly slot: DormantRecheckSlot; readonly day: number }[] = [
  { slot: "7d", day: 7 },
  { slot: "14d", day: 14 },
  { slot: "28d", day: 28 },
];

/** 휴면 표본의 나이대별 하루 상한. */
export const RECHECK_DORMANT_DAILY_CAP = 40;

/** 재수집 후보 기사 하나. `collectedAt`은 첫 기사 버전의 수집 시각, `bodyExpiresAt`은 마지막 버전의 본문 보존 기한. */
export interface RecheckCandidate {
  readonly articleId: string;
  readonly collectedAt: Date;
  readonly bodyExpiresAt: Date;
  readonly isLinkOnly: boolean;
  readonly story: {
    readonly lifecycle: StoryLifecycle;
    readonly isDemo: boolean;
    readonly lastNewReportAt: Date | undefined;
  };
  /** 이미 한 일정(재수집 결과가 미확인이어도 한 것이다). */
  readonly done: readonly RecheckSlot[];
}

export interface PlannedRecheck {
  readonly articleId: string;
  readonly slot: RecheckSlot;
}

/**
 * 이번 실행에서 재수집할 기사와 일정. 순서: 활성(수집 시각·식별자 순) → 휴면 7·14·28일(표본 순위 순).
 * 요청 몫이 모자라면 호출한 쪽이 앞에서부터 자른다. `sampledToday`는 그 UTC 날짜에 나이대별로 이미 재수집한 수.
 */
export function planRechecks(input: {
  readonly candidates: readonly RecheckCandidate[];
  readonly now: Date;
  readonly sampledToday?: Readonly<Partial<Record<DormantRecheckSlot, number>>>;
}): PlannedRecheck[] {
  const { now } = input;
  const utcDate = now.toISOString().slice(0, 10);
  const active: (PlannedRecheck & { readonly collectedAt: number })[] = [];
  const dormant = new Map<DormantRecheckSlot, { articleId: string; rank: string }[]>();

  for (const candidate of input.candidates) {
    const { story } = candidate;
    if (candidate.isLinkOnly || story.isDemo || story.lifecycle === "종료") continue;
    if (candidate.bodyExpiresAt.getTime() <= now.getTime()) continue;
    const age = now.getTime() - candidate.collectedAt.getTime();
    if (age < 0) continue;
    const done = new Set(candidate.done);

    if (isActiveStory(story.lastNewReportAt, now)) {
      const due = ACTIVE_SLOTS.find(({ afterMs }) => age >= afterMs);
      if (due !== undefined && !done.has(due.slot)) {
        active.push({
          articleId: candidate.articleId,
          slot: due.slot,
          collectedAt: candidate.collectedAt.getTime(),
        });
      }
      continue;
    }
    const ageDays = Math.floor(age / DAY_MS);
    const due = DORMANT_SLOTS.find(({ day }) => day === ageDays);
    if (due === undefined || done.has(due.slot)) continue;
    const list = dormant.get(due.slot) ?? [];
    list.push({
      articleId: candidate.articleId,
      rank: sha256Hex(`${utcDate}|${due.slot}|${candidate.articleId}`),
    });
    dormant.set(due.slot, list);
  }

  active.sort(
    (a, b) =>
      a.collectedAt - b.collectedAt ||
      (a.articleId < b.articleId ? -1 : a.articleId > b.articleId ? 1 : 0),
  );
  const planned: PlannedRecheck[] = active.map(({ articleId, slot }) => ({ articleId, slot }));
  for (const { slot } of DORMANT_SLOTS) {
    const room = Math.max(0, RECHECK_DORMANT_DAILY_CAP - (input.sampledToday?.[slot] ?? 0));
    const ranked = (dormant.get(slot) ?? []).sort((a, b) =>
      a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0,
    );
    for (const { articleId } of ranked.slice(0, room)) planned.push({ articleId, slot });
  }
  return planned;
}
