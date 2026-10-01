import { authEnv, expect, test } from "./auth.ts";
import { expectNoAxeViolations } from "./axe.ts";

// 모든 화면 우측 상단 계정 진입점(#155, 스펙 "계정"). 로그인 상태 경우만 로컬 Supabase가 필요하다.
const STORY_URL = "/story/fixture-1-agreement";
const PAGES = ["/", STORY_URL, "/search", "/about"];

for (const path of PAGES) {
  test(`로그아웃 상태 상단 로그인 버튼이 ${path}에서 Kakao·Google 대화상자를 연다`, async ({
    page,
  }) => {
    await page.goto(path);
    await page.getByRole("banner").getByRole("button", { name: "로그인" }).click();
    const gate = page.getByRole("dialog", { name: "로그인" });
    await expect(gate).toBeVisible();
    // 하려던 동작 없이 지금 페이지로 돌아온다.
    const next = encodeURIComponent(path);
    await expect(gate.getByRole("link", { name: "카카오로 계속하기" })).toHaveAttribute(
      "href",
      `/auth/login/start?provider=kakao&next=${next}`,
    );
    await expect(gate.getByRole("link", { name: "Google로 계속하기" })).toHaveAttribute(
      "href",
      `/auth/login/start?provider=google&next=${next}`,
    );
  });
}

test.describe("360px", () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test("상단 로그인 버튼이 우측 상단에 보이고 가로 스크롤이 없으며 axe 위반이 없다", async ({
    page,
  }, testInfo) => {
    // 세션 응답을 붙잡아 확인 전 상태를 재고, 풀어 준 뒤 본문 위치가 그대로인지 본다(레이아웃 흔들림 없음).
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/auth/session", async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(STORY_URL);
    const header = page.getByRole("banner");
    const login = header.getByRole("button", { name: "로그인" });
    await expect(login).toHaveCount(0);
    const mainBefore = (await page.getByRole("main").boundingBox())?.y;
    release();
    await expect(login).toBeVisible();
    expect((await page.getByRole("main").boundingBox())?.y).toBe(mainBefore);
    const box = await login.boundingBox();
    expect(box).not.toBeNull();
    if (box !== null) {
      expect(box.x + box.width).toBeLessThanOrEqual(360);
      expect(box.x + box.width).toBeGreaterThan(300);
      expect(box.y).toBeLessThan(80);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    await expectNoAxeViolations(page, testInfo, "header-login");

    await login.focus();
    await expect(login).toHaveCSS("outline-width", "2px");
    await login.press("Enter");
    await expect(page.getByRole("dialog", { name: "로그인" })).toBeVisible();
  });
});

test.describe("로그인 상태", () => {
  test.skip(authEnv() === null, "로컬 Supabase가 꺼져 있다(pnpm exec supabase start)");
  test.use({ viewport: { width: 360, height: 780 } });

  test("상단의 계정 링크에서 로그아웃하면 오늘로 돌아와 로그인 버튼이 보인다", async ({
    makeUser,
    openAs,
  }, testInfo) => {
    const context = await openAs(await makeUser("header"));
    const page = await context.newPage();
    await page.goto(STORY_URL);
    const nav = page.getByRole("banner").getByRole("navigation", { name: "계정 메뉴" });
    await expect(nav.getByRole("link", { name: "팔로우" })).toHaveAttribute("href", "/follows");
    await expect(nav.getByRole("link", { name: "계정" })).toHaveAttribute("href", "/account");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    await expectNoAxeViolations(page, testInfo, "header-signed-in");

    await expect(nav.getByRole("button", { name: "로그아웃" })).toHaveCount(0);
    await nav.getByRole("link", { name: "계정" }).click();
    await page.getByRole("main").getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("banner").getByRole("button", { name: "로그인" })).toBeVisible();
  });
});
