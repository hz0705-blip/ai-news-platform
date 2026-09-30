import type { StoryPageData } from "@newstrail/db";
import { expect, type Page, test } from "@playwright/test";
import { build } from "esbuild";
import { buildStoryView } from "../lib/story-view.ts";
import { expectNoAxeViolations } from "./axe.ts";
import { expectReflow } from "./reflow.ts";
import { MULTI_REV_1, multiRevisionFirstFixture, multiRevisionFixture } from "./story-data.ts";

// 개정판 2개 이상인 사건(#87). 데모 사건 ③④(#88)가 DB에 적재되기 전이라 story-states.spec.ts와 같은
// 방식으로 실제 컴포넌트를 픽스처 뷰로 띄우고, 개정판 고정 URL로의 이동은 그 URL을 같은 방식으로 가로채 검사한다.
test.use({ viewport: { width: 390, height: 844 } });

let bundle: Promise<string> | undefined;
const storyBundle = () =>
  (bundle ??= build({
    entryPoints: ["e2e/story-entry.tsx"],
    bundle: true,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    write: false,
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
  }).then((result) => result.outputFiles.map((file) => file.text).join("\n")));

/** 공개 라우트를 쓰지 않는 셸 HTML. 앱의 스타일시트·폰트 링크를 그대로 가져온다. */
async function routeShell(page: Page, pattern: string) {
  await page.goto("/");
  const links = await page
    .locator('link[rel="stylesheet"], link[as="font"]')
    .evaluateAll((nodes) => nodes.map((node) => node.outerHTML).join(""));
  await page.route(pattern, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>사건 변화 검사</title>${links}</head><body><div id="story-fixture"></div></body></html>`,
    }),
  );
}

async function mountView(page: Page, data: StoryPageData) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addScriptTag({
    content: `window.__STORY_VIEW__ = ${JSON.stringify(buildStoryView(data))};`,
  });
  await page.addScriptTag({ content: await storyBundle() });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
  await page.evaluate(() => document.fonts.ready);
}

test("개정판 2개 이상 사건에서 변화 구획·띠·표 펼침·고정 URL 이동", async ({
  page,
  browserName,
}, testInfo) => {
  // macOS WebKit은 Tab이 링크를 건너뛴다(foundation.spec.ts와 같은 처리).
  const tab = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
  await routeShell(page, "**/__story_fixture");
  await routeShell(page, "**/story/multi-revision-changes/revision/**");
  await page.goto("/__story_fixture");
  await mountView(page, multiRevisionFixture);

  const changes = page.getByRole("region", { name: "변화" });
  // 주장 변화: 이전·현재 병기, 단어 차이
  const modified = changes.locator("li").filter({ hasText: "주장 수정" });
  await expect(modified.locator("del")).toHaveText(["지운 단어: 이번", "지운 단어: 한"]);
  await expect(modified.locator("ins")).toHaveText(["넣은 단어: 다음", "넣은 단어: 두"]);
  await expect(changes.getByText("출처 추가 2건", { exact: true }).first()).toBeVisible();
  await expect(changes.getByText("원문 변경", { exact: true }).first()).toBeVisible();

  // 개정판 띠: 발행 순서, 현재 표시
  const strip = page.getByRole("figure", { name: /개정판 이력/ });
  const stripLinks = strip.locator("ol").getByRole("link");
  await expect(stripLinks).toHaveText(["개정판 1", "개정판 2"]);
  await expect(stripLinks.nth(1)).toHaveAttribute("aria-current", "page");

  // 보도량 추이: Recharts 막대가 그려진다(값은 표가 전한다)
  const coverage = page.getByRole("figure", { name: /보도량 추이/ });
  await expect(coverage.locator(".recharts-bar-rectangle").first()).toBeAttached();

  // 키보드 완주: 띠의 마지막 링크 → 표 펼침(Enter) → 표 안 링크 → 보도량 표 펼침(Space)
  await stripLinks.nth(1).focus();
  await page.keyboard.press(tab);
  const stripSummary = strip.getByText("표로 보기", { exact: true });
  await expect(stripSummary).toBeFocused();
  await page.keyboard.press("Enter");
  const stripTable = strip.getByRole("table");
  await expect(stripTable).toBeVisible();
  await page.keyboard.press(tab);
  await expect(stripTable.getByRole("link", { name: "개정판 1" })).toBeFocused();
  await page.keyboard.press(tab);
  await expect(stripTable.getByRole("link", { name: "개정판 2" })).toBeFocused();
  await page.keyboard.press(tab);
  const coverageSummary = coverage.getByText("표로 보기", { exact: true });
  await expect(coverageSummary).toBeFocused();
  await page.keyboard.press("Space");
  const coverageTable = coverage.getByRole("table");
  await expect(coverageTable).toBeVisible();
  await expect(coverageTable.getByRole("row")).toHaveCount(6);
  await expect(
    coverage.getByText("발행 시각을 모르는 기사 1건은 관측 시각으로 셌습니다."),
  ).toBeVisible();

  await expectNoAxeViolations(page, testInfo, "story-changes");
  await expectReflow(page, testInfo, 390, "story-changes-390");

  // 개정판 고정 URL로 이동
  await stripTable.getByRole("link", { name: "개정판 1" }).click();
  await page.waitForURL(
    `**/story/multi-revision-changes/revision/${encodeURIComponent(MULTI_REV_1)}`,
  );
  await mountView(page, multiRevisionFirstFixture);
  const firstChanges = page.getByRole("region", { name: "변화" });
  await expect(firstChanges.getByText("아직 변화가 없습니다")).toBeVisible();
  const firstStrip = page
    .getByRole("figure", { name: /개정판 이력/ })
    .locator("ol")
    .getByRole("link");
  await expect(firstStrip).toHaveText(["개정판 1"]);
  await expect(firstStrip.first()).toHaveAttribute("aria-current", "page");
});
