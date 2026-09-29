import { admitAnonymousRequest, settleAnonymousRequest } from "@newsplatform/db";
import { createOpenAiEmbeddingClient } from "@newsplatform/pipeline/embedding";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestOrigin } from "../../../lib/auth/urls.ts";
import { getRuntimeDb } from "../../../lib/db.ts";
import type { SearchRequest, SearchResponse } from "../../../lib/search/api.ts";
import {
  ANON_COOKIE,
  ANON_COOKIE_MAX_AGE_SECONDS,
  clientIp,
  issueAnonCookie,
  SEARCH_EMBEDDING_MAX_RETRIES,
  SEARCH_EMBEDDING_TIMEOUT_MS,
  searchAdmission,
  verifyAnonCookie,
} from "../../../lib/search/guard.ts";
import {
  createStorySearch,
  normalizeSearchQuery,
  searchReservationUsd,
} from "../../../lib/search/search.ts";

const input: z.ZodType<SearchRequest> = z.object({ query: z.string().max(2000) });

/** 요청마다 한 줄. 질의·IP·쿠키 원문은 넣지 않는다(오류는 이름만). */
function log(event: Record<string, unknown>): void {
  console.info(JSON.stringify({ stage: "search", ...event }));
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

/**
 * 검색 실행 경로(#125, 익명): 같은 출처 JSON POST `{ query }` → 사건 목록. 응답은 모두 `private, no-store`이고, 남용 방지
 * 쿠키(lib/search/guard.ts)는 이 경로에서만 발급한다(공개 캐시 응답에는 `Set-Cookie`가 없다). 순서: 설정 확인(비밀·모델 키가
 * 없으면 503) → 출처·질의 검증 → 카운터·동시 한도·예산 예약(한 트랜잭션, 오류면 503) → 질의 임베딩·검색 → 정산.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const started = Date.now();
  const respond = (
    body: SearchResponse,
    status: number,
    extra?: { readonly retryAfter?: number; readonly cookie?: string },
  ) => {
    const response = NextResponse.json(body, { status });
    response.headers.set("Cache-Control", "private, no-store");
    if (extra?.retryAfter !== undefined) {
      response.headers.set("Retry-After", String(extra.retryAfter));
    }
    if (extra?.cookie !== undefined) {
      response.cookies.set(ANON_COOKIE, extra.cookie, {
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "lax",
        maxAge: ANON_COOKIE_MAX_AGE_SECONDS,
      });
    }
    log({ result: body.state, status, ms: Date.now() - started });
    return response;
  };

  const secret = process.env.ANON_REQUEST_SECRET;
  const apiKey = process.env.OPENAI_API_KEY;
  if (secret === undefined || secret === "" || apiKey === undefined || apiKey === "") {
    return respond({ state: "unavailable" }, 503);
  }
  if (request.headers.get("origin") !== requestOrigin(request)) {
    return respond({ state: "forbidden" }, 403);
  }
  const parsed = input.safeParse(await request.json().catch(() => undefined));
  const query = parsed.success ? normalizeSearchQuery(parsed.data.query) : null;
  if (query === null) return respond({ state: "invalid" }, 400);

  const existing = verifyAnonCookie(secret, request.cookies.get(ANON_COOKIE)?.value);
  const issued = existing === null ? issueAnonCookie(secret) : undefined;
  const cookieId = existing ?? issued?.id ?? "";
  const withCookie = issued === undefined ? {} : { cookie: issued.value };
  const reserveUsd = searchReservationUsd(query);
  const { db } = getRuntimeDb();

  let admission: Awaited<ReturnType<typeof admitAnonymousRequest>>;
  try {
    admission = await admitAnonymousRequest(
      db,
      searchAdmission({
        secret,
        cookieId,
        ip: clientIp(request.headers),
        now: new Date(),
        reserveUsd,
      }),
    );
  } catch (error) {
    log({ result: "error", step: "counter", error: errorName(error) });
    return respond({ state: "unavailable" }, 503, withCookie);
  }
  if (!admission.admitted) {
    const state = admission.reason === "budget-exhausted" ? "search-limit" : "rate-limited";
    return respond({ state }, 429, {
      retryAfter: admission.retryAfterSeconds,
      ...withCookie,
    });
  }

  // 모델 호출이 실패하거나 제한 시간(8초, 재시도 없음)을 넘기면 과금 여부를 모르므로 예약액을 지출로 센다.
  let spentUsd = admission.reservedUsd;
  try {
    const search = createStorySearch({
      db,
      embeddingClient: createOpenAiEmbeddingClient({
        apiKey,
        timeoutMs: SEARCH_EMBEDDING_TIMEOUT_MS,
        maxRetries: SEARCH_EMBEDDING_MAX_RETRIES,
      }),
    });
    const outcome = await search.search(query);
    spentUsd = outcome.spendUsd;
    return respond(
      {
        state: "ok",
        stories: outcome.stories.map((hit) => ({
          slug: hit.slug,
          title: hit.title,
          updatedAt: hit.updatedAt.toISOString(),
          isDemo: hit.isDemo,
          lifecycle: hit.lifecycle,
          claims: hit.claims.map((c) => ({ claimId: c.claimId, text: c.text })),
        })),
      },
      200,
      withCookie,
    );
  } catch (error) {
    log({ result: "error", step: "search", error: errorName(error) });
    return respond({ state: "unavailable" }, 503, withCookie);
  } finally {
    await settleAnonymousRequest(db, admission, spentUsd).catch((error: unknown) =>
      log({ result: "error", step: "settle", error: errorName(error) }),
    );
  }
}
