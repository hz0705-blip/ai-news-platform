import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";

export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];

/** 위반 0을 단언하고 결과·incomplete를 첨부로 남긴다(리뷰어가 읽는다). */
export async function expectNoAxeViolations(page: Page, testInfo: TestInfo, name: string) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  await testInfo.attach(`axe-${name}.json`, {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach(`axe-${name}-incomplete.json`, {
    body: JSON.stringify(results.incomplete, null, 2),
    contentType: "application/json",
  });
  expect(results.violations).toEqual([]);
}
