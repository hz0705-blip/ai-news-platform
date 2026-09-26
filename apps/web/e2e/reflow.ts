import { expect, type Page, type TestInfo } from "@playwright/test";

export interface ReflowMeasurement {
  readonly viewport: number;
  readonly scrollWidth: number;
  /** 자기 상자보다 넓게 넘친 **보이는** 텍스트 요소(가로 스크롤·잘림의 원인). sr-only·hidden 제외. */
  readonly overflowing: readonly string[];
  /** 한 줄 말줄임이 걸린 요소. */
  readonly ellipsis: readonly string[];
  /** 주장 문장 `<p>`마다 줄 수(높이 ÷ 행간). */
  readonly claimTextLines: readonly number[];
  /** 정보 유실 검사: 핵심 요소 중 뷰포트 밖으로 나가거나 다른 요소에 덮인 것. */
  readonly obscured: readonly string[];
  /** 정보 유실 검사에 들어간 핵심 요소 수(0이면 검사가 비었다). */
  readonly keyElementCount: number;
}

/** 검사 대상 핵심 요소: 주장 문장, 펼침 버튼, 펼친 근거 행의 출처명·상태 문구·원문 링크, 헤더 제목. */
const KEY_SELECTOR =
  "main h1, main ol > li > p, main button[aria-expanded], main [id$='-evidence']:not([hidden]) li > p, main [id$='-evidence']:not([hidden]) a";

export function measureReflow(page: Page): Promise<ReflowMeasurement> {
  return page.evaluate((keySelector) => {
    const describe = (node: Element) =>
      `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}: ${(node.textContent ?? "").slice(0, 40)}`;
    const isVisuallyHidden = (node: Element) => {
      if (node.closest(".sr-only, [hidden]") !== null) return true;
      const rect = node.getBoundingClientRect();
      return rect.width <= 1 || rect.height <= 1;
    };
    const texts = [
      ...document.querySelectorAll("main :is(h1,h2,h3,p,a,button,dd,dt,blockquote,li,span,time)"),
    ].filter((n) => !isVisuallyHidden(n));
    // 인라인 상자는 스크롤 상자가 없어 clientWidth가 0이다(CSSOM). Firefox는 그래도 scrollWidth를 돌려주므로
    // 비교에서 빼고, 인라인 내용의 넘침은 그것을 담은 블록 요소(p·li·blockquote 등)에서 잡는다.
    const overflowing = texts
      .filter((n) => getComputedStyle(n).display !== "inline")
      .filter((n) => n.scrollWidth > n.clientWidth + 1)
      .map(describe);
    const ellipsis = texts
      .filter((n) => {
        const style = getComputedStyle(n);
        return style.textOverflow === "ellipsis" || style.webkitLineClamp !== "none";
      })
      .map(describe);
    const claimTextLines = [...document.querySelectorAll("main ol > li > p")].map((p) => {
      const style = getComputedStyle(p);
      return Math.round(p.getBoundingClientRect().height / Number.parseFloat(style.lineHeight));
    });
    const keys = [...document.querySelectorAll(keySelector)].filter((n) => !isVisuallyHidden(n));
    const obscured = keys
      .filter((n) => {
        const rect = n.getBoundingClientRect();
        if (rect.left < 0 || rect.right > innerWidth + 1) return true;
        n.scrollIntoView({ block: "center" });
        const r = n.getBoundingClientRect();
        const hit = document.elementFromPoint(
          r.left + Math.min(r.width / 2, 8),
          r.top + Math.min(r.height / 2, 8),
        );
        return hit === null || !(n === hit || n.contains(hit) || hit.contains(n));
      })
      .map(describe);
    window.scrollTo(0, 0);
    return {
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflowing,
      ellipsis,
      claimTextLines,
      obscured,
      keyElementCount: keys.length,
    };
  }, KEY_SELECTOR);
}

/** 가로 스크롤 없음·넘침 없음·말줄임 없음·핵심 요소 가림 없음을 단언하고 측정값·전체 페이지 PNG를 첨부한다(Ruling 23-5). */
export async function expectReflow(page: Page, testInfo: TestInfo, width: number, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const measurement = await measureReflow(page);
  await testInfo.attach(`reflow-${name}.json`, {
    body: JSON.stringify(measurement, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach(`screenshot-${name}.png`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  expect(measurement.scrollWidth).toBeLessThanOrEqual(width);
  expect(measurement.overflowing).toEqual([]);
  expect(measurement.ellipsis).toEqual([]);
  expect(measurement.keyElementCount).toBeGreaterThan(3);
  expect(measurement.obscured).toEqual([]);
}
