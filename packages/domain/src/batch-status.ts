import { latestSlotAtOrBefore, slotKeyOf } from "./batch-slot.ts";

/**
 * 오늘 화면의 기한 슬롯(스펙 "배치와 비용"). 배치는 05:00·17:00에 시작하고 화면은 06:00·18:00 갱신을
 * 약속하므로, 약속 시각이 지난 가장 최근 슬롯을 오늘 화면 캐시의 발행 배치 키로 쓴다.
 */
export const DISPLAY_DELAY_MS = 60 * 60 * 1000;

/** `now`에 약속 시각(슬롯 + 1시간)이 지난 가장 최근 슬롯의 키. 오늘 화면 캐시의 발행 배치 키다. */
export function dueSlotKeyOf(now: Date): string {
  return slotKeyOf(latestSlotAtOrBefore(new Date(now.getTime() - DISPLAY_DELAY_MS)));
}
