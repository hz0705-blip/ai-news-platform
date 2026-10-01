import { expect, test } from "@playwright/test";
import { storyOgImagePath } from "../lib/share-card.ts";
import { expectNoAxeViolations } from "./axe.ts";

test("깨진 사건·개정판 URL은 서버 오류 대신 한국어 400 안내를 반환한다", async ({
  page,
  request,
}, testInfo) => {
  for (const path of [
    "/story/%",
    "/story/%25",
    "/story/%E0%A4%A",
    "/story/%25E0%25A4%25A",
    "/story/missing/revision/%25",
    "/story/missing/revision/%25E0%25A4%25A",
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(400);
    expect(response.headers()["set-cookie"]).toBeUndefined();
    expect(response.headers()["cache-control"]).toBe("no-store");
    const body = await response.text();
    expect(body).toContain("주소를 확인해 주세요");
    expect(body).not.toMatch(/Internal Server Error|failed to decode|E528/);
  }

  await page.setViewportSize({ width: 320, height: 640 });
  const response = await page.goto("/story/%25");
  expect(response?.status()).toBe(400);
  await expect(page.getByRole("heading", { name: "주소를 확인해 주세요" })).toBeVisible();
  await expectNoAxeViolations(page, testInfo, "malformed-story-url");
  await page.getByRole("link", { name: "오늘의 사건으로" }).click();
  await expect(page.getByRole("heading", { name: "오늘의 지면", exact: true })).toBeVisible();
});

test("정상 인코딩의 없는 사건은 기존 찾기 안내를 유지한다", async ({ page, request }) => {
  for (const path of [
    "/story/missing-error-regression",
    "/story/fixture-1-agreement/revision/no-such-rev",
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
    expect(response.headers()["set-cookie"]).toBeUndefined();
    expect(await response.text()).toContain('content="noindex"');
    expect((await page.goto(path))?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "페이지를 찾을 수 없습니다" })).toBeVisible();
    await expect(page.getByRole("link", { name: "오늘의 사건으로" })).toBeVisible();
  }
});

test("깨진 공유 이미지 경로는 단일·이중 인코딩 모두 안전 PNG를 반환한다", async ({ request }) => {
  const fallback = await request.get("/og/story/invalid/invalid/invalid.png");
  const safeCard = await fallback.body();
  expect(fallback.status()).toBe(200);
  expect(fallback.headers()["content-type"]).toBe("image/png");
  const normal = await request.get(
    storyOgImagePath("fixture-1-agreement", "fixture-1-agreement:rev-1"),
  );
  expect(normal.status()).toBe(200);
  expect(normal.headers()["content-type"]).toBe("image/png");
  expect(normal.headers()["set-cookie"]).toBeUndefined();
  expect(await normal.body()).not.toEqual(safeCard);

  for (const segment of ["%", "%E0%A4%A", "%25", "%25E0%25A4%25A"]) {
    for (const path of [
      `/og/story/${segment}/missing/ko-t3-f1.3.9-nanum1.png`,
      `/og/story/fixture-1-agreement/${segment}/ko-t3-f1.3.9-nanum1.png`,
      `/og/story/fixture-1-agreement/missing/${segment}`,
      `/og/site/${segment}`,
    ]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expect(response.headers()["content-type"]).toBe("image/png");
      expect(response.headers()["set-cookie"]).toBeUndefined();
      expect(response.headers()["cache-control"]).toContain("public");
      if (segment === "%" || segment === "%E0%A4%A") {
        expect(response.headers()["cache-control"]).toBe("public, no-transform, max-age=300");
      }
      expect(await response.body(), path).toEqual(safeCard);
    }
  }
});
