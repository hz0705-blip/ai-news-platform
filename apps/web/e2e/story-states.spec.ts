import { expect, type Page, test } from "@playwright/test";
import { build } from "esbuild";
import { buildStoryView } from "../lib/story-view.ts";
import { expectNoAxeViolations } from "./axe.ts";
import { expectReflow, measureReflow } from "./reflow.ts";
import { HIDDEN_SPAN, LONG_MIXED, stateFixture } from "./story-data.ts";

// Node에서 만든 뷰만 브라우저로 보낸다(원본 픽스처·구간 텍스트는 페이지에 들어가지 않는다).
const VIEW_SCRIPT = `window.__STORY_VIEW__ = ${JSON.stringify(buildStoryView(stateFixture))};`;

// Worker-local memory bundle: actual UI, no public fixture route or persisted fake rows.
let bundle: Promise<string> | undefined;
async function mountStory(page: Page, hash = "") {
  bundle ??= build({
    entryPoints: ["e2e/story-entry.tsx"],
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
  await page.route("**/__story_fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>사건 상태 검사</title>${links}</head><body><div id="story-fixture"></div></body></html>`,
    }),
  );
  await page.goto(`/__story_fixture${hash}`);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addScriptTag({ content: VIEW_SCRIPT });
  await page.addScriptTag({ content: await bundle });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
  await page.evaluate(() => document.fonts.ready);
}

test.describe("근거 발췌 불가 상태", () => {
  test("상태 문구·출처명·원문 링크만 보이고 구간 텍스트는 DOM 어디에도 없다", async ({ page }) => {
    await mountStory(page);
    const triggers = page.getByRole("button", { name: /근거 \d+개 보기/ });
    await expect(triggers).toHaveCount(2);
    for (const trigger of await triggers.all()) await trigger.click();
    const rows = page.getByText("근거 발췌를 표시할 수 없음");
    await expect(rows).toHaveCount(2);
    const row = page
      .locator("#claim-1-evidence li")
      .filter({ hasText: "근거 발췌를 표시할 수 없음" });
    await expect(row.getByText("Tidewater Gazette", { exact: true })).toBeVisible();
    await expect(row.getByText("가상 출처")).toBeVisible();
    await expect(row.getByRole("link", { name: /원문/ })).toHaveAttribute(
      "href",
      /^https:\/\/tidewater-gazette\.example\//,
    );
    await expect(row.locator("blockquote, mark")).toHaveCount(0);
    await expect(row.getByText("근거 구간")).toHaveCount(0);
    await expect(row.getByText("기사 발행")).toHaveCount(0);
    await expect(row.getByRole("button", { name: /번역/ })).toHaveCount(0);
    expect(await page.content()).not.toContain(HIDDEN_SPAN);
    expect(await page.content()).not.toContain("suspended pending");
    // 발췌 가능한 다른 행은 정상
    await expect(page.locator("#claim-1-evidence").getByText("근거 구간")).toHaveCount(1);
    // 상충 주장에서는 발췌 불가 행도 순서 자리(보도 2/2)에 있되 다른 점·번역은 없다
    const conflictRows = page.locator("#claim-2-evidence > ul > li");
    await expect(conflictRows).toHaveCount(2);
    await expect(conflictRows.nth(0)).toContainText("보도 1/2");
    await expect(conflictRows.nth(1)).toContainText("근거 발췌를 표시할 수 없음");
    await expect(conflictRows.nth(1).getByText("다른 점")).toHaveCount(0);
  });

  test("발췌 불가 상태는 상충 상태 배지가 아니고 출처 구획은 링크만 등급을 보인다", async ({
    page,
  }) => {
    await mountStory(page, "#claim-1");
    await expect(page.locator("#claim-1")).toBeFocused();
    const status = page.getByText("근거 발췌를 표시할 수 없음").first();
    await expect(status).not.toHaveAttribute("data-slot", "badge");
    await expect(page.getByRole("region", { name: "출처" }).getByText("링크만")).toBeVisible();
  });
});

for (const width of [320, 640, 1440]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`긴 문자열·URL 리플로우·axe ${width}px ${colorScheme} — 접힘·펼침·발췌 불가`, async ({
      page,
    }, testInfo) => {
      // 640×450 is the CSS viewport equivalent of 1280×900 at 200%, not browser-menu zoom.
      await page.setViewportSize({ width, height: width === 640 ? 450 : 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await mountStory(page);
      await expectReflow(page, testInfo, width, `states-${width}-${colorScheme}-collapsed`);
      await expectNoAxeViolations(page, testInfo, `states-${width}-${colorScheme}-collapsed`);
      for (const trigger of await page.getByRole("button", { name: /근거 \d+개 보기/ }).all())
        await trigger.click();
      await expect(page.getByText("근거 발췌를 표시할 수 없음")).toHaveCount(2);
      await expect(page.getByText(LONG_MIXED)).toBeVisible();
      await expectReflow(page, testInfo, width, `states-${width}-${colorScheme}-expanded`);
      const { claimTextLines } = await measureReflow(page);
      // 긴 혼합 문자열이 잘리지 않고 접힌다
      expect(claimTextLines[1]).toBeGreaterThanOrEqual(width === 1440 ? 1 : 2);
      await expectNoAxeViolations(page, testInfo, `states-${width}-${colorScheme}-expanded`);
    });
  }
}
