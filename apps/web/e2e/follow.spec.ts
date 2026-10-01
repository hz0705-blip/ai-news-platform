import { authEnv, expect, test } from "./auth.ts";
import { expectNoAxeViolations } from "./axe.ts";

// 팔로우와 마지막으로 본 개정판(#105, M4 인수). 로컬 Supabase CLI가 없으면 로컬에서는 건너뛰고 CI에서는 실패한다.
if (authEnv() === null && process.env.CI) {
  throw new Error("CI e2e에는 로컬 Supabase Auth 환경변수가 있어야 한다");
}
test.skip(authEnv() === null, "로컬 Supabase가 꺼져 있다(pnpm exec supabase start)");

// 전용 E2E 복제본 ③은 개정판이 둘이다(e2e/seed.ts). 개정판 1 고정 URL에서 팔로우하면 마지막으로 본 개정판이 1이 된다.
const SLUG = "fixture-3-correction";
const LATEST = `/story/${SLUG}`;
const REVISION_1 = `${LATEST}/revision/${encodeURIComponent(`${SLUG}:rev-1`)}`;

test("M4 인수: 익명으로 사건 팔로우 → 로그인 → 팔로우됨 → 재방문 시 읽은 이후 변화와 내가 본 지점 → 팔로우 화면", async ({
  page,
  makeUser,
  signIn,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(REVISION_1);
  await page.getByRole("button", { name: "팔로우" }).click();
  const gate = page.getByRole("dialog", { name: "로그인" });
  const start = await gate.getByRole("link", { name: "카카오로 계속하기" }).getAttribute("href");
  // 돌아갈 주소는 같은 개정판과 하려던 팔로우뿐이다.
  const next = new URL(start ?? "", "http://127.0.0.1").searchParams.get("next") ?? "";
  expect(decodeURIComponent(next)).toBe(`${decodeURIComponent(REVISION_1)}?intent=follow`);

  // 제공자 로그인 대신 세션을 주입하고, 콜백이 보내는 그 돌아갈 주소로 간다.
  await signIn(page.context(), await makeUser("follow"));
  await page.goto(next);
  const follow = page.getByRole("button", { name: "팔로우" });
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  expect(new URL(page.url()).search).toBe("");

  // 팔로우 화면: 개정판 1까지 읽었고 최신은 개정판 2라 변화 있음. 데모 사건은 노출하지 않는다.
  await page.goto("/follows");
  const card = page
    .getByRole("region", { name: "팔로우한 사건" })
    .getByRole("listitem")
    .filter({ has: page.locator(`a[href="${LATEST}"]`) });
  await expect(card.getByText("읽은 이후 변화 있음")).toBeVisible();
  await expect(page.getByRole("region", { name: "데모 사건", exact: true })).toHaveCount(0);
  await expectNoAxeViolations(page, testInfo, "follows");

  // 재방문(최신 개정판): 변화 구획의 읽은 이후 변화와 개정판 띠의 내가 본 지점.
  await card.locator(`a[href="${LATEST}"]`).click();
  await expect(page).toHaveURL(new RegExp(`${LATEST}$`));
  const changes = page.getByRole("region", { name: "변화", exact: true });
  await expect(changes.getByRole("heading", { name: "읽은 이후 변화" })).toBeVisible();
  await expect(
    changes.getByText("내가 본 지점(개정판 1) 이후 개정판 1개의 변화입니다."),
  ).toBeVisible();
  await expect(changes.getByText(/^주장 변화 \d+건$/).first()).toBeVisible();
  const strip = page.getByRole("figure", { name: /개정판 이력/ }).locator("ol > li");
  await expect(strip.nth(0)).toContainText("내가 본 지점");
  await expect(strip.nth(1)).not.toContainText("내가 본 지점");
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await expectNoAxeViolations(page, testInfo, "story-signed-in");

  // 최신을 읽었으므로 팔로우 화면의 변화 있음 표기가 사라진다.
  await page.goto("/follows");
  await expect(card).toBeVisible();
  await expect(card.getByText("읽은 이후 변화 있음")).toHaveCount(0);
});

test("팔로우 해제와 토픽 팔로우, 익명의 팔로우 화면은 로그인 안내다", async ({
  page,
  makeUser,
  openAs,
}) => {
  await page.goto("/follows");
  await expect(page.getByRole("link", { name: "로그인하기" })).toHaveAttribute(
    "href",
    "/auth/login?next=%2Ffollows",
  );

  const context = await openAs(await makeUser("toggle"));
  const signedIn = await context.newPage();
  await signedIn.goto("/story/fixture-1-agreement");
  const follow = signedIn.getByRole("button", { name: "팔로우" });
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "false");

  const response = await signedIn.goto("/follows");
  expect(response?.headers()["cache-control"]).toMatch(/no-store/);
  await expect(signedIn.getByText("아직 팔로우한 사건이 없습니다")).toBeVisible();
  await expect(
    signedIn.getByRole("region", { name: "팔로우한 사건" }).getByRole("article"),
  ).toHaveCount(0);
  const topic = signedIn.getByRole("button", { name: "기술·AI" });
  await expect(topic).toHaveAttribute("aria-pressed", "false");
  await topic.click();
  await expect(topic).toHaveAttribute("aria-pressed", "true");
  await signedIn.reload();
  await expect(topic).toHaveAttribute("aria-pressed", "true");
});
