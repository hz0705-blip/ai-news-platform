import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./axe.ts";

// 소개(#127). 요청 메일 주소는 빌드 때 CONTACT_EMAIL에서 들어간다. CI e2e 잡은 가짜 값 contact@example.com으로 빌드한다.
test("오늘에서 소개를 열고 mailto 링크가 있다", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "주요 탐색" })
    .getByRole("link", { name: "서비스 소개" })
    .click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole("heading", { level: 1, name: "서비스 소개" })).toBeVisible();
  const requests = page.getByRole("region", { name: "정정·삭제 요청" });
  await expect(requests.locator('a[href^="mailto:"]')).toHaveCount(1);
  await expect(requests.getByText(/72시간 안에 처리/)).toBeVisible();
});

test("푸터에서 소개로 간다", async ({ page }) => {
  await page.goto("/search");
  await page.getByRole("contentinfo").getByRole("link", { name: "서비스 소개" }).click();
  await expect(page).toHaveURL(/\/about$/);
});

test.describe("모바일 라이트", () => {
  test.use({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
  test("/about axe 라이트·모바일 위반 0", async ({ page }, testInfo) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { level: 1, name: "서비스 소개" })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expectNoAxeViolations(page, testInfo, "about");
  });
});
