import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { componentFixture } from "./component-fixture.tsx";

for (const colorScheme of ["light", "dark"] as const) {
  // 640×450은 1280×900에서 200% 확대했을 때의 CSS 가용 영역 대체 검사다.
  // 브라우저 메뉴 확대·실기기 검증으로 간주하지 않는다.
  for (const width of [320, 640, 1440]) {
    test(`${colorScheme} ${width}px 기본 페이지`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: width === 640 ? 450 : 900 });
      const response = await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("사건으로 읽는 해외 보도");
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.fonts.check('17px "Pretendard Variable"'))).toBe(
        true,
      );
      expect(
        await page.evaluate(() =>
          [...document.fonts].some(
            (font) => font.family.includes("Pretendard") && font.status === "loaded",
          ),
        ),
      ).toBe(true);
      expect(await page.locator('link[rel="preload"][as="font"]').count()).toBe(0);
      expect(response?.headers().link ?? "").not.toMatch(/woff2|as=font/);
      await expect(page.locator("html")).toHaveAttribute("lang", "ko");
      await expect(page.locator("html")).toHaveCSS("font-size", "16px");
      await expect(page.locator("body")).toHaveCSS("font-size", width < 1024 ? "17px" : "18px");
      await expect(page.getByRole("heading", { level: 1 })).toHaveCSS(
        "font-size",
        width < 1024 ? "26px" : "32px",
      );
      await expect(page.getByRole("button", { name: /테마|다크|라이트/ })).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);

      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"])
        .analyze();
      await testInfo.attach("axe", {
        body: JSON.stringify(result, null, 2),
        contentType: "application/json",
      });
      expect(result.violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath("foundation.png"), fullPage: true });

      const before = await page
        .locator("body")
        .evaluate((body) => getComputedStyle(body).backgroundColor);
      await page.emulateMedia({ colorScheme: colorScheme === "light" ? "dark" : "light" });
      await expect
        .poll(() => page.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor))
        .not.toBe(before);
    });
  }
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`${colorScheme} 기본 컴포넌트 색·키보드·줄바꿈`, async ({ page, browserName }, testInfo) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/");
    await page.locator("main").evaluate((main, html) => {
      main.innerHTML = html;
    }, componentFixture());
    await page.evaluate(() => document.fonts.ready);
    const button = page.getByRole("button");
    const corrected = page.getByText("정정됨").locator("..");
    const colors = async (locator: typeof button) =>
      locator.evaluate((el) => {
        const css = getComputedStyle(el);
        return [css.backgroundColor, css.color];
      });
    expect(await colors(button)).not.toEqual(await colors(corrected));
    const tokens = await button.evaluate((el) => {
      const probe = document.createElement("span");
      probe.style.backgroundColor = "var(--primary)";
      probe.style.color = "var(--primary-foreground)";
      el.append(probe);
      const css = getComputedStyle(probe);
      const pair = [css.backgroundColor, css.color];
      probe.remove();
      return pair;
    });
    expect(await colors(button)).toEqual(tokens);
    // macOS WebKit은 링크 순회에 Option-Tab을 사용한다(Apple Safari 키보드 안내).
    const next = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
    await page.keyboard.press(next);
    await expect(button).toBeFocused();
    await expect(button).toHaveCSS("outline-width", "2px");
    await expect(button).toHaveCSS("outline-offset", "2px");
    await page.keyboard.press(next);
    await expect(page.getByRole("link")).toBeFocused();
    await expect(page.getByRole("link")).toHaveCSS("text-decoration-line", "underline");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= 320)).toBe(true);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"])
      .analyze();
    expect(result.violations).toEqual([]);
    await testInfo.attach("component-axe", {
      body: JSON.stringify(result, null, 2),
      contentType: "application/json",
    });
    await page.screenshot({ path: testInfo.outputPath("components.png"), fullPage: true });
  });
}
