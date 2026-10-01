import AxeBuilder from "@axe-core/playwright";
import type { LeadImage } from "@newstrail/db";
import type { BatchNotice } from "@newstrail/domain/batch-status";
import { TOPICS } from "@newstrail/domain/topic";
import { expect, type Page, test } from "@playwright/test";
import { build } from "esbuild";
import { expectNoAxeViolations } from "./axe.ts";
import { DESKTOP_MIN, evidenceOf } from "./evidence.ts";
import { firstStory, LONG_SUMMARY, liveStories } from "./today-data.ts";

// Worker-local memory bundle: actual UI, no public fixture route or persisted fake live rows.
let bundle: Promise<string> | undefined;
async function mountToday(page: Page, notice?: BatchNotice, image?: LeadImage) {
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
  if (notice) {
    await page.addScriptTag({ content: `window.__TODAY_NOTICE__ = ${JSON.stringify(notice)};` });
  }
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
  await mountToday(page, undefined, image);
  const images = latest(page).locator("img");
  await expect(images).toHaveCount(2);
  await expect(images.first()).toHaveAttribute("src", image.url);
  await expect(images.first()).toHaveAttribute("loading", "eager");
  await expect(images.last()).toHaveAttribute("loading", "lazy");
  await expect(latest(page).getByRole("link", { name: "사진 · 검사용 출처" })).toHaveCount(2);
  await expect(
    latest(page).getByRole("link", { name: "사진 · 검사용 출처" }).first(),
  ).toHaveAttribute("href", image.articleUrl);
  await expect(multiSource(page).locator("figure")).toHaveCount(0);
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
  await expect(latest(page).getByRole("article")).toHaveCount(4);
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

// 배치 상태(#56): 원장 행 → 상태는 도메인 단위 테스트(deriveBatchNotice)와 db 실 DB 테스트가, 화면 문구는 여기서.
test.describe("배치 상태", () => {
  // 헤더가 <main> 안이라 banner 역할이 없다.
  const header = (page: Page) => page.locator("main > header");

  test("today shows normal update time", async ({ page }) => {
    await mountToday(page, { kind: "none" });
    await expect(header(page)).toContainText("마지막 갱신 2026. 9. 23. 오전 11:59 KST");
    await expect(header(page)).toContainText("매일 오전 6시·오후 6시 갱신 예정");
    await expect(
      page.getByRole("navigation", { name: "주요 탐색" }).getByRole("link", { name: "사건 검색" }),
    ).toBeVisible();
    await expect(header(page).locator("[data-batch-notice]")).toHaveCount(0);
  });

  test("today shows running", async ({ page }) => {
    await mountToday(page, { kind: "running" });
    await expect(header(page).getByText("갱신 진행 중", { exact: true })).toBeVisible();
  });

  test("today shows cap reached with N deferred", async ({ page }) => {
    await mountToday(page, { kind: "cap-reached", deferred: 7 });
    await expect(
      header(page).getByText("오늘 분석 한도에 도달해 7개 사건이 다음 갱신에 처리됩니다"),
    ).toBeVisible();
  });

  test("today shows batch failed", async ({ page }) => {
    await mountToday(page, { kind: "failed" });
    await expect(header(page).getByText("갱신 실패", { exact: true })).toBeVisible();
  });

  test("today shows delayed", async ({ page }) => {
    await mountToday(page, { kind: "delayed" });
    await expect(header(page).getByText("갱신 지연", { exact: true })).toBeVisible();
  });

  test.describe("모바일 라이트", () => {
    test.use({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
    test("axe 위반 0(한도 도달 상태)", async ({ page }, testInfo) => {
      await mountToday(page, { kind: "cap-reached", deferred: 7 });
      await expectNoAxeViolations(page, testInfo, "today-batch-notice");
    });
  });
});
