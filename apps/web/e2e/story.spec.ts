import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./axe.ts";

const STORY_URL = "/story/demo-1-agreement";
// 픽스처 기사 본문에만 있고 어떤 근거 발췌(허용 발췌 창)에도 들어가지 않는 문장.
// Task 4의 픽스처를 쓸 때 이 문장을 articles/meridian-wire.txt 끝에 두고 어느 근거도 그 문장을 인용하지 않게 한다.
const UNSEEN_SENTENCE =
  "This closing paragraph exists only in the fixture body and never appears on screen.";

const ABSOLUTE_TIME = /^\d{4}\. \d{1,2}\. \d{1,2}\. (오전|오후) \d{1,2}:\d{2} KST$/;

test("핵심 루프: 주장 → 근거 펼침 → 원문 링크 → 변화 구획", async ({ page }) => {
  await page.goto(STORY_URL);

  await expect(page.getByText("기능 설명을 위해 만든 데모 사건입니다.")).toBeVisible();
  await expect(page.getByText("데모 사건", { exact: true })).toBeVisible();

  // 사건 갱신 시각: 라벨 + 절대 시각 형식 + 기계 가독 datetime
  const updated = page.locator("header").getByRole("time");
  await expect(updated).toHaveAttribute("datetime", "2026-09-17T00:30:00.000Z");
  await expect(updated).toHaveText(ABSOLUTE_TIME);
  await expect(page.locator("header")).toContainText("사건 갱신");

  // 첫 진입: 모든 펼침 버튼이 접혀 있고 근거 영역이 하나도 없다
  const triggers = page.getByRole("button", { name: /근거 \d+개 보기/ });
  const count = await triggers.count();
  expect(count).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < count; i += 1) {
    await expect(triggers.nth(i)).toHaveAttribute("aria-expanded", "false");
  }
  await expect(page.locator("[id$='-evidence']:not([hidden])")).toHaveCount(0);

  const trigger = triggers.first();
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(trigger).toBeFocused();

  const evidence = page.locator("#claim-1-evidence");
  await expect(evidence.locator("[lang='en']").first()).toBeVisible();
  await expect(evidence.getByText("기사 발행").first()).toBeVisible();
  await expect(evidence.getByRole("time").first()).toHaveText(ABSOLUTE_TIME);
  const link = evidence.getByRole("link", { name: /원문/ }).first();
  await expect(link).toHaveAttribute("href", /^https:\/\/meridianwire\.example\//);
  await expect(link).toHaveAttribute("rel", /noopener/);
  await expect(evidence.getByRole("button", { name: /번역/ }).first()).toBeDisabled();
  await expect(evidence.getByText("번역은 준비 중입니다").first()).toBeVisible();

  // 출처 구획: 셋 모두, 링크만 등급 표기
  const sources = page.getByRole("region", { name: "출처" });
  await expect(sources.getByText("Atlas Dispatch")).toBeVisible();
  await expect(sources.getByText("링크만")).toBeVisible();

  await expect(
    page.getByRole("region", { name: "변화" }).getByText("아직 변화가 없습니다"),
  ).toBeVisible();
});

test("사건 머리에 상태 설명 문구와 상태별 개수 링크가 있다", async ({ page }) => {
  await page.goto(STORY_URL);
  const header = page.locator("header");
  await expect(header.getByText("여러 출처의 보도가 이 주장에 일치합니다.")).toBeVisible();
  const counts = page.getByRole("list", { name: "주장 상태별 개수" });
  await expect(counts.getByRole("link", { name: /복수 출처 일치 4개/ })).toHaveAttribute(
    "href",
    "#claim-1",
  );
});

test("Space로도 펼치고 접는다", async ({ page }) => {
  await page.goto(STORY_URL);
  const trigger = page.getByRole("button", { name: /근거 \d+개 보기/ }).first();
  await trigger.focus();
  await page.keyboard.press("Space");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Space");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("키보드만으로 주장 → 근거 → 원문 링크를 완주한다", async ({ page, browserName }) => {
  await page.goto(STORY_URL);
  const trigger = page.getByRole("button", { name: /근거 \d+개 보기/ }).first();
  // WebKit은 기본 설정에서 Tab이 버튼을 건너뛰므로(#20에서 확인) 트리거까지는 focus()로 옮기고, 그 뒤 Tab 이동만 검증한다.
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
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(trigger).toBeFocused();

  // macOS WebKit은 링크 순회에 Option-Tab을 쓴다(foundation.spec.ts와 같은 규칙). Linux CI의 WebKit은 Tab이다.
  await page.keyboard.press(
    browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab",
  );
  const firstLink = page.locator("#claim-1-evidence").getByRole("link", { name: /원문/ }).first();
  await expect(firstLink).toBeFocused();

  await page.keyboard.press("Space");
  // Space는 링크를 활성화하지 않는다 — 포커스가 그대로인지 확인해 펼침 버튼과 링크가 분리돼 있음을 본다.
  await expect(firstLink).toBeFocused();
});

test("기사 본문 전체가 HTML·RSC 페이로드 어디에도 없다", async ({ page }) => {
  const bodies: string[] = [];
  page.on("response", async (response) => {
    const type = response.headers()["content-type"] ?? "";
    if (type.includes("text/html") || type.includes("text/x-component")) {
      bodies.push(await response.text().catch(() => ""));
    }
  });
  await page.goto(STORY_URL);
  // 모든 근거를 펼쳐 발췌가 전부 드러난 뒤에도 미노출 문장이 없어야 한다
  const triggers = page.getByRole("button", { name: /근거 \d+개 보기/ });
  for (let i = 0, n = await triggers.count(); i < n; i += 1) await triggers.nth(i).click();
  await page.waitForLoadState("networkidle");

  const html = await page.content();
  expect(html).not.toContain(UNSEEN_SENTENCE);
  expect(bodies.join("\n")).not.toContain(UNSEEN_SENTENCE);
  // 반대로, 발췌는 실제로 보인다 — 검사가 비어 있지 않음을 확인
  expect(html).toContain("agreed on the framework");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`axe 위반 0 — ${colorScheme}, 접힘·펼침`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(STORY_URL);

    for (const state of ["collapsed", "expanded"] as const) {
      if (state === "expanded") {
        const trigger = page.getByRole("button", { name: /근거 \d+개 보기/ }).first();
        await trigger.click();
        await expect(trigger).toHaveAttribute("aria-expanded", "true");
      }
      await expectNoAxeViolations(page, testInfo, `${colorScheme}-${state}`);
    }
  });
}

test("딥링크 #claim-2로 들어오면 그 주장만 펼쳐지고 헤딩에 포커스·스크롤된다", async ({ page }) => {
  await page.goto(`${STORY_URL}#claim-2`);
  const heading = page.locator("#claim-2");
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
  const triggers = page.getByRole("button", { name: /근거 \d+개 보기/ });
  await expect(triggers.nth(1)).toHaveAttribute("aria-expanded", "true");
  for (const i of [0, 2, 3]) {
    await expect(triggers.nth(i)).toHaveAttribute("aria-expanded", "false");
  }
  await expect(page.locator("#claim-2-evidence")).toBeVisible();
  await expect(page.locator("#claim-1-evidence")).toBeHidden();
});

test("헤더의 상태별 개수 링크는 주장 헤딩으로 가고 그 주장을 펼친다", async ({ page }) => {
  await page.goto(STORY_URL);
  await page.getByRole("list", { name: "주장 상태별 개수" }).getByRole("link").first().click();
  await expect(page.locator("#claim-1")).toBeFocused();
  await expect(page.getByRole("button", { name: /근거 \d+개 보기/ }).first()).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

test("두 패널이 동시에 열리고 aria-controls가 각자의 영역을 가리키며 영역은 랜드마크가 아니다", async ({
  page,
}) => {
  await page.goto(STORY_URL);
  const triggers = page.getByRole("button", { name: /근거 \d+개 보기/ });
  await triggers.nth(0).click();
  await triggers.nth(1).click();
  await expect(triggers.nth(0)).toHaveAttribute("aria-controls", "claim-1-evidence");
  await expect(triggers.nth(1)).toHaveAttribute("aria-controls", "claim-2-evidence");
  await expect(page.locator("#claim-1-evidence")).toBeVisible();
  await expect(page.locator("#claim-2-evidence")).toBeVisible();
  // 페이지 구획 "주장"(region)은 그대로 있다 — 펼침 영역은 예전처럼 "주장 N" 이름의 region이 아니어야 한다.
  await expect(page.getByRole("region", { name: /^주장 \d/ })).toHaveCount(0);
  for (const id of ["#claim-1-evidence", "#claim-2-evidence"]) {
    await expect(page.locator(id)).not.toHaveAttribute("role", /.+/);
    await expect(page.locator(id)).not.toHaveAttribute("aria-labelledby", /.+/);
    expect(await page.locator(id).evaluate((el) => el.tagName)).toBe("DIV");
  }
  await triggers.nth(0).click();
  await expect(page.locator("#claim-1-evidence")).toBeHidden();
  await expect(page.locator("#claim-2-evidence")).toBeVisible();
});

test("두 번째 주장에서도 트리거 → 패널 링크 순서로 포커스가 흐르고 원문 링크는 버튼 밖이다", async ({
  page,
  browserName,
}) => {
  await page.goto(STORY_URL);
  const trigger = page.getByRole("button", { name: /근거 \d+개 보기/ }).nth(1);
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(trigger).toBeFocused();
  await page.keyboard.press(
    browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab",
  );
  const link = page.locator("#claim-2-evidence").getByRole("link", { name: /원문/ }).first();
  await expect(link).toBeFocused();
  expect(await trigger.locator("a, button").count()).toBe(0);
});
