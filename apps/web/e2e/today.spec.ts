import AxeBuilder from "@axe-core/playwright";
import { TOPICS } from "@newsplatform/domain/topic";
import { expect, type Page, test } from "@playwright/test";
import { build } from "esbuild";
import { DESKTOP_MIN, evidenceOf } from "./evidence.ts";
import { firstStory, LONG_SUMMARY, liveStories } from "./today-data.ts";

// Worker-local memory bundle: actual UI, no public fixture route or persisted fake live rows.
let bundle: Promise<string> | undefined;
async function mountToday(page: Page) {
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
  await page.addScriptTag({ content: await bundle });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
  await page.evaluate(() => document.fonts.ready);
}

const latest = (page: Page) => page.getByRole("region", { name: "최신 사건" });
const demos = (page: Page) => page.getByRole("region", { name: "데모 사건", exact: true });
const tiles = (page: Page) =>
  page.getByRole("group", { name: "토픽", exact: true }).getByRole("button");

test("실제 오늘: 미발행·동일 크기 0건 타일·데모 앵커 → 사건 → 근거", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByText("마지막 갱신 — 아직 발행된 사건이 없습니다")).toBeVisible();
  await expect(page.getByText("매일 오전 6시·오후 6시 갱신 예정").first()).toBeVisible();
  await expect(tiles(page)).toHaveCount(4);
  for (const tile of await tiles(page).all()) await expect(tile).toContainText("사건 0건");
  const bounds = await tiles(page).evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
  const firstBound = bounds[0];
  if (!firstBound) throw new Error("Missing tile bounds");
  expect(
    bounds.every(
      ({ width, height }) =>
        Math.abs(width - firstBound.width) < 1 && Math.abs(height - firstBound.height) < 1,
    ),
  ).toBe(true);
  await expect(latest(page).getByRole("link", { name: "데모 사건 보기" })).toHaveAttribute(
    "href",
    "#demo-stories",
  );
  await latest(page).getByRole("link", { name: "데모 사건 보기" }).click();
  await expect(page).toHaveURL(/#demo-stories$/);
  // demo:load는 데모 사건 ①·②를 모두 적재한다(#22).
  await expect(demos(page).getByRole("link")).toHaveCount(2);
  await demos(page).locator('a[href="/story/demo-1-agreement"]').click();
  await expect(page).toHaveURL(/\/story\/demo-1-agreement$/);
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
    await expect(tiles(page).nth(index)).toContainText(`사건 ${members.length}건`);
    if (members[0]) await expect(tiles(page).nth(index)).toContainText(members[0].title);
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
  const demoBefore = await demos(page).innerText();
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
  await expect(latest(page).getByRole("link", { name: "데모 사건 보기" })).toBeVisible();
  expect(await demos(page).innerText()).toBe(demoBefore);
  await tiles(page).nth(3).click();
  await expect(links).toHaveCount(8);
});

test("Tab·Enter·Space로 토픽을 선택하고 해제한다", async ({ page, browserName }) => {
  await mountToday(page);
  // macOS WebKit keyboard navigation preference uses Option-Tab for all controls.
  const tab = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
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

test("summary 전문·최대 두 줄·상대 시각 datetime·데모 절대 시각", async ({ page }) => {
  await mountToday(page);
  const summary = latest(page).getByText(LONG_SUMMARY, { exact: true }).first();
  await expect(summary).toHaveText(LONG_SUMMARY);
  const metrics = await summary.evaluate((node) => ({
    height: node.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(node).lineHeight),
    clamp: getComputedStyle(node).webkitLineClamp,
  }));
  expect(metrics.clamp).toBe("2");
  expect(metrics.height).toBeLessThanOrEqual(metrics.lineHeight * 2 + 1);
  await expect(latest(page).getByRole("time").first()).toHaveText("1분 전");
  await expect(latest(page).getByRole("time").first()).toHaveAttribute(
    "datetime",
    firstStory.updatedAt.toISOString(),
  );
  await expect(
    page.locator('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"]'),
  ).toHaveCount(0);
  await expect(demos(page).getByRole("link")).toHaveCount(2);
  for (const time of await demos(page).getByRole("time").all()) {
    await expect(time).toHaveAttribute("datetime", "2026-09-17T00:30:00.000Z");
    await expect(time).toHaveText("2026. 9. 17. 오전 9:30 KST");
  }
  await expect(demos(page)).toContainText("데모 기준 시각");
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
            tiles: [...document.querySelectorAll('[role="group"] button')].map(rect),
            cards: [
              ...document.querySelectorAll('[aria-labelledby="latest-stories"] [data-slot="card"]'),
            ].map(rect),
          };
        });
        expect(measurements.scrollWidth).toBeLessThanOrEqual(width);
        expect(measurements.tiles).toHaveLength(4);
        const [first, second, third] = measurements.tiles;
        if (!first || !second || !third) throw new Error("Missing tile bounds");
        for (const tile of measurements.tiles) {
          expect(Math.abs(tile.width - first.width)).toBeLessThan(1);
          expect(Math.abs(tile.height - first.height)).toBeLessThan(1);
        }
        if (width < 768) expect(second.y).toBeGreaterThan(first.y);
        else {
          expect(second.y).toBe(first.y);
          expect(second.x).toBeGreaterThan(first.x);
          expect(third.y).toBeGreaterThan(first.y);
        }
        expect(measurements.cards.length).toBeGreaterThan(1);
        const [firstCard, secondCard] = measurements.cards;
        if (!firstCard || !secondCard) throw new Error("Missing card bounds");
        expect(secondCard.x).toBe(firstCard.x);
        expect(secondCard.y).toBeGreaterThan(firstCard.y);
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
