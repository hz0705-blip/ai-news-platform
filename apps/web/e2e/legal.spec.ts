import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./axe.ts";

// 처리방침·약관(#128). 로그인 화면의 링크는 공개 껍데기에 있어 로컬 Supabase Auth 없이도 보인다.
test("로그인 화면에서 처리방침과 약관을 연다", async ({ page }) => {
  await page.goto("/auth/login");
  const main = page.getByRole("main");
  await main.getByRole("link", { name: "개인정보 처리방침" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { level: 1, name: "개인정보 처리방침" })).toBeVisible();
  await expect(page.getByRole("region", { name: "쿠키" }).getByRole("table")).toBeVisible();

  await page.goto("/auth/login");
  await main.getByRole("link", { name: "이용약관" }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("heading", { level: 1, name: "이용약관" })).toBeVisible();
});

test("푸터에서 처리방침과 약관으로 간다", async ({ page }) => {
  await page.goto("/about");
  const footer = page.getByRole("contentinfo");
  await footer.getByRole("link", { name: "개인정보 처리방침" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await footer.getByRole("link", { name: "이용약관" }).click();
  await expect(page).toHaveURL(/\/terms$/);
});

test.describe("모바일 라이트", () => {
  test.use({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
  test("/privacy axe 라이트·모바일 위반 0", async ({ page }, testInfo) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1, name: "개인정보 처리방침" })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expectNoAxeViolations(page, testInfo, "privacy");
    // 모바일 폭에서 가로 스크롤이 없다.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});
