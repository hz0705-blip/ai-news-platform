import { authEnv, expect, test } from "./auth.ts";
import { expectNoAxeViolations } from "./axe.ts";

// 계정 삭제(#106, M4 인수). 로컬 Supabase CLI가 없으면 로컬에서는 건너뛰고 CI에서는 실패한다.
// E2E 사용자는 이메일·비밀번호라 제공자 연결 해제가 없다 — 방금 로그인한 세션이 재로그인을 대신한다(lib/account/deletion.ts).
// 인증 사용자 삭제는 로컬 Supabase Auth에서 실제로 돈다.
if (authEnv() === null && process.env.CI) {
  throw new Error("CI e2e에는 로컬 Supabase Auth 환경변수가 있어야 한다");
}
test.skip(authEnv() === null, "로컬 Supabase가 꺼져 있다(pnpm exec supabase start)");

const SLUG = "demo-3-correction";
const STORY = `/story/${SLUG}`;

test("M4 인수: 로그인 → 팔로우 → 계정 삭제 → 로그아웃 상태, 같은 쿠키로 개인 쓰기 거부, 팔로우 화면은 로그인 안내", async ({
  makeUser,
  openAs,
}, testInfo) => {
  const context = await openAs(await makeUser("delete"));
  const page = await context.newPage();
  await page.goto(STORY);
  const follow = page.getByRole("button", { name: "팔로우" });
  // aria-pressed가 생기면 로그인 상태의 개인 영역이 그려진 것이다(그 전의 버튼은 로그인 게이트를 연다).
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");

  await page.goto("/follows");
  await expect(page.getByRole("region", { name: "데모 사건" })).toBeVisible();
  await page.getByRole("link", { name: "계정", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "계정 삭제" })).toBeVisible();
  await expectNoAxeViolations(page, testInfo, "account");

  const copied = await context.cookies();
  // 확인란 없이는 제출되지 않는다(required).
  await page.getByRole("button", { name: "다시 로그인하고 계정 삭제" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.getByRole("checkbox", { name: "위 내용을 확인했고 계정을 삭제합니다" }).check();
  await page.getByRole("button", { name: "다시 로그인하고 계정 삭제" }).click();

  await expect(page).toHaveURL(/\/account\/deleted$/);
  await expect(page.getByRole("heading", { name: "계정을 삭제했습니다" })).toBeVisible();
  await expectNoAxeViolations(page, testInfo, "account-deleted");

  // 로그아웃 상태: 세션 없음, 팔로우 화면은 로그인 안내.
  const session = await context.request.get("/auth/session");
  expect(await session.json()).toEqual({ userId: null });
  await page.goto("/follows");
  await expect(page.getByRole("link", { name: "로그인하기" })).toBeVisible();
  await expect(page.getByRole("region", { name: "데모 사건" })).toHaveCount(0);

  // 삭제 전에 복사한 쿠키(아직 만료 전 JWT)로도 개인 쓰기와 팔로우 화면이 거부된다.
  const replay = await openAs(null);
  await replay.addCookies(copied);
  const write = await replay.request.post("/api/me/story-follow", {
    headers: { origin: new URL(page.url()).origin },
    data: { slug: SLUG, following: true },
  });
  expect(await write.json()).toEqual({ signedIn: false });
  const replayPage = await replay.newPage();
  await replayPage.goto("/follows");
  await expect(replayPage.getByRole("link", { name: "로그인하기" })).toBeVisible();
});
