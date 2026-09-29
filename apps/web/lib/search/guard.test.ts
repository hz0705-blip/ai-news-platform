import { describe, expect, it } from "vitest";
import { clientIp, issueAnonCookie, searchAdmission, verifyAnonCookie } from "./guard.ts";

const SECRET = "test-anon-secret";

function admission(ip: string, now: Date, cookieId = "cookie-a") {
  return searchAdmission({ secret: SECRET, cookieId, ip, now, reserveUsd: 0 });
}

describe("익명 요청 카운터 키", () => {
  it("Vercel이 넣는 IP 헤더만 믿는다", () => {
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.1",
      "x-real-ip": "198.51.100.2",
      "x-vercel-forwarded-for": "203.0.113.5, 10.0.0.1",
    });
    expect(clientIp(headers)).toBe("203.0.113.5");
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.1" }))).toBe("unknown");
  });

  it("ip emergency cap applies across cookies — IP 키는 쿠키와 무관하고 KST 날짜마다 바뀐다", () => {
    const now = new Date("2026-09-30T03:00:00Z");
    const a = admission("203.0.113.5", now, "cookie-a");
    const b = admission("203.0.113.5", now, "cookie-b");
    expect(a.counters[1]?.key).toBe(b.counters[1]?.key);
    expect(a.counters[0]?.key).not.toBe(b.counters[0]?.key);
    const nextDay = admission("203.0.113.5", new Date("2026-09-30T15:00:00Z"), "cookie-a");
    expect(nextDay.counters[1]?.key).not.toBe(a.counters[1]?.key);
    // 키에는 원시 값이 없다.
    expect(JSON.stringify(a)).not.toContain("203.0.113.5");
    expect(JSON.stringify(a)).not.toContain("cookie-a");
  });

  it("서명한 쿠키만 받는다", () => {
    const { id, value } = issueAnonCookie(SECRET);
    expect(verifyAnonCookie(SECRET, value)).toBe(id);
    expect(verifyAnonCookie("other-secret", value)).toBeNull();
    expect(verifyAnonCookie(SECRET, `${id}.x`)).toBeNull();
    expect(verifyAnonCookie(SECRET, id)).toBeNull();
    expect(verifyAnonCookie(SECRET, undefined)).toBeNull();
  });
});
