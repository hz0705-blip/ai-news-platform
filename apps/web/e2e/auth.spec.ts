import type { APIRequestContext, BrowserContext } from "@playwright/test";
import { authEnv, expect, test } from "./auth.ts";
import { expectNoAxeViolations } from "./axe.ts";

// 인증 이음새(#104). 로컬 Supabase CLI가 없으면 로컬에서는 건너뛰고 CI에서는 실패한다.
if (authEnv() === null && process.env.CI) {
  throw new Error("CI e2e에는 로컬 Supabase Auth 환경변수가 있어야 한다");
}
test.skip(authEnv() === null, "로컬 Supabase가 꺼져 있다(pnpm exec supabase start)");

const STORY_URL = "/story/demo-1-agreement";
const KAKAOTALK_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5";

async function sessionUserId(request: APIRequestContext): Promise<string | null> {
  const response = await request.get("/auth/session");
  expect(response.headers()["cache-control"]).toMatch(/private/);
  expect(response.headers()["cache-control"]).toMatch(/no-store/);
  return ((await response.json()) as { userId: string | null }).userId;
}

async function logout(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto(`/auth/login?next=${encodeURIComponent(STORY_URL)}`);
  await page.getByRole("main").getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(new RegExp(`${STORY_URL}$`));
  await page.close();
}

test("주입한 세션으로 로그인 상태가 요청 시점 영역에 보이고 로그아웃 뒤 사라진다", async ({
  makeUser,
  openAs,
}) => {
  const context = await openAs(await makeUser("a"));
  const page = await context.newPage();
  await page.goto(`/auth/login?next=${encodeURIComponent(STORY_URL)}`);
  await expect(page.getByText("로그인되어 있습니다.")).toBeVisible();

  await page.getByRole("main").getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(new RegExp(`${STORY_URL}$`));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.goto("/auth/login");
  await expect(page.getByText("로그인되어 있습니다.")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "카카오로 계속하기" })).toBeVisible();
  expect(await sessionUserId(context.request)).toBeNull();
});

test("두 컨텍스트 A/B는 신원을 공유하지 않고, 로그아웃한 세션의 토큰은 다시 보내도 거부된다", async ({
  makeUser,
  openAs,
}) => {
  const a = await makeUser("a");
  const b = await makeUser("b");
  const contextA = await openAs(a);
  const contextB = await openAs(b);
  expect(await sessionUserId(contextA.request)).toBe(a.id);
  expect(await sessionUserId(contextB.request)).toBe(b.id);

  const copied = await contextA.cookies();
  await logout(contextA);
  expect(await sessionUserId(contextA.request)).toBeNull();
  expect(await sessionUserId(contextB.request)).toBe(b.id);

  // 서명·만료가 유효한 토큰이라도 session_id의 세션이 지워졌으면 현재 사용자 헬퍼가 거부한다.
  const replay = await openAs(null);
  await replay.addCookies(copied);
  expect(await sessionUserId(replay.request)).toBeNull();
});

test("오늘·사건 공개 응답에 Set-Cookie·사용자 상태가 없다", async ({ makeUser, openAs }) => {
  const user = await makeUser("public");
  const context = await openAs(user);
  const before = await context.cookies();
  const page = await context.newPage();
  const setCookies: string[] = [];
  page.on("response", async (response) => {
    const header = await response.headerValue("set-cookie");
    if (header !== null) setCookies.push(`${response.url()} ${header}`);
  });
  for (const path of ["/", STORY_URL]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    const body = (await response?.text()) ?? "";
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toContain(user.id);
    expect(body).not.toContain(user.email);
    expect(body).not.toContain("로그인되어 있습니다");
    await page.waitForLoadState("networkidle");
  }
  expect(setCookies).toEqual([]);
  expect(await context.cookies()).toEqual(before);
});

test("익명 사용자가 로그인 게이트를 열고 취소하면 같은 사건 페이지 읽기로 돌아간다", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(STORY_URL);
  const follow = page.getByRole("button", { name: "팔로우" });
  await follow.click();

  const gate = page.getByRole("dialog", { name: "로그인" });
  await expect(gate).toBeVisible();
  await expect(
    gate.getByText("14세 이상만 계정을 만들 수 있습니다.", { exact: false }),
  ).toBeVisible();
  // 돌아갈 주소는 같은 사건과 하려던 팔로우(#105)뿐이다.
  const next = encodeURIComponent(`${STORY_URL}?intent=follow`);
  await expect(gate.getByRole("link", { name: "카카오로 계속하기" })).toHaveAttribute(
    "href",
    `/auth/login/start?provider=kakao&next=${next}`,
  );
  await expect(gate.getByRole("link", { name: "Google로 계속하기" })).toHaveAttribute(
    "href",
    `/auth/login/start?provider=google&next=${next}`,
  );
  await expectNoAxeViolations(page, testInfo, "login-gate");

  await gate.getByRole("button", { name: "취소" }).click();
  await expect(gate).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`${STORY_URL}$`));
  await expect(follow).toBeFocused();
  await expect(page.getByRole("region", { name: "주장" })).toBeVisible();
});

test("KakaoTalk 인앱에서 Google을 고르면 외부 브라우저 안내가 같은 출처 로그인 시작 URL을 건넨다", async ({
  openAs,
  baseURL,
}, testInfo) => {
  const context = await openAs(null, { userAgent: KAKAOTALK_UA });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(STORY_URL);
  await page.getByRole("button", { name: "팔로우" }).click();
  const gate = page.getByRole("dialog", { name: "로그인" });
  await gate.getByRole("link", { name: "Google로 계속하기" }).click();

  const heading = gate.getByRole("heading", { name: "외부 브라우저에서 Google 로그인" });
  await expect(heading).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`${STORY_URL}$`));
  const start = `${baseURL}/auth/login/start?provider=google&next=${encodeURIComponent(`${STORY_URL}?intent=follow`)}`;
  await expect(gate.getByRole("link", { name: "외부 브라우저로 열기" })).toHaveAttribute(
    "href",
    `kakaotalk://web/openExternal?url=${encodeURIComponent(start)}`,
  );
  await expect(gate.getByRole("button", { name: "링크 복사" })).toBeVisible();
  await expect(gate.getByText("다른 브라우저로 열기", { exact: false })).toBeVisible();
  await expectNoAxeViolations(page, testInfo, "in-app-notice");
});

test("Google 로그인 시작은 PKCE 인가 요청으로 보내고 콜백은 정확히 같은 출처 /auth/callback이다", async ({
  page,
  baseURL,
}) => {
  const response = await page.request.get(
    `/auth/login/start?provider=google&next=${encodeURIComponent(STORY_URL)}`,
    { maxRedirects: 0 },
  );
  expect(response.status()).toBe(303);
  expect(response.headers()["cache-control"]).toMatch(/private/);
  expect(response.headers()["cache-control"]).toMatch(/no-store/);
  const authorize = new URL(response.headers().location ?? "");
  expect(authorize.origin).toBe(authEnv()?.url);
  expect(authorize.pathname).toBe("/auth/v1/authorize");
  expect(authorize.searchParams.get("provider")).toBe("google");
  expect(authorize.searchParams.get("redirect_to")).toBe(`${baseURL}/auth/callback`);
  expect(authorize.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43,}$/);
  expect(authorize.searchParams.get("code_challenge_method")?.toLowerCase()).toBe("s256");
  // PKCE 검증자와 돌아갈 주소가 이 브라우저 컨텍스트에 남는다(콜백이 읽는다).
  const names = (await page.context().cookies()).map((cookie) => cookie.name);
  expect(names.some((name) => name.endsWith("-code-verifier"))).toBe(true);
  expect(names).toContain("auth-return-path");
});

test("콜백은 잘못된 코드를 로그인 화면으로 돌리고 인증 응답은 private, no-store다", async ({
  page,
}) => {
  const response = await page.request.get("/auth/callback?code=not-a-code", { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(response.headers()["cache-control"]).toMatch(/private/);
  expect(response.headers()["cache-control"]).toMatch(/no-store/);
  expect(response.headers().location).toMatch(/\/auth\/login\?next=%2F&error=failed$/);

  await page.goto("/auth/callback?code=not-a-code");
  await expect(page.getByText("로그인을 완료하지 못했습니다.", { exact: false })).toBeVisible();
});
