import AxeBuilder from "@axe-core/playwright";
import type { LeadImage } from "@newstrail/db";
import { TOPICS } from "@newstrail/domain/topic";
import { expect, type Page, test } from "@playwright/test";
import { build } from "esbuild";
import { DESKTOP_MIN, evidenceOf } from "./evidence.ts";
import { firstStory, LONG_SUMMARY, liveStories } from "./today-data.ts";

// Worker-local memory bundle: actual UI, no public fixture route or persisted fake live rows.
let bundle: Promise<string> | undefined;
async function mountToday(page: Page, image?: LeadImage) {
  bundle ??= build({
    entryPoints: ["e2e/today-entry.tsx"],
    bundle: true,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    write: false,
    // Next normally replaces these environment reads in its compiler. The isolated
    // browser bundle has no server environment; preserve production mode only.
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
  }).then((result) => result.outputFiles.map((file) => file.text).join("\n"));
  await page.goto("/");
  const links = await page
    .locator('link[rel="stylesheet"], link[as="font"]')
    .evaluateAll((nodes) => nodes.map((node) => node.outerHTML).join(""));
  await page.route("**/__today_fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>오늘 화면 검사</title>${links}</head><body><div id="today-fixture"></div></body></html>`,
    }),
  );
  await page.goto("/__today_fixture");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (image) {
    await page.addScriptTag({ content: `window.__TODAY_IMAGE__ = ${JSON.stringify(image)};` });
  }
  await page.addScriptTag({ content: await bundle });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
  await page.evaluate(() => document.fonts.ready);
}

const latest = (page: Page) => page.getByRole("region", { name: "최신 사건" });
const multiSource = (page: Page) =>
  page.getByRole("region", { name: "여러 출처로 읽는 사건", exact: true });
const tiles = (page: Page) =>
  page.getByRole("group", { name: "토픽", exact: true }).getByRole("button");

test("대표 이미지: 핫링크·크레딧·위계·다중 출처 구획과 실패 시 슬롯 제거", async ({ page }) => {
  const image = {
    url: "https://images.example.test/lead.svg",
    articleUrl: "https://example.test/article",
    sourceName: "검사용 출처",
  };
  await page.route(image.url, (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#567"/></svg>',
    }),
  );
  await mountToday(page, image);
  const images = latest(page).locator("img");
  await expect(images).toHaveCount(3);
  await expect(images.first()).toHaveAttribute("src", image.url);
  await expect(images.first()).toHaveAttribute("loading", "eager");
  const cards = latest(page).getByRole("article");
  for (const index of [1, 2]) {
    const secondaryImage = cards.nth(index).locator("img");
    await expect(secondaryImage).toHaveAttribute("src", image.url);
    await expect(secondaryImage).toHaveAttribute("loading", "lazy");
    await secondaryImage.scrollIntoViewIfNeeded();
    await expect
      .poll(() => secondaryImage.evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBe(900);
    await expect(
      cards.nth(index).getByRole("link", { name: "사진 · 검사용 출처" }),
    ).toHaveAttribute("href", image.articleUrl);
  }
  await expect(latest(page).locator(".today-list-item figure")).toHaveCount(0);
  await expect(latest(page).getByRole("link", { name: "사진 · 검사용 출처" })).toHaveCount(3);
  await expect(
    latest(page).getByRole("link", { name: "사진 · 검사용 출처" }).first(),
  ).toHaveAttribute("href", image.articleUrl);
  await expect(multiSource(page).locator("figure")).toHaveCount(0);
  await tiles(page).nth(2).click();
  await expect(images).toHaveCount(3);
  await expect(cards.nth(2).locator("img")).toHaveAttribute("loading", "lazy");
  await expect(latest(page).locator(".today-list-item figure")).toHaveCount(0);
  await page.getByRole("button", { name: /^전체 사건/ }).click();
  await latest(page).getByRole("button", { name: "더 보기" }).click();
  await expect(cards).toHaveCount(16);
  await expect(images).toHaveCount(3);
  await expect(latest(page).locator(".today-list-item figure")).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(cards.nth(2).locator("img")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await images.evaluateAll((nodes) => {
    for (const node of nodes) node.dispatchEvent(new Event("error"));
  });
  await expect(latest(page).locator("figure")).toHaveCount(0);
  await expect(latest(page).getByRole("link", { name: "사진 · 검사용 출처" })).toHaveCount(0);
  await expect(latest(page).getByRole("link", { name: firstStory.title })).toBeVisible();
});

test("발행 사건 홈 → 실제 사건 경로 → 근거, 데모 미노출", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(tiles(page)).toHaveCount(4);
  // 다른 병렬 시나리오가 새 사건을 발행해도 기존 사건의 누락·중복은 허용하지 않는다.
  await expect.poll(() => latest(page).getByRole("article").count()).toBeGreaterThanOrEqual(4);
  for (const slug of [
    "fixture-1-agreement",
    "fixture-2-conflict",
    "fixture-3-correction",
    "fixture-4-figures",
  ]) {
    await expect(latest(page).locator(`a[href="/story/${slug}"]`)).toHaveCount(1);
  }
  await expect(page.getByRole("region", { name: "데모 사건", exact: true })).toHaveCount(0);
  await expect(page.locator('a[href*="/story/demo-"]')).toHaveCount(0);
  await expect(multiSource(page).getByRole("article")).toHaveCount(4);
  await latest(page).locator('a[href="/story/fixture-1-agreement"]').click();
  await expect(page).toHaveURL(/\/story\/fixture-1-agreement$/);
  await page
    .getByRole("button", { name: /근거 \d+개 보기/ })
    .first()
    .click();
  // 기본 뷰포트(1280)는 데스크톱이라 근거는 옆 패널에 보인다(Ruling 24-7).
  await expect(evidenceOf(page, 1)).toBeVisible();
  // 빈 패널·빈 영역으로는 통과하지 않는다: 데스크톱은 패널 헤딩, 그 아래 폭은 인라인 근거 행.
  if ((page.viewportSize()?.width ?? 0) >= DESKTOP_MIN) {
    await expect(evidenceOf(page, 1).getByRole("heading", { level: 2 })).toHaveText(
      "주장 1의 근거",
    );
  } else {
    await expect(evidenceOf(page, 1).getByRole("listitem").first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("시간순 카드·다중 토픽·필터 해제·빈 토픽·8개 단위 더 보기와 끝 포커스", async ({ page }) => {
  await mountToday(page);
  const links = latest(page).getByRole("link");
  await expect(links).toHaveText(liveStories.slice(0, 8).map((story) => story.title));
  for (let index = 0; index < 4; index += 1) {
    const members = liveStories.filter((story) =>
      story.topics.includes(TOPICS[index] ?? TOPICS[0]),
    );
    await expect(tiles(page).nth(index)).toHaveAccessibleName(
      `${TOPICS[index]} 사건 ${members.length}건`,
    );
  }
  await expect(latest(page).getByRole("list", { name: "토픽" }).first()).toHaveText(
    TOPICS[0] + TOPICS[1],
  );
  await page.getByRole("button", { name: "더 보기", exact: true }).click();
  await expect(links).toHaveCount(16);
  await expect(links.nth(8)).toBeFocused();
  await page.getByRole("button", { name: "더 보기", exact: true }).click();
  await expect(links).toHaveText(liveStories.map((story) => story.title));
  await expect(links.nth(16)).toBeFocused();
  await expect(page.getByRole("button", { name: "더 보기", exact: true })).toHaveCount(0);
  const multiSourceBefore = await multiSource(page).innerText();
  await tiles(page).nth(1).click();
  await expect(tiles(page).nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(links).toHaveText(
    liveStories.filter((story) => story.topics.includes(TOPICS[1])).map((story) => story.title),
  );
  await tiles(page).nth(1).click();
  await expect(tiles(page).nth(1)).toHaveAttribute("aria-pressed", "false");
  await expect(links).toHaveCount(8);
  await tiles(page).nth(3).click();
  await expect(latest(page).getByText("아직 발행된 사건이 없습니다")).toBeVisible();
  await expect(latest(page).getByRole("link", { name: "사건 검색" })).toBeVisible();
  expect(await multiSource(page).innerText()).toBe(multiSourceBefore);
  await tiles(page).nth(3).click();
  await expect(links).toHaveCount(8);
});

test("Tab·Enter·Space로 토픽을 선택하고 해제한다", async ({ page, browserName }) => {
  await mountToday(page);
  // macOS WebKit keyboard navigation preference uses Option-Tab for all controls.
  const tab = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
  await page.keyboard.press(tab);
  await expect(page.getByRole("link", { name: "본문으로 건너뛰기" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page
    .getByRole("navigation", { name: "주요 탐색" })
    .getByRole("link", { name: "오늘", exact: true })
    .focus();
  for (const name of ["팔로우한 사건 보기", "사건 검색", "서비스 소개"]) {
    await page.keyboard.press(tab);
    await expect(page.getByRole("link", { name, exact: true })).toBeFocused();
  }
  await page.keyboard.press(tab);
  await expect(page.getByRole("button", { name: /^전체 사건/ })).toBeFocused();
  await page.keyboard.press(tab);
  await expect(tiles(page).first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(tiles(page).first()).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
  await expect(tiles(page).first()).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("ArrowRight");
  await expect(tiles(page).nth(1)).toBeFocused();
});

test.describe("터치", () => {
  test.use({ hasTouch: true, viewport: { width: 320, height: 800 } });
  test("타일 탭으로 선택·해제한다", async ({ page }) => {
    await mountToday(page);
    await tiles(page).first().tap();
    await expect(tiles(page).first()).toHaveAttribute("aria-pressed", "true");
    await tiles(page).first().tap();
    await expect(tiles(page).first()).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("검색창", () => {
  // 검색창은 48rem 이상에서만 보인다. 64rem 미만이라 본문 토큰은 17px이다.
  test.use({ viewport: { width: 800, height: 900 } });
  test("라벨·입력은 본문 크기, 제출 버튼 링은 상자 링과 같다", async ({ page, browserName }) => {
    await mountToday(page);
    const form = page.getByRole("form", { name: "사건 검색" });
    await expect(form.locator("label")).toHaveCSS("font-size", "17px");
    await expect(form.getByRole("searchbox")).toHaveCSS("font-size", "17px");
    await form.getByRole("searchbox").focus();
    // macOS WebKit은 버튼 순회에 Option-Tab을 사용한다(Apple Safari 키보드 안내).
    await page.keyboard.press(
      browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab",
    );
    const submit = form.getByRole("button", { name: "사건 검색" });
    await expect(submit).toBeFocused();
    await expect(submit).toHaveCSS("outline-width", "2px");
    await expect(submit).toHaveCSS("outline-offset", "0px");
  });
});

test("summary 전문·줄임 없는 읽기·상대 시각 datetime·여러 출처 사건", async ({ page }) => {
  await mountToday(page);
  const summary = latest(page).getByText(LONG_SUMMARY, { exact: true }).first();
  await expect(summary).toHaveText(LONG_SUMMARY);
  const metrics = await summary.evaluate((node) => ({
    height: node.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(node).lineHeight),
    clamp: getComputedStyle(node).webkitLineClamp,
  }));
  expect(metrics.clamp).toBe("none");
  expect(metrics.height).toBeGreaterThan(metrics.lineHeight * 2);
  await expect(latest(page).getByRole("time").first()).toHaveText("1분 전");
  await expect(latest(page).getByRole("time").first()).toHaveAttribute(
    "datetime",
    firstStory.updatedAt.toISOString(),
  );
  await expect(
    page.locator('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"]'),
  ).toHaveCount(0);
  await expect(multiSource(page).getByRole("link")).toHaveCount(4);
  await expect(multiSource(page).getByRole("time").first()).toHaveAttribute(
    "datetime",
    firstStory.updatedAt.toISOString(),
  );
  await expect(multiSource(page)).not.toContainText("데모");
});

for (const width of [320, 640, 1440]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`레이아웃·axe·스크린샷 ${width}px ${colorScheme}`, async ({ page }, testInfo) => {
      // 640×450 is the CSS viewport equivalent of 1280×900 at 200%, not browser-menu zoom.
      await page.setViewportSize({ width, height: width === 640 ? 450 : 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await mountToday(page);
      for (const state of ["before", "after"] as const) {
        if (state === "after") await tiles(page).first().click();
        const measurements = await page.evaluate(() => {
          const rect = (node: Element) => {
            const { x, y, width, height } = node.getBoundingClientRect();
            return { x, y, width, height };
          };
          return {
            viewport: innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            tiles: [...document.querySelectorAll(".today-topics button")].map(rect),
            cards: [...document.querySelectorAll('[aria-labelledby="latest-stories"] article')].map(
              rect,
            ),
          };
        });
        expect(measurements.scrollWidth).toBeLessThanOrEqual(width);
        expect(measurements.tiles).toHaveLength(4);
        const [first, second, third] = measurements.tiles;
        if (!first || !second || !third) throw new Error("Missing tile bounds");
        for (const tile of measurements.tiles) {
          expect(tile.width).toBeGreaterThan(0);
          expect(tile.height).toBeGreaterThanOrEqual(44);
          expect(tile.x).toBeGreaterThanOrEqual(0);
          expect(tile.x + tile.width).toBeLessThanOrEqual(width);
        }
        if (width >= 768) {
          expect(second.y).toBe(first.y);
          expect(second.x).toBeGreaterThan(first.x);
          expect(third.y).toBe(first.y);
        }
        expect(measurements.cards.length).toBeGreaterThan(2);
        const [firstCard, secondCard, thirdCard] = measurements.cards;
        if (!firstCard || !secondCard || !thirdCard) throw new Error("Missing card bounds");
        if (width < 768) {
          expect(secondCard.x).toBe(firstCard.x);
          expect(secondCard.y).toBeGreaterThan(firstCard.y);
          expect(thirdCard.y).toBeGreaterThan(secondCard.y);
        } else {
          expect(secondCard.x).toBeGreaterThan(firstCard.x);
          expect(secondCard.y).toBe(firstCard.y);
          expect(thirdCard.x).toBe(secondCard.x);
          expect(thirdCard.y).toBeGreaterThan(secondCard.y);
          expect(firstCard.width).toBeGreaterThan(secondCard.width);
        }
        await testInfo.attach(`bounds-${state}.json`, {
          body: JSON.stringify(measurements, null, 2),
          contentType: "application/json",
        });
        await testInfo.attach(`today-${width}-${colorScheme}-${state}.png`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"])
          .analyze();
        await testInfo.attach(`axe-${state}.json`, {
          body: JSON.stringify(results, null, 2),
          contentType: "application/json",
        });
        expect(results.violations).toEqual([]);
      }
    });
  }
}

test("머리에는 제목·마지막 갱신·갱신 예정만 있다", async ({ page }) => {
  await mountToday(page);
  // 헤더가 <main> 안이라 banner 역할이 없다.
  const header = page.locator("main > header");
  await expect(header.getByRole("heading", { level: 1 })).toHaveText("오늘의 지면");
  await expect(header).toContainText("마지막 갱신 2026. 9. 23. 오전 11:59 KST");
  await expect(header).toContainText("매일 오전 6시·오후 6시 갱신 예정");
  await expect(header.locator("[data-slot=alert]")).toHaveCount(0);
  await expect(header.locator("[data-batch-notice]")).toHaveCount(0);
});
