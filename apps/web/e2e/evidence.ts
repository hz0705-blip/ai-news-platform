import type { Locator, Page } from "@playwright/test";

/** 데스크톱 근거 패널이 보이기 시작하는 CSS 폭(Tailwind `lg` = 64rem, Ruling 24-2). */
export const DESKTOP_MIN = 1024;

/** 주장 N의 근거 행이 그려지는 곳: 데스크톱은 옆 패널, 그 아래 폭은 인라인 펼침 영역(Ruling 24-7). */
export function evidenceOf(page: Page, order: number, width: number): Locator {
  return page.locator(width >= DESKTOP_MIN ? "#evidence-panel" : `#claim-${order}-evidence`);
}
