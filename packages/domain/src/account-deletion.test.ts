import { describe, expect, it } from "vitest";
import { isUnlinkDone, isUnlinkOverdue, nextUnlinkAttemptAt } from "./account-deletion.ts";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const at = new Date("2026-09-29T00:00:00.000Z");
const after = (ms: number) => new Date(at.getTime() + ms);

describe("연결 해제 재시도 일정", () => {
  it("실패 1·2·3번째 뒤에는 1분·5분·30분, 그 뒤로는 매시 다시 시도한다", () => {
    expect(nextUnlinkAttemptAt(1, at)).toEqual(after(MINUTE));
    expect(nextUnlinkAttemptAt(2, at)).toEqual(after(5 * MINUTE));
    expect(nextUnlinkAttemptAt(3, at)).toEqual(after(30 * MINUTE));
    expect(nextUnlinkAttemptAt(4, at)).toEqual(after(HOUR));
    expect(nextUnlinkAttemptAt(40, at)).toEqual(after(HOUR));
  });

  it("요청 뒤 72시간이 지나도 남은 삭제 대기 행은 경고 대상이다", () => {
    expect(isUnlinkOverdue(at, after(72 * HOUR))).toBe(false);
    expect(isUnlinkOverdue(at, after(72 * HOUR + 1))).toBe(true);
  });

  it("해제됨·이미 해제됨만 완료다", () => {
    expect(isUnlinkDone({ outcome: "unlinked" })).toBe(true);
    expect(isUnlinkDone({ outcome: "already-unlinked" })).toBe(true);
    expect(isUnlinkDone({ outcome: "retry", reason: "http-503" })).toBe(false);
    expect(isUnlinkDone({ outcome: "rejected", reason: "kakao-admin-key" })).toBe(false);
  });
});
