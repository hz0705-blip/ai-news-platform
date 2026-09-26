import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./axe.ts";
import { DESKTOP_MIN, evidenceOf } from "./evidence.ts";
import { expectReflow, measureReflow } from "./reflow.ts";

const STORY_URL = "/story/demo-2-conflict";
const VIEWPORTS = [
  { name: "모바일 320px", width: 320, height: 800 },
  { name: "데스크톱 1280px", width: 1280, height: 900 },
] as const;

const ARTICLE_PATH = new URL(
  "../../../packages/pipeline/fixtures/demo-2-conflict/articles/meridian-beryl.txt",
  import.meta.url,
);
// 픽스처 기사 본문의 마지막 문장. golden/revision.json의 어떤 excerpt에도 들어가지 않는다.
const UNSEEN_SENTENCE_2 =
  "Neither side gave details of the outstanding differences, and the authority did not say how long the suspension would last.";

test.describe("데모 사건 ② — 동시 보도 상충", () => {
  test("사건 배지 보도 상충, 설명 문구, 상태별 개수 링크", async ({ page }) => {
    await page.goto(STORY_URL);
    const header = page.locator("header");
    await expect(header.getByText("보도 상충", { exact: true }).first()).toBeVisible();
    await expect(header.getByText("출처에 따라 보도가 다릅니다.")).toBeVisible();
    const counts = page.getByRole("list", { name: "주장 상태별 개수" });
    await expect(counts).toContainText("복수 출처 일치 2개");
    await expect(counts.getByRole("link", { name: /보도 상충 1개/ })).toHaveAttribute(
      "href",
      "#claim-2",
    );
  });

  test("상충 주장의 근거는 발행 시각 순 동등 행이고 순서·다른 점을 보인다", async ({ page }) => {
    await page.goto(STORY_URL);
    const claim = page.getByRole("listitem").filter({ has: page.locator("#claim-2") });
    await expect(claim.getByText("보도 상충", { exact: true })).toBeVisible();
    await claim.getByRole("button", { name: /근거 2개 보기/ }).click();
    const region = evidenceOf(page, 2, page.viewportSize()?.width ?? 0);
    const rows = region.getByRole("listitem");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("보도 1/2");
    await expect(rows.nth(0)).toContainText("Meridian Wire");
    await expect(rows.nth(0)).toContainText("다른 점");
    await expect(rows.nth(0)).toContainText("모든 컨테이너 작업이 중단됐다고 보도");
    await expect(rows.nth(1)).toContainText("보도 2/2");
    await expect(rows.nth(1)).toContainText("Harbor Ledger");
    await expect(rows.nth(1)).toContainText("다른 점");
    await expect(rows.nth(1)).toContainText("선석 4곳 중 2곳");
    const times = await rows
      .locator("time")
      .evaluateAll((els) => els.map((el) => el.getAttribute("datetime")));
    expect(times).toEqual(["2026-09-16T07:15:00.000Z", "2026-09-16T08:40:00.000Z"]);
    // A/B 탭·승자·퍼센트 없음
    await expect(region.getByRole("tab")).toHaveCount(0);
    await expect(region.getByText(/%/)).toHaveCount(0);
  });

  test("상충이 아닌 주장의 근거 행에는 순서·다른 점이 없다", async ({ page }) => {
    await page.goto(STORY_URL);
    const claim = page.getByRole("listitem").filter({ has: page.locator("#claim-1") });
    await claim.getByRole("button", { name: /근거 2개 보기/ }).click();
    const region = evidenceOf(page, 1, page.viewportSize()?.width ?? 0);
    await expect(region.getByRole("listitem")).toHaveCount(2);
    await expect(region.getByText(/^보도 \d\/\d$/)).toHaveCount(0);
    await expect(region.getByText("다른 점")).toHaveCount(0);
  });

  test("기사 본문 전체가 HTML·RSC 페이로드 어디에도 없다(모든 패널 펼침)", async ({ page }) => {
    // 모든 근거를 한꺼번에 드러내는 것은 인라인 아코디언에서만 가능하다 — 모바일 폭으로 고정한다(Ruling 24-7).
    await page.setViewportSize({ width: 390, height: 844 });
    expect(readFileSync(ARTICLE_PATH, "utf8")).toContain(UNSEEN_SENTENCE_2);
    // 응답 본문 읽기를 약속으로 모아 전부 기다린다 — 읽기 실패를 ""로 삼키면 검사가 비어도 통과한다.
    const reads: Promise<string>[] = [];
    page.on("response", (response) => {
      const type = response.headers()["content-type"] ?? "";
      if (type.includes("text/html") || type.includes("text/x-component")) {
        reads.push(response.text());
      }
    });
    await page.goto(STORY_URL);
    const triggers = page.getByRole("button", { name: /근거 \d+개 보기/ });
    await expect(triggers).toHaveCount(3);
    for (const trigger of await triggers.all()) await trigger.click();
    await page.waitForLoadState("networkidle");
    const bodies = await Promise.all(reads);
    expect(bodies.length).toBeGreaterThan(0);
    const html = await page.content();
    expect(html).toContain("보도 1/2"); // 검사가 비어 있지 않다
    expect(bodies.some((body) => body.includes("보도 상충"))).toBe(true);
    expect(html).not.toContain(UNSEEN_SENTENCE_2);
    for (const body of bodies) expect(body).not.toContain(UNSEEN_SENTENCE_2);
  });

  test("딥링크로 들어와 닫은 뒤 같은 해시의 헤더 링크를 다시 누르면 다시 펼치고 포커스한다", async ({
    page,
  }) => {
    await page.goto(`${STORY_URL}#claim-2`);
    const trigger = page.getByRole("button", { name: /근거 \d+개 보기/ }).nth(1);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await page
      .getByRole("list", { name: "주장 상태별 개수" })
      .getByRole("link", { name: /보도 상충 1개/ })
      .click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#claim-2")).toBeFocused();
  });

  for (const width of [320, 640, 1440]) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`딥링크 상충 주장 리플로우·스크린샷·axe ${width}px ${colorScheme}`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: width === 640 ? 450 : 900 });
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
        await page.goto(`${STORY_URL}#claim-2`);
        await expect(page.locator("#claim-2")).toBeFocused();
        await expect(evidenceOf(page, 2, width)).toBeVisible();
        if (width >= DESKTOP_MIN) {
          await expect(evidenceOf(page, 2, width).getByRole("heading", { level: 2 })).toHaveText(
            "주장 2의 근거",
          );
        }
        const name = `conflict-${width}-${colorScheme}`;
        await expectReflow(page, testInfo, width, name);
        if (width === 320) {
          const { claimTextLines } = await measureReflow(page);
          expect(claimTextLines.length).toBe(3);
          for (const lines of claimTextLines) expect(lines).toBeGreaterThanOrEqual(2);
        }
        await expectNoAxeViolations(page, testInfo, name);
      });
    }
  }

  for (const colorScheme of ["light", "dark"] as const) {
    for (const viewport of VIEWPORTS) {
      test(`axe 위반 0 — ${colorScheme}, ${viewport.name}, 접힘·펼침`, async ({
        page,
      }, testInfo) => {
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(STORY_URL);
        const cell = `${colorScheme}-${viewport.width}`;
        // 주장 목록은 스트리밍되는 동적 구획이다 — 셸만 검사하지 않도록 세 주장이 다 그려질 때까지 기다린다.
        const triggers = page.getByRole("button", { name: /근거 \d+개 보기/ });
        await expect(triggers).toHaveCount(3);

        await expectNoAxeViolations(page, testInfo, `${cell}-collapsed`);

        for (const trigger of await triggers.all()) {
          await trigger.click();
          await expect(trigger).toHaveAttribute("aria-expanded", "true");
        }
        if (viewport.width >= DESKTOP_MIN) {
          // 데스크톱: 패널은 마지막으로 활성화한 주장 3만 보이고, 마지막 트리거만 펼침 상태다.
          await expect(
            evidenceOf(page, 3, viewport.width).getByRole("heading", { level: 2 }),
          ).toHaveText("주장 3의 근거");
          for (const i of [0, 1]) {
            await expect(triggers.nth(i)).toHaveAttribute("aria-expanded", "false");
          }
          await expect(triggers.nth(2)).toHaveAttribute("aria-expanded", "true");
        } else {
          await expect(evidenceOf(page, 2, viewport.width)).toBeVisible();
        }

        await expectNoAxeViolations(page, testInfo, `${cell}-expanded`);
      });
    }
  }
});
