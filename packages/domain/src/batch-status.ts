import { latestSlotAtOrBefore, slotKeyOf } from "./batch-slot.ts";

/**
 * 오늘 화면의 배치 상태(#56, 스펙 "배치와 비용"). 배치는 05:00·17:00에 시작하고 화면은 06:00·18:00 갱신을
 * 약속하므로, 약속 시각이 지난 가장 최근 슬롯(기한 슬롯)의 원장 행으로 상태를 정한다.
 */
export const DISPLAY_DELAY_MS = 60 * 60 * 1000;

/** `now`에 약속 시각(슬롯 + 1시간)이 지난 가장 최근 슬롯의 키. 오늘 화면 캐시의 발행 배치 키다. */
export function dueSlotKeyOf(now: Date): string {
  return slotKeyOf(latestSlotAtOrBefore(new Date(now.getTime() - DISPLAY_DELAY_MS)));
}

/** 기한 슬롯 이전(포함) 가장 최근 원장 행의 요약. 완료 행만 리포트의 상한 도달·미룬 수를 가진다. */
export interface DueBatchRun {
  readonly slotKey: string;
  readonly status: "running" | "completed" | "failed";
  readonly leaseExpiresAt: Date | null;
  readonly budgetReached: boolean;
  readonly deferred: number;
}

export type BatchNotice =
  | { readonly kind: "none" }
  | { readonly kind: "running" }
  | { readonly kind: "cap-reached"; readonly deferred: number }
  | { readonly kind: "failed" }
  | { readonly kind: "delayed" };

/**
 * - 원장이 비었다(아직 운영 전) → 표시 없음.
 * - 기한 슬롯의 행이 없다(시작하지 않음) 또는 실행 중인데 리스가 끝났다(죽은 실행) → 지연.
 * - 실행 중(리스 유효) → 갱신 진행 중. 실패 → 배치 실패.
 * - 완료이고 상한에 닿아 미룬 사건이 있다 → 한도 도달(N). 그 밖의 완료 → 표시 없음(정상).
 */
export function deriveBatchNotice(
  run: DueBatchRun | undefined,
  input: { readonly dueSlotKey: string; readonly now: Date },
): BatchNotice {
  if (run === undefined) return { kind: "none" };
  if (run.slotKey !== input.dueSlotKey) return { kind: "delayed" };
  switch (run.status) {
    case "running":
      return run.leaseExpiresAt !== null && run.leaseExpiresAt > input.now
        ? { kind: "running" }
        : { kind: "delayed" };
    case "failed":
      return { kind: "failed" };
    case "completed":
      return run.budgetReached && run.deferred > 0
        ? { kind: "cap-reached", deferred: run.deferred }
        : { kind: "none" };
  }
}
