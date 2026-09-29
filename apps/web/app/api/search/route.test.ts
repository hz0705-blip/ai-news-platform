import type { AdmitInput, AdmitResult, StorySearchHit } from "@newsplatform/db";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { admit, settle, searchDb, embed, clientOptions } = vi.hoisted(() => ({
  admit: vi.fn<(db: unknown, input: AdmitInput) => Promise<AdmitResult>>(),
  settle: vi.fn<(db: unknown, admitted: unknown, spent: number) => Promise<void>>(),
  searchDb: vi.fn<() => Promise<StorySearchHit[]>>(),
  embed: vi.fn(),
  clientOptions: [] as unknown[],
}));

vi.mock("@newsplatform/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@newsplatform/db")>()),
  admitAnonymousRequest: admit,
  settleAnonymousRequest: settle,
  searchStoriesByEmbedding: searchDb,
  createRuntimeDb: () => ({ db: {}, sql: {} }),
}));
vi.mock("@newsplatform/pipeline/embedding", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@newsplatform/pipeline/embedding")>()),
  createOpenAiEmbeddingClient: (options: unknown) => {
    clientOptions.push(options);
    return { embed };
  },
}));

const { POST } = await import("./route.ts");
const { ANON_COOKIE, issueAnonCookie } = await import("../../../lib/search/guard.ts");

const SECRET = "test-anon-secret";
const QUERY = "태풍 피해 복구";
const IP = "203.0.113.77";

const ADMITTED: AdmitResult = {
  admitted: true,
  leaseId: "00000000-0000-4000-8000-000000000001",
  budgetKind: "search",
  kstDate: "2026-09-30",
  reservedUsd: 0.00001,
};

const HIT: StorySearchHit = {
  storyId: "story-typhoon",
  slug: "typhoon",
  title: "태풍 상륙",
  updatedAt: new Date("2026-09-29T00:00:00Z"),
  isDemo: false,
  lifecycle: "종료",
  score: 0.8,
  claims: [{ claimId: "c1", text: "태풍이 상륙했다.", score: 0.8 }],
};

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://web.test/api/search", {
    method: "POST",
    headers: {
      host: "web.test",
      origin: "http://web.test",
      "content-type": "application/json",
      "x-vercel-forwarded-for": IP,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/search", () => {
  beforeEach(() => {
    process.env.ANON_REQUEST_SECRET = SECRET;
    process.env.OPENAI_API_KEY = "sk-test";
    admit.mockResolvedValue(ADMITTED);
    settle.mockResolvedValue();
    searchDb.mockResolvedValue([HIT]);
    embed.mockResolvedValue({ vectors: [[1, 0]], usage: { tokens: 5, spend: 0.0000001 } });
  });
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.ANON_REQUEST_SECRET;
    delete process.env.OPENAI_API_KEY;
  });

  it("질의를 임베딩해 사건 목록을 돌려주고 새 쿠키를 발급하며 실제 비용으로 정산한다", async () => {
    const response = await POST(post({ query: QUERY }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      state: "ok",
      stories: [
        {
          slug: "typhoon",
          title: "태풍 상륙",
          updatedAt: "2026-09-29T00:00:00.000Z",
          isDemo: false,
          lifecycle: "종료",
          claims: [{ claimId: "c1", text: "태풍이 상륙했다." }],
        },
      ],
    });
    expect(embed).toHaveBeenCalledWith([QUERY]);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^__Host-anon-id=/);
    expect(setCookie).toMatch(/Max-Age=86400/);
    expect(setCookie).toMatch(/Path=\//);
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(settle).toHaveBeenCalledWith({}, ADMITTED, 0.0000001);
    // 예약은 호출 전에 한다: 입장이 임베딩보다 먼저다.
    expect(admit.mock.invocationCallOrder[0]).toBeLessThan(embed.mock.invocationCallOrder[0] ?? 0);
    expect(admit.mock.calls[0]?.[1].budget).toMatchObject({ kind: "search", capUsd: 0.1 });
  });

  it("서명이 맞는 쿠키는 그대로 쓰고 다시 발급하지 않는다", async () => {
    const { value } = issueAnonCookie(SECRET);
    const first = await POST(post({ query: QUERY }, { cookie: `${ANON_COOKIE}=${value}` }));
    expect(first.headers.get("set-cookie")).toBeNull();
    const second = await POST(post({ query: QUERY }, { cookie: `${ANON_COOKIE}=${value}` }));
    // 같은 쿠키 → 같은 카운터 키.
    expect(admit.mock.calls[1]?.[1].counters[0]?.key).toBe(
      admit.mock.calls[0]?.[1].counters[0]?.key,
    );
    expect(second.status).toBe(200);
    // 서명이 틀리면 새로 발급한다.
    const forged = await POST(post({ query: QUERY }, { cookie: `${ANON_COOKIE}=abc.forged` }));
    expect(forged.headers.get("set-cookie")).toMatch(/^__Host-anon-id=/);
  });

  it("rejects empty and over 200 code point queries", async () => {
    for (const query of ["", "   ", "가".repeat(201), "😀".repeat(201)]) {
      const response = await POST(post({ query }));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ state: "invalid" });
    }
    expect((await POST(post("not json"))).status).toBe(400);
    expect(admit).not.toHaveBeenCalled();
    // 200 코드 포인트는 받는다(UTF-16으로는 400 단위인 보조 평면 문자 포함). NFC로 정규화해 임베딩한다.
    expect((await POST(post({ query: "😀".repeat(200) }))).status).toBe(200);
    await POST(post({ query: "가" }));
    expect(embed).toHaveBeenLastCalledWith(["가"]);
  });

  it("교차 출처 요청은 403이고 아무것도 하지 않는다", async () => {
    const response = await POST(post({ query: QUERY }, { origin: "https://evil.test" }));
    expect(response.status).toBe(403);
    expect(admit).not.toHaveBeenCalled();
  });

  it("cookie per-minute limit returns 429 with Retry-After", async () => {
    admit.mockResolvedValue({ admitted: false, reason: "rate-limited", retryAfterSeconds: 42 });
    const response = await POST(post({ query: QUERY }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect(await response.json()).toEqual({ state: "rate-limited" });
    expect(embed).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
    const [{ counters, concurrency }] = [admit.mock.calls[0]?.[1] as AdmitInput];
    expect(counters.map((c) => c.limits)).toEqual([
      [
        { window: "minute", max: 10 },
        { window: "day", max: 100 },
      ],
      [
        { window: "minute", max: 60 },
        { window: "day", max: 5000 },
      ],
    ]);
    expect(concurrency.max).toBe(2);
  });

  it("search budget exhausted returns search-limit state", async () => {
    admit.mockResolvedValue({
      admitted: false,
      reason: "budget-exhausted",
      retryAfterSeconds: 3600,
    });
    const response = await POST(post({ query: QUERY }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("3600");
    expect(await response.json()).toEqual({ state: "search-limit" });
    expect(embed).not.toHaveBeenCalled();
  });

  it("counter failure returns 503", async () => {
    admit.mockRejectedValue(new Error("canceling statement due to statement timeout"));
    const response = await POST(post({ query: QUERY }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ state: "unavailable" });
    expect(embed).not.toHaveBeenCalled();
  });

  it("비밀이나 모델 키가 없으면 503이고 카운터·모델을 부르지 않는다", async () => {
    delete process.env.ANON_REQUEST_SECRET;
    expect((await POST(post({ query: QUERY }))).status).toBe(503);
    process.env.ANON_REQUEST_SECRET = SECRET;
    delete process.env.OPENAI_API_KEY;
    const response = await POST(post({ query: QUERY }));
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(admit).not.toHaveBeenCalled();
  });

  it("모델 호출이 실패하면 503이고 예약액을 지출로 정산한다", async () => {
    embed.mockRejectedValue(new Error("upstream"));
    const response = await POST(post({ query: QUERY }));
    expect(response.status).toBe(503);
    expect(settle).toHaveBeenCalledWith({}, ADMITTED, ADMITTED.reservedUsd);
  });

  it("logs contain no raw query ip or cookie", async () => {
    const lines: string[] = [];
    const capture = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(capture),
    );
    try {
      const { value } = issueAnonCookie(SECRET);
      const cookie = { cookie: `${ANON_COOKIE}=${value}` };
      await POST(post({ query: QUERY }, cookie));
      embed.mockRejectedValueOnce(new Error(`failed for ${QUERY}`));
      await POST(post({ query: QUERY }, cookie));
      admit.mockRejectedValueOnce(new Error(`counter ${IP}`));
      await POST(post({ query: QUERY }, cookie));
      settle.mockRejectedValueOnce(new Error(`settle ${value}`));
      await POST(post({ query: QUERY }, cookie));
      admit.mockResolvedValueOnce({
        admitted: false,
        reason: "rate-limited",
        retryAfterSeconds: 1,
      });
      await POST(post({ query: QUERY }, cookie));
      await POST(post({ query: "" }, cookie));

      expect(lines.length).toBeGreaterThanOrEqual(6);
      const all = lines.join("\n");
      for (const secret of [QUERY, IP, value, value.split(".")[0] ?? value]) {
        expect(all).not.toContain(secret);
      }
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it("질의 임베딩이 제한 시간(8초, 재시도 없음)을 넘기면 503이고 예약액으로 정산해 동시 행을 푼다", async () => {
    // 느린 스텁: SDK가 제한 시간에 요청을 끊는 것처럼 늦게 실패한다.
    embed.mockImplementation(
      () =>
        new Promise((_, reject) => setTimeout(() => reject(new Error("Request timed out.")), 30)),
    );
    const response = await POST(post({ query: QUERY }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ state: "unavailable" });
    expect(clientOptions.at(-1)).toMatchObject({ timeoutMs: 8000, maxRetries: 0 });
    expect(settle).toHaveBeenCalledWith({}, ADMITTED, ADMITTED.reservedUsd);
  });
});
