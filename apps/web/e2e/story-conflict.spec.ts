import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const STORY_URL = "/story/demo-2-conflict";
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];
const VIEWPORTS = [
  { name: "모바일 320px", width: 320, height: 800 },
  { name: "데스크톱 1280px", width: 1280, height: 900 },
] as const;

test.describe("데모 사건 ② — 동시 보도 상충", () => {
  test("사건 배지 보도 상충, 설명 문구, 상태별 개수 링크", async ({ page }) => {
    await page.goto(STORY_URL);
    const header = page.locator("header");
    await expect(header.getByText("보도 상충", { exact: true }).first()).toBeVisible();
    await expect(header.getByText("출처에 따라 보도가 다릅니다.")).toBeVisible();
    const counts = page.getByRole("list", { name: "주장 상태별 개수" });
    await expect(counts).toContainText("복수 출처 일치 2개");
    await expect(counts.getByRole("link", { name: /보도 상충 1개/ })).toHaveAttribute(
      "href",
      "#claim-2",
    );
  });

  test("상충 주장의 근거는 발행 시각 순 동등 행이고 순서·다른 점을 보인다", async ({ page }) => {
    await page.goto(STORY_URL);
    const claim = page.getByRole("listitem").filter({ has: page.locator("#claim-2") });
    await expect(claim.getByText("보도 상충", { exact: true })).toBeVisible();
    await claim.getByRole("button", { name: /근거 2개 보기/ }).click();
    const region = page.locator("#claim-2-evidence");
    const rows = region.getByRole("listitem");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("보도 1/2");
    await expect(rows.nth(0)).toContainText("Meridian Wire");
    await expect(rows.nth(0)).toContainText("다른 점");
    await expect(rows.nth(0)).toContainText("모든 컨테이너 작업이 중단됐다고 보도");
    await expect(rows.nth(1)).toContainText("보도 2/2");
    await expect(rows.nth(1)).toContainText("Harbor Ledger");
    await expect(rows.nth(1)).toContainText("다른 점");
    await expect(rows.nth(1)).toContainText("선석 4곳 중 2곳");
    const times = await rows
      .locator("time")
      .evaluateAll((els) => els.map((el) => el.getAttribute("datetime")));
    expect(times).toEqual(["2026-09-16T07:15:00.000Z", "2026-09-16T08:40:00.000Z"]);
    // A/B 탭·승자·퍼센트 없음
    await expect(region.getByRole("tab")).toHaveCount(0);
    await expect(region.getByText(/%/)).toHaveCount(0);
  });

  test("상충이 아닌 주장의 근거 행에는 순서·다른 점이 없다", async ({ page }) => {
    await page.goto(STORY_URL);
    const claim = page.getByRole("listitem").filter({ has: page.locator("#claim-1") });
    await claim.getByRole("button", { name: /근거 2개 보기/ }).click();
    const region = page.locator("#claim-1-evidence");
    await expect(region.getByRole("listitem")).toHaveCount(2);
    await expect(region.getByText(/^보도 \d\/\d$/)).toHaveCount(0);
    await expect(region.getByText("다른 점")).toHaveCount(0);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    for (const viewport of VIEWPORTS) {
      test(`axe 위반 0 — ${colorScheme}, ${viewport.name}, 접힘·펼침`, async ({
        page,
      }, testInfo) => {
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(STORY_URL);
        const cell = `${colorScheme}-${viewport.width}`;
        // 주장 목록은 스트리밍되는 동적 구획이다 — 셸만 검사하지 않도록 세 주장이 다 그려질 때까지 기다린다.
        const triggers = page.getByRole("button", { name: /근거 \d+개 보기/ });
        await expect(triggers).toHaveCount(3);

        const collapsed = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        await testInfo.attach(`axe-${cell}-collapsed.json`, {
          body: JSON.stringify(collapsed, null, 2),
          contentType: "application/json",
        });
        expect(collapsed.violations).toEqual([]);

        for (const trigger of await triggers.all()) {
          await trigger.click();
          await expect(trigger).toHaveAttribute("aria-expanded", "true");
        }
        await expect(page.locator("#claim-2-evidence")).toBeVisible();

        const expanded = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        await testInfo.attach(`axe-${cell}-expanded.json`, {
          body: JSON.stringify(expanded, null, 2),
          contentType: "application/json",
        });
        // incomplete는 위반이 아니지만 기록으로 남긴다(리뷰어가 읽는다)
        await testInfo.attach(`axe-${cell}-incomplete.json`, {
          body: JSON.stringify(
            { collapsed: collapsed.incomplete, expanded: expanded.incomplete },
            null,
            2,
          ),
          contentType: "application/json",
        });
        expect(expanded.violations).toEqual([]);
      });
    }
  }
});
