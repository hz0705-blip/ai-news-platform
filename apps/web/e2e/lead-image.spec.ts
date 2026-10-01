import type { LeadImage as LeadImageData } from "@newstrail/db";
import { expect, type Page, test } from "@playwright/test";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { LeadImage } from "../components/lead-image.tsx";

// Worker-local memory bundle: server markup first, then hydration — no public fixture route.
let bundle: Promise<string> | undefined;
function hydrationBundle(): Promise<string> {
  bundle ??= build({
    entryPoints: ["e2e/lead-image-entry.tsx"],
    bundle: true,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    write: false,
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
  }).then((result) => result.outputFiles.map((file) => file.text).join("\n"));
  return bundle;
}

async function serveFixture(page: Page, image: LeadImageData, priority: boolean, spacer = 0) {
  const markup = renderToString(createElement(LeadImage, { image, isDemo: false, priority }));
  await page.route("**/__lead_image_fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>대표 이미지 검사</title><script>window.__LEAD_IMAGE__ = ${JSON.stringify({ image, priority })};</script></head><body><div style="height:${spacer}px"></div><div id="lead-image-fixture">${markup}</div></body></html>`,
    }),
  );
  await page.goto("/__lead_image_fixture");
  await expect(page.locator("figure.lead-image")).toHaveCount(1);
}

async function hydrate(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addScriptTag({ content: await hydrationBundle() });
  return errors;
}

const image = {
  url: "https://images.example.test/missing.jpg",
  articleUrl: "https://example.test/article",
  sourceName: "검사용 출처",
};

test("즉시 실패한 대표 이미지는 슬롯을 남기지 않는다", async ({ page }) => {
  await page.route(image.url, (route) => route.fulfill({ status: 404, body: "" }));
  await serveFixture(page, image, true);
  // 하이드레이션 전에 실패가 끝난 상태를 만든다 — 이 error 이벤트는 다시 오지 않는다.
  await page.waitForFunction(() => document.querySelector("img")?.complete === true);
  expect(await page.locator("img").evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(0);
  const errors = await hydrate(page);
  await expect(page.locator("figure.lead-image")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "사진 · 검사용 출처" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("아직 불러오지 않은 지연 로딩 대표 이미지는 하이드레이션 뒤에도 슬롯을 지킨다", async ({
  page,
}) => {
  const lazy = { ...image, url: "https://images.example.test/lazy.svg" };
  await page.route(lazy.url, (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#567"/></svg>',
    }),
  );
  await serveFixture(page, lazy, false, 5000);
  const errors = await hydrate(page);
  await expect(page.locator("figure.lead-image")).toHaveCount(1);
  await page.locator("figure.lead-image").scrollIntoViewIfNeeded();
  await expect
    .poll(() => page.locator("img").evaluate((node: HTMLImageElement) => node.naturalWidth))
    .toBe(900);
  await expect(page.locator("figure.lead-image")).toHaveCount(1);
  expect(errors).toEqual([]);
});
