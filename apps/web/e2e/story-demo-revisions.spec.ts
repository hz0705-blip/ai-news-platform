import { expect, type Page, test } from "@playwright/test";

// 회귀 픽스처 ③④(#88)의 전용 E2E 복제본: 공개 사건 라우트에서 변화 구획과 개정판 띠를 본다.
test.use({ viewport: { width: 390, height: 844 } });

const changesOf = (page: Page) => page.getByRole("region", { name: "변화" });
/** 변화 목록의 항목만(개정판 띠의 종류별 개수는 뺀다). */
const itemsOf = (page: Page) => changesOf(page).locator("ul").first().locator(":scope > li");
const stripLinksOf = (page: Page) =>
  page
    .getByRole("figure", { name: /개정판 이력/ })
    .locator("ol")
    .getByRole("link");

/** 오늘 화면 최신 사건 → 사건. */
async function openFromToday(page: Page, slug: string) {
  await page.goto("/");
  await page
    .getByRole("region", { name: "최신 사건", exact: true })
    .locator(`a[href="/story/${slug}"]`)
    .click();
  await expect(page).toHaveURL(new RegExp(`/story/${slug}$`));
  await expect(page.getByText("기능 설명을 위해 만든 데모 사건입니다.")).toHaveCount(0);
}

/** 띠의 개정판 1 고정 URL을 열면 그 개정판(변화 없음)이 보이고, 개정판 2 링크로 돌아온다. */
async function openRevisionUrls(page: Page, slug: string) {
  const links = stripLinksOf(page);
  await expect(links).toHaveText(["개정판 1", "개정판 2"]);
  await expect(links.nth(1)).toHaveAttribute("aria-current", "page");
  await links.first().click();
  await page.waitForURL(`**/story/${slug}/revision/${encodeURIComponent(`${slug}:rev-1`)}`);
  await expect(changesOf(page).getByText("아직 변화가 없습니다")).toBeVisible();
  await expect(stripLinksOf(page)).toHaveText(["개정판 1"]);
  await page.goto(`/story/${slug}/revision/${encodeURIComponent(`${slug}:rev-2`)}`);
  await expect(stripLinksOf(page)).toHaveText(["개정판 1", "개정판 2"]);
  await expect(stripLinksOf(page).nth(1)).toHaveAttribute("aria-current", "page");
}

test("데모 ③: 명시 정정 — 주장 수정 이전·현재 병기, 상충 상태 변화, 원문 변경, 개정판 고정 URL", async ({
  page,
}) => {
  await openFromToday(page, "fixture-3-correction");
  const items = itemsOf(page);
  const modified = items.filter({ hasText: "주장 수정" });
  await expect(modified).toHaveCount(1);
  await expect(modified.getByText("이전", { exact: true })).toBeVisible();
  await expect(modified.getByText("현재", { exact: true })).toBeVisible();
  await expect(items.filter({ hasText: "주장 추가" }).first()).toBeVisible();
  await expect(items.filter({ hasText: "주장 삭제" }).first()).toBeVisible();
  const storyStatus = items.filter({ hasText: "상충 상태 변화" }).filter({ hasText: "사건 상태" });
  await expect(storyStatus).toContainText("보도 상충");
  await expect(storyStatus).toContainText("정정됨");
  await expect(items.filter({ hasText: "원문 변경" })).toHaveCount(1);
  await openRevisionUrls(page, "fixture-3-correction");
});

test("데모 ④: 시점이 다른 수치 — 주장 추가·삭제와 출처 추가, 상충 없음, 개정판 고정 URL", async ({
  page,
}) => {
  await openFromToday(page, "fixture-4-figures");
  const items = itemsOf(page);
  const added = items.filter({ hasText: "주장 추가" });
  await expect(added.filter({ hasText: "9,500만" })).toHaveCount(1);
  await expect(items.filter({ hasText: "주장 삭제" }).first()).toBeVisible();
  await expect(items.getByText("출처 추가 1건", { exact: true })).toBeVisible();
  await expect(items.filter({ hasText: "상충 상태 변화" })).toHaveCount(0);
  await openRevisionUrls(page, "fixture-4-figures");
});
