import { describe, expect, it } from "vitest";
import {
  planRechecks,
  RECHECK_DORMANT_DAILY_CAP,
  type RecheckCandidate,
} from "./recheck-schedule.ts";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = new Date("2026-09-29T08:00:00.000Z");

function candidate(
  articleId: string,
  ageMs: number,
  overrides: Partial<RecheckCandidate> & { readonly active?: boolean } = {},
): RecheckCandidate {
  const { active = true, ...rest } = overrides;
  const collectedAt = new Date(now.getTime() - ageMs);
  return {
    articleId,
    collectedAt,
    bodyExpiresAt: new Date(collectedAt.getTime() + 30 * DAY),
    isLinkOnly: false,
    story: {
      lifecycle: "활성",
      isDemo: false,
      // 활성: 마지막 신규 보도가 1시간 전. 휴면: 5일 전(72시간 창 밖).
      lastNewReportAt: new Date(now.getTime() - (active ? HOUR : 5 * DAY)),
    },
    done: [],
    ...rest,
  };
}

describe("원문 재수집 일정", () => {
  it("활성 사건 기사는 수집 12시간·60시간 뒤 한 번씩 재수집 대상", () => {
    const planned = planRechecks({
      now,
      candidates: [
        candidate("a-fresh", 11 * HOUR),
        candidate("a-12h", 12 * HOUR),
        candidate("a-12h-done", 30 * HOUR, { done: ["12h"] }),
        candidate("a-60h", 60 * HOUR, { done: ["12h"] }),
        candidate("a-60h-done", 70 * HOUR, { done: ["12h", "60h"] }),
      ],
    });
    expect(planned).toEqual([
      { articleId: "a-60h", slot: "60h" },
      { articleId: "a-12h", slot: "12h" },
    ]);
  });

  it("휴면 사건 기사는 7·14·28일째 나이대별 하루 40건까지 표본", () => {
    const sevenDay = Array.from({ length: 50 }, (_, i) =>
      candidate(`a-7d-${i}`, 7 * DAY + i * 1000, { active: false }),
    );
    const others = [
      candidate("a-6d", 6 * DAY + HOUR, { active: false }),
      candidate("a-8d", 8 * DAY + HOUR, { active: false }),
      candidate("a-14d", 14 * DAY + HOUR, { active: false }),
      candidate("a-28d", 28 * DAY + HOUR, { active: false }),
      candidate("a-28d-done", 28 * DAY + HOUR, { active: false, done: ["28d"] }),
    ];
    const planned = planRechecks({ now, candidates: [...sevenDay, ...others] });
    const seven = planned.filter((p) => p.slot === "7d");
    expect(seven).toHaveLength(RECHECK_DORMANT_DAILY_CAP);
    expect(planned.filter((p) => p.slot !== "7d")).toEqual([
      { articleId: "a-14d", slot: "14d" },
      { articleId: "a-28d", slot: "28d" },
    ]);
    // 결정론: 같은 날짜·같은 후보면 같은 표본이고, 그날 이미 한 수만큼 상한이 줄어든다.
    expect(planRechecks({ now, candidates: [...sevenDay].reverse() }).slice(0, 40)).toEqual(seven);
    const later = planRechecks({ now, candidates: sevenDay, sampledToday: { "7d": 35 } });
    expect(later).toEqual(seven.slice(0, 5));
  });

  it("본문 삭제 뒤·종료 사건·링크만 기사는 제외", () => {
    const expired = candidate("a-expired", 60 * HOUR);
    const planned = planRechecks({
      now,
      candidates: [
        { ...expired, bodyExpiresAt: new Date(now.getTime() - 1) },
        candidate("a-closed", 60 * HOUR, {
          story: { lifecycle: "종료", isDemo: false, lastNewReportAt: now },
        }),
        candidate("a-link", 60 * HOUR, { isLinkOnly: true }),
        candidate("a-demo", 60 * HOUR, {
          story: { lifecycle: "활성", isDemo: true, lastNewReportAt: now },
        }),
        candidate("a-ok", 60 * HOUR),
      ],
    });
    expect(planned).toEqual([{ articleId: "a-ok", slot: "60h" }]);
  });
});
