import type { Page } from "@playwright/test";
import { authEnv, test as authTest, expect } from "./auth.ts";
import { expectNoAxeViolations } from "./axe.ts";
import { stageFollowStory } from "./follow-story.ts";
import { expectReflow } from "./reflow.ts";

const test = authTest.extend<{ followStory: Awaited<ReturnType<typeof stageFollowStory>> }>({
  followStory: async ({ request }, use) => {
    const story = await stageFollowStory();
    try {
      await use(story);
    } finally {
      await story.close();
      await request.post("/api/revalidate", {
        headers: { authorization: "Bearer e2e-follow-publish" },
        data: { tags: ["today:ko"], immediate: true },
      });
    }
  },
});

// 팔로우와 마지막으로 본 개정판(#105, M4 인수). 로컬 Supabase CLI가 없으면 로컬에서는 건너뛰고 CI에서는 실패한다.
if (authEnv() === null && process.env.CI) {
  throw new Error("CI e2e에는 로컬 Supabase Auth 환경변수가 있어야 한다");
}
test.skip(authEnv() === null, "로컬 Supabase가 꺼져 있다(pnpm exec supabase start)");

test("M4 인수: 팔로우 뒤 새 개정판 발행 → 읽은 이후 변화 → 조회·저장 실패 복구 → 재방문", async ({
  page,
  makeUser,
  signIn,
  followStory,
}, testInfo) => {
  const STORY = `/story/${followStory.slug}`;
  const LATEST = `${STORY}/revision/${encodeURIComponent(followStory.revision2)}`;
  const REVISION_1 = `${STORY}/revision/${encodeURIComponent(followStory.revision1)}`;
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
  await expect(follow).toHaveText("팔로우 중");
  await expect(page.getByRole("link", { name: "개정판 1부터 변화 추적" })).toBeVisible();
  expect(new URL(page.url()).search).toBe("");

  // 실제 팔로우가 끝난 뒤 개정판 2를 게시한다. 화면 이동도 주요 탐색 링크로 수행한다.
  const navigation = page.getByRole("navigation", { name: "주요 탐색" });
  await navigation.locator('a[href="/follows"]').click();
  const card = page
    .getByRole("region", { name: "팔로우한 사건" })
    .getByRole("listitem")
    .filter({ has: page.locator(`a[href^="${STORY}/"]`) });
  await expect(card).toBeVisible();
  await expect(card.getByText("읽은 이후 변화 있음")).toHaveCount(0);
  await followStory.publishNext();
  await navigation.locator('a[href="/"]').click();
  await navigation.locator('a[href="/follows"]').click();
  await expect(card.getByText("읽은 이후 변화 있음")).toBeVisible();
  await expect(page.getByRole("region", { name: "데모 사건", exact: true })).toHaveCount(0);
  await expectNoAxeViolations(page, testInfo, "follows");

  // 개인 변화 요청이 실패해도 익명/변화 없음으로 숨기지 않고, 같은 페이지에서 복구할 수 있다.
  await page.route(
    "**/api/me/story-visit",
    (route) => route.fulfill({ status: 503, json: { error: "temporary failure" } }),
    { times: 1 },
  );
  // 재방문(최신 개정판): 변화 구획의 읽은 이후 변화와 개정판 띠의 내가 본 지점.
  await card.locator(`a[href="${LATEST}"]`).click();
  await expect(page).toHaveURL(new RegExp(`${LATEST}$`));
  // DB 발행과 캐시 무효화 사이에도 고정 링크의 새 개정판을 이전 개정판으로 오인하지 않는다.
  const visibleRevision = page
    .getByRole("figure", { name: /개정판 이력/ })
    .locator("ol > li")
    .nth(1);
  await expect(visibleRevision).toContainText("최신");
  await expect(visibleRevision).toContainText("보는 중");
  await expect(page.getByText("이전 개정판을 보고 있습니다.")).toHaveCount(0);
  // 실제 발행 워커의 기본 max 무효화도 이어서 검증한다.
  const revalidated = await page.request.post("/api/revalidate", {
    headers: { authorization: "Bearer e2e-follow-publish" },
    data: { tags: [`story:${followStory.storyId}:latest`, "today:ko"] },
  });
  expect(revalidated.status()).toBe(200);
  await expect(page.getByText("읽은 이후 변화를 확인하지 못했습니다.")).toBeVisible();
  const retry = page.getByRole("button", { name: "변화 확인 다시 시도" });
  // 저장은 성공했지만 응답이 끊겨도, 다시 시도할 때 수신했던 이전 기준을 잃지 않는다.
  await page.route("**/api/me/story-visit", async (route) => {
    const request = route.request().postDataJSON() as { phase?: string };
    if (request.phase === "read") return route.continue();
    await route.fetch();
    await route.abort("failed");
    await page.unroute("**/api/me/story-visit");
  });
  await retry.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("읽은 지점을 저장하지 못했습니다.")).toBeVisible();
  await page.getByRole("button", { name: "읽은 지점 저장 다시 시도" }).click();
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
  await expect(follow).not.toHaveAttribute("aria-disabled", "true");
  const shortcut = page.getByRole("link", { name: "새 개정판 1개 · 읽은 이후 변화 보기" });
  await shortcut.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${LATEST}#changes$`));
  await expect(changes.getByText("이전", { exact: true }).first()).toBeVisible();
  await expect(changes.getByText("현재", { exact: true }).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await shortcut.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect(
    (await page.getByRole("link", { name: "팔로우 목록", exact: true }).boundingBox())?.height,
  ).toBeGreaterThanOrEqual(44);
  await expectReflow(page, testInfo, 390, "follow-tracking-mobile");
  await page.screenshot({
    path: testInfo.outputPath("follow-tracking-mobile.png"),
    fullPage: true,
  });
  await expectNoAxeViolations(page, testInfo, "story-signed-in");

  // 최신을 읽었으므로 팔로우 화면의 변화 있음 표기가 사라진다.
  await navigation.locator('a[href="/follows"]').click();
  await expect(card).toBeVisible();
  await expect(card.getByText("읽은 이후 변화 있음")).toHaveCount(0);
  await card.locator(`a[href="${LATEST}"]`).click();
  await expect(page.getByRole("link", { name: "새 변화 없음 · 개정판 2까지 읽음" })).toBeVisible();
  await expect(changes.getByText("마지막으로 본 이후 새 개정판이 없습니다.")).toBeVisible();
  await expect(follow).not.toHaveAttribute("aria-disabled", "true");
  await page.goBack();
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

  // 로그인 후 intent의 저장 응답을 잃은 뒤 다른 화면에서 해제해도, 뒤로 가기가 다시 팔로우하지 않는다.
  await signedIn.route("**/api/me/story-visit", async (route) => {
    const request = route.request().postDataJSON() as { phase?: string };
    if (request.phase === "read") return route.continue();
    await route.fetch();
    await route.abort("failed");
    await signedIn.unroute("**/api/me/story-visit");
  });
  await signedIn.goto("/story/fixture-1-agreement?intent=follow");
  await expect(signedIn.getByText("읽은 지점을 저장하지 못했습니다.")).toBeVisible();
  await signedIn
    .getByRole("navigation", { name: "주요 탐색" })
    .locator('a[href="/follows"]')
    .click();
  await signedIn.getByRole("button", { name: /^팔로우 해제/ }).click();
  await expect(signedIn.getByText("아직 팔로우한 사건이 없습니다")).toBeVisible();
  await signedIn.goBack();
  await expect(follow).not.toHaveAttribute("aria-disabled", "true");
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  expect(new URL(signedIn.url()).search).toBe("");

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

// 오늘 머리의 팔로우 변화 안내(#208). 공개 HTML에는 없고, 로그인 독자의 브라우저가 개인 API로 채운다.
test("로그인 독자의 오늘 머리에 팔로우 변화 N건 안내와 팔로우 링크가 보이고 익명에는 없다", async ({
  page,
  makeUser,
  openAs,
  followStory,
}) => {
  const STORY = `/story/${followStory.slug}`;
  const header = (target: Page) => target.locator("main > header");
  const notice = (target: Page) =>
    header(target).getByText("팔로우한 사건 1건에 읽은 이후 변화가 있습니다");
  const followsLink = (target: Page) =>
    header(target).getByRole("link", { name: "팔로우한 사건 보기" });

  // 익명: 세션 쿠키 힌트가 없으므로 개인 API를 부르지 않고 아무것도 그리지 않는다.
  const personalCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/me/")) personalCalls.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("오늘의 지면");
  await page.waitForLoadState("networkidle");
  expect(personalCalls).toEqual([]);
  await expect(notice(page)).toHaveCount(0);
  await expect(followsLink(page)).toHaveCount(0);

  // 로그인 독자가 개정판 1을 읽으며 팔로우한다(로그인 뒤 돌아온 주소의 intent).
  const context = await openAs(await makeUser("today-notice"));
  const signedIn = await context.newPage();
  const REVISION_1 = `${STORY}/revision/${encodeURIComponent(followStory.revision1)}`;
  const REVISION_2 = `${STORY}/revision/${encodeURIComponent(followStory.revision2)}`;
  const follow = signedIn.getByRole("button", { name: "팔로우" });
  await signedIn.goto(`${REVISION_1}?intent=follow`);
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await expect(follow).not.toHaveAttribute("aria-disabled", "true");

  const openToday = async () => {
    const answered = signedIn.waitForResponse((response) =>
      response.url().endsWith("/api/me/follow-changes"),
    );
    await signedIn.goto("/");
    const response = await answered;
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
  };
  // 새 개정판이 없으면 0건이라 그리지 않는다.
  await openToday();
  await expect(notice(signedIn)).toHaveCount(0);

  // 팔로우한 사건에 새 개정판이 발행되면 안내 한 줄과 팔로우 화면 링크가 보인다.
  await followStory.publishNext();
  await openToday();
  await expect(notice(signedIn)).toBeVisible();
  await expect(followsLink(signedIn)).toHaveAttribute("href", "/follows");
  await expect(header(signedIn).locator("[data-slot=alert]")).toHaveCount(0);

  // 같은 사용자가 그 사건의 최신 개정판을 읽고(읽은 지점 저장 완료) 돌아오면 사라진다.
  await signedIn.goto(REVISION_2);
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await expect(follow).not.toHaveAttribute("aria-disabled", "true");
  await openToday();
  await expect(notice(signedIn)).toHaveCount(0);
  await expect(followsLink(signedIn)).toHaveCount(0);
});
