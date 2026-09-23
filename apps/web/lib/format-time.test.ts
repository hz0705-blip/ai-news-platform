import { describe, expect, it } from "vitest";
import { formatAbsolute } from "./format-time.ts";

describe("formatAbsolute", () => {
  it("ko-KR·Asia/Seoul 절대 시각으로 쓴다", () => {
    const { text, dateTime } = formatAbsolute(new Date("2026-09-17T00:30:00.000Z"));
    expect(text).toBe("2026. 9. 17. 오전 9:30 KST");
    expect(dateTime).toBe("2026-09-17T00:30:00.000Z");
  });
});
