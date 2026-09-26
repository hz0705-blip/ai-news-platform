import { expect, type Page, test } from "@playwright/test";
import { expectNoAxeViolations } from "./axe.ts";
import { evidenceOf } from "./evidence.ts";
import { expectReflow } from "./reflow.ts";

// 데스크톱 근거 패널(#24)의 인수 조건. 기본 1440×900.
test.use({ viewport: { width: 1440, height: 900 } });

const STORY_URL = "/story/demo-1-agreement";
// story.spec.ts와 같은 문장 — 픽스처 기사 본문에만 있고 어떤 근거 발췌에도 들어가지 않는다.
const UNSEEN_SENTENCE =
  "This closing paragraph exists only in the fixture body and never appears on screen.";

const triggersOf = (page: Page) => page.getByRole("button", { name: /근거 \d+개 보기/ });
const panelHeading = (page: Page) => page.locator("#evidence-panel-heading");
// macOS WebKit은 링크 순회에 Option-Tab을 쓴다(story.spec.ts와 같은 규칙).
const linkTab = (browserName: string) =>
  browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";

/** 트리거 N을 활성화하고 패널이 그 주장으로 바뀔 때까지 기다린다. */
async function activate(page: Page, order: number) {
  const trigger = triggersOf(page).nth(order - 1);
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(panelHeading(page)).toHaveText(`주장 ${order}의 근거`);
}

test("포커스만 옮기면 패널이 바뀌지 않고 활성화하면 바뀐다", async ({ page }) => {
  await page.goto(STORY_URL);
  const trigger = triggersOf(page).nth(1);
  // 하이드레이션 뒤 트리거가 패널을 가리킬 때까지 기다린다(첫 렌더는 모바일 스냅샷).
  await expect(trigger).toHaveAttribute("aria-controls", "evidence-panel");
  await trigger.focus();
  await expect(panelHeading(page)).toHaveText("근거");
  await expect(
    page.locator("#evidence-panel").getByText("주장의 근거 보기를 누르면 여기에 보입니다"),
  ).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await page.keyboard.press("Enter");
  await expect(panelHeading(page)).toHaveText("주장 2의 근거");
  const claimText = await page.locator("#claims ol > li").nth(1).locator("> p").textContent();
  expect(claimText).toBeTruthy();
  await expect(page.locator("#evidence-panel p", { hasText: claimText ?? "" }).first()).toHaveText(
    claimText ?? "",
  );
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#claim-2-evidence > *")).toHaveCount(0);

  // 선택된 상태에서도 포커스 이동만으로는 패널이 바뀌지 않는다.
  await activate(page, 1);
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await expect(panelHeading(page)).toHaveText("주장 1의 근거");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("이동 링크 둘의 포커스 도착 지점", async ({ page }) => {
  await page.goto(STORY_URL);
  await activate(page, 2);
  await page.getByRole("link", { name: "선택한 근거로 이동" }).click();
  await expect(panelHeading(page)).toBeFocused();
  await page.getByRole("link", { name: "주장 2로 돌아가기" }).click();
  await expect(page.locator("#claim-2")).toBeFocused();
});

test("패널은 문서 스크롤 안에 있다", async ({ page }) => {
  await page.goto(STORY_URL);
  await activate(page, 2);
  const panel = page.locator("#evidence-panel");
  const style = await panel.evaluate((el) => {
    const s = getComputedStyle(el);
    return { overflowY: s.overflowY, position: s.position };
  });
  expect(style.overflowY).toBe("visible");
  expect(["sticky", "fixed"]).not.toContain(style.position);
  await expect(panel).not.toHaveAttribute("role", "dialog");
  await expect(panel).not.toHaveAttribute("aria-modal", /.*/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("선택 표시는 글자와 선", async ({ page }) => {
  await page.goto(STORY_URL);
  await activate(page, 2);
  const item = page.locator("#claims ol > li").nth(1);
  await expect(item.getByText("선택됨", { exact: true })).toBeVisible();
  const border = await item.evaluate((el) =>
    Number.parseFloat(getComputedStyle(el).borderInlineStartWidth),
  );
  expect(border).toBeGreaterThanOrEqual(2);
  await expect(page.locator("#claims ol > li").nth(0).getByText("선택됨")).toHaveCount(0);
});

test("키보드 완주: 트리거 → 선택한 근거로 이동 → 패널 헤딩 → 원문 링크", async ({
  page,
  browserName,
}) => {
  await page.goto(STORY_URL);
  const trigger = triggersOf(page).first();
  await expect(trigger).toHaveAttribute("aria-controls", "evidence-panel");
  // WebKit은 기본 설정에서 Tab이 버튼을 건너뛰므로 트리거까지는 focus()로 옮긴다(story.spec.ts와 같은 규칙).
  if (browserName === "webkit") await trigger.focus();
  else {
    for (
      let i = 0;
      i < 20 && !(await trigger.evaluate((el) => el === document.activeElement));
      i += 1
    ) {
      await page.keyboard.press("Tab");
    }
  }
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(panelHeading(page)).toHaveText("주장 1의 근거");
  await expect(trigger).toBeFocused();

  await page.keyboard.press(linkTab(browserName));
  const goTo = page.getByRole("link", { name: "선택한 근거로 이동" });
  await expect(goTo).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(panelHeading(page)).toBeFocused();

  await page.keyboard.press(linkTab(browserName));
  await expect(page.getByRole("link", { name: "주장 1로 돌아가기" })).toBeFocused();
  await page.keyboard.press(linkTab(browserName));
  await expect(
    page.locator("#evidence-panel").getByRole("link", { name: /원문/ }).first(),
  ).toBeFocused();
});

test("640×450(200% 확대)으로 좁히면 모바일 배치로 전환되고 선택·펼침이 유지된다", async ({
  page,
}) => {
  await page.goto(STORY_URL);
  await activate(page, 1);
  await activate(page, 2);
  // 640×450 is the CSS viewport equivalent of 1280×900 at 200%, not browser-menu zoom (Ruling 24-8).
  await page.setViewportSize({ width: 640, height: 450 });
  const trigger = triggersOf(page).nth(1);
  await expect(page.locator("#evidence-panel")).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-controls", "claim-2-evidence");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#claim-2-evidence")).toBeVisible();
  // 데스크톱에서 본 주장만 펼침으로 남는다 — 다른 주장의 인라인 영역은 닫혀 있다.
  for (const order of [1, 3, 4]) {
    await expect(page.locator(`#claim-${order}-evidence`)).toBeHidden();
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("#evidence-panel")).toBeVisible();
  await expect(panelHeading(page)).toHaveText("주장 2의 근거");
});

test("전환 폭 실측", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1023, height: 900 });
  await page.goto(STORY_URL);
  await expect(page.locator("#evidence-panel")).toBeHidden();
  const first = triggersOf(page).first();
  await first.click();
  await expect(first).toHaveAttribute("aria-expanded", "true");
  await expect(evidenceOf(page, 1)).toBeVisible();

  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(STORY_URL);
    await expect(page.locator("#evidence-panel")).toBeVisible();
    await activate(page, 2);
    await expectReflow(page, testInfo, width, `columns-${width}`);
    const columns = await page.evaluate(() => ({
      viewport: innerWidth,
      claims: document.getElementById("claims")?.getBoundingClientRect().width ?? 0,
      aside: document.getElementById("evidence-panel")?.getBoundingClientRect().width ?? 0,
    }));
    await testInfo.attach(`columns-${width}.json`, {
      body: JSON.stringify(columns, null, 2),
      contentType: "application/json",
    });
    expect(columns.viewport).toBe(width);
    expect(columns.claims).toBeGreaterThan(0);
    expect(columns.aside).toBeGreaterThan(0);
  }
});

test("주장을 차례로 활성화해도 기사 본문 미노출 문장이 HTML·RSC 페이로드에 없다", async ({
  page,
}) => {
  // 응답 본문 읽기를 약속으로 모아 전부 기다린다 — 읽기 실패를 ""로 삼키면 검사가 비어도 통과한다.
  const reads: Promise<string>[] = [];
  page.on("response", (response) => {
    const type = response.headers()["content-type"] ?? "";
    if (type.includes("text/html") || type.includes("text/x-component")) {
      reads.push(response.text());
    }
  });
  await page.goto(STORY_URL);
  await expect(triggersOf(page)).toHaveCount(4);
  // 패널은 한 번에 한 주장만 보이므로 주장마다 활성화해 그 상태의 DOM을 검사한다.
  const htmls: string[] = [];
  for (const order of [1, 2, 3, 4]) {
    await activate(page, order);
    htmls.push(await page.content());
  }
  await page.waitForLoadState("networkidle");
  const bodies = await Promise.all(reads);
  expect(bodies.length).toBeGreaterThan(0);

  // 반대로, 발췌는 실제로 보인다 — 검사가 비어 있지 않음을 확인
  expect(htmls.some((html) => html.includes("agreed on the framework"))).toBe(true);
  expect(bodies.some((body) => body.includes("복수 출처 일치"))).toBe(true);
  for (const html of htmls) expect(html).not.toContain(UNSEEN_SENTENCE);
  for (const body of bodies) expect(body).not.toContain(UNSEEN_SENTENCE);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`axe 위반 0 — ${colorScheme}, 선택 전·후`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto(STORY_URL);
    await expect(triggersOf(page).first()).toHaveAttribute("aria-controls", "evidence-panel");
    await expectNoAxeViolations(page, testInfo, `desktop-${colorScheme}-unselected`);
    await activate(page, 2);
    await expectNoAxeViolations(page, testInfo, `desktop-${colorScheme}-selected`);
  });
}
