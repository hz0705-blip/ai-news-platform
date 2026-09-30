import { expect, type Page, test } from "@playwright/test";
import type { SearchResponse } from "../lib/search/api.ts";
import { expectNoAxeViolations } from "./axe.ts";

// 검색 화면(#126). 실행 경로는 실제 OpenAI를 부르지 않도록 스텁한다. 결과 사건은 demo:load가 적재한 데모 사건이라
// 링크를 따라가면 실제 사건 페이지가 열린다. 라이브 결과 하나는 데모와 다른 구획에 놓이는지만 본다.
const QUERY = "합의 이행";
const RESPONSE: SearchResponse = {
  state: "ok",
  stories: [
    {
      slug: "live-search-only",
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
  await page.getByRole("link", { name: "사건 검색" }).click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByRole("heading", { level: 1, name: "사건 검색" })).toBeVisible();
  const input = page.getByRole("searchbox", { name: "검색어" });
  await input.fill(QUERY);
  await input.press("Enter");
  const live = page.getByRole("region", { name: "검색 결과" });
  const demos = page.getByRole("region", { name: "데모 사건 결과" });
  await expect(live.getByRole("link")).toHaveText(["라이브 검색 결과"]);
  await expect(live.getByText("2시간 전")).toBeVisible();
  await expect(demos.getByText("데모 사건", { exact: true })).toBeVisible();
  await expect(demos.getByText("데모 주장 문장.")).toBeVisible();
  expect(queries).toEqual([QUERY]);
  expect(new URL(page.url()).searchParams.get("q")).toBe(QUERY);
  await demos.getByRole("link", { name: "데모 합의 사건" }).click();
  await expect(page).toHaveURL(/\/story\/demo-1-agreement$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test.describe("모바일 라이트", () => {
  test.use({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
  test("/search axe 라이트·모바일 위반 0", async ({ page }, testInfo) => {
    await stubSearch(page);
    // 공유 주소 `?q=`로 들어오면 바로 검색한다.
    await page.goto(`/search?q=${encodeURIComponent(QUERY)}`);
    await expect(page.getByRole("searchbox", { name: "검색어" })).toHaveValue(QUERY);
    await expect(page.getByRole("region", { name: "데모 사건 결과" })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expectNoAxeViolations(page, testInfo, "search");
  });
});
