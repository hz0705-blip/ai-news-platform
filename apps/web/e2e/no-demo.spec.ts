import { expect } from "@playwright/test";
import { storyOgImagePath } from "../lib/share-card.ts";
import { authEnv, test } from "./auth.ts";

if (authEnv() === null && process.env.CI) throw new Error("CI requires local Supabase Auth");

const demos = ["demo-1-agreement", "demo-2-conflict", "demo-3-correction", "demo-4-figures"];

test("데모 직접 URL과 고정 개정판은 기사를 노출하지 않는다", async ({ page }) => {
  for (const slug of demos) {
    for (const path of [
      `/story/${slug}`,
      `/story/${slug}/revision/${encodeURIComponent(`${slug}:rev-1`)}`,
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(page.getByRole("heading", { name: "페이지를 찾을 수 없습니다" })).toBeVisible();
      await expect(page.getByRole("region", { name: "주장", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /근거 \d+개 보기/ })).toHaveCount(0);
    }
  }
});

test("데모 OG는 사건 내용이 없는 안전 카드만 반환한다", async ({ request }) => {
  const missing = await request.get(storyOgImagePath("missing", "missing"));
  expect(missing.status()).toBe(200);
  const safeCard = await missing.body();
  for (const slug of demos) {
    const response = await request.get(storyOgImagePath(slug, `${slug}:rev-1`));
    expect(response.headers()["content-type"]).toContain("image/png");
    expect(await response.body()).toEqual(safeCard);
  }
});

test("로그인한 사용자도 데모 팔로우나 방문을 기록하지 않는다", async ({
  makeUser,
  openAs,
  baseURL,
}) => {
  test.skip(authEnv() === null, "로컬 Supabase가 필요하다");
  const context = await openAs(await makeUser("no-demo"));
  const headers = { Origin: baseURL ?? "" };
  const followed = await context.request.post("/api/me/story-follow", {
    headers,
    data: { slug: demos[0], following: true },
  });
  expect(followed.status()).toBe(200);
  expect(await followed.json()).toMatchObject({ following: false });
  const visited = await context.request.post("/api/me/story-visit", {
    headers,
    data: { slug: demos[0], revisionId: `${demos[0]}:rev-1`, follow: true },
  });
  expect(visited.status()).toBe(200);
  expect(await visited.json()).toMatchObject({ following: false, lastSeenRevisionId: null });
  const page = await context.newPage();
  await page.goto("/follows");
  await expect(page.getByText("아직 팔로우한 사건이 없습니다")).toBeVisible();
  await expect(page.locator('a[href*="/story/demo-"]')).toHaveCount(0);
});
