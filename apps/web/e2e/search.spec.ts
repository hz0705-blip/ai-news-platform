import { expect, type Page, test } from "@playwright/test";
import type { SearchResponse } from "../lib/search/api.ts";
import { expectNoAxeViolations } from "./axe.ts";

// 검색 API만 스텁한다. 전용 로컬 fixture 경로를 열고 오래된 데모 응답도 화면에서 차단한다.
const QUERY = "합의 이행";
const RESPONSE: SearchResponse = {
  state: "ok",
  stories: [
    {
      slug: "fixture-1-agreement",
      title: "라이브 검색 결과",
      updatedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      isDemo: false,
      lifecycle: "활성",
      claims: [{ claimId: "live-claim", text: "라이브 주장 문장." }],
    },
    {
      slug: "demo-1-agreement",
      title: "데모 합의 사건",
      updatedAt: "2026-09-17T00:30:00.000Z",
      isDemo: true,
      lifecycle: "활성",
      claims: [{ claimId: "demo-claim", text: "데모 주장 문장." }],
    },
  ],
};

async function stubSearch(page: Page): Promise<string[]> {
  const queries: string[] = [];
  await page.route("**/api/search", async (route) => {
    queries.push((route.request().postDataJSON() as { query: string }).query);
    await route.fulfill({ json: RESPONSE });
  });
  return queries;
}

test("오늘에서 검색으로 가 한국어 질의로 사건을 연다", async ({ page }) => {
  const queries = await stubSearch(page);
  await page.goto("/");
  await page.getByRole("searchbox", { name: "검색어" }).fill(QUERY);
  await page.getByRole("searchbox", { name: "검색어" }).press("Enter");
  await expect(page).toHaveURL(/\/search\?q=/);
  await expect(page.getByRole("heading", { level: 1, name: "사건 검색" })).toBeVisible();
  const live = page.getByRole("region", { name: "검색 결과" });
  const demos = page.getByRole("region", { name: "데모 사건 결과" });
  await expect(live.getByRole("link")).toHaveText(["라이브 검색 결과"]);
  await expect(live.getByText("2시간 전")).toBeVisible();
  await expect(demos).toHaveCount(0);
  await expect(page.getByText("데모 주장 문장.")).toHaveCount(0);
  expect(queries).toEqual([QUERY]);
  expect(new URL(page.url()).searchParams.get("q")).toBe(QUERY);
  await live.getByRole("link", { name: "라이브 검색 결과" }).click();
  await expect(page).toHaveURL(/\/story\/fixture-1-agreement$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test.describe("모바일 라이트", () => {
  test.use({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
  test("/search axe 라이트·모바일 위반 0", async ({ page }, testInfo) => {
    await stubSearch(page);
    // 공유 주소 `?q=`로 들어오면 바로 검색한다.
    await page.goto(`/search?q=${encodeURIComponent(QUERY)}`);
    await expect(page.getByRole("searchbox", { name: "검색어" })).toHaveValue(QUERY);
    await expect(page.getByRole("region", { name: "검색 결과", exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expectNoAxeViolations(page, testInfo, "search");
  });
});
