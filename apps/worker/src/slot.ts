/**
 * 배치 슬롯(#55, 스펙 "배포와 운영" 스케줄러): 매일 KST 05:00·17:00. 배치 키는 의도한 KST 슬롯
 * (`2026-09-27T17:00+09:00`)이고 시각은 UTC `Date`로 다룬다. KST는 UTC+9 고정(서머타임 없음).
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 슬롯 시각(KST). `0 5,17 * * *`과 같다. */
export const SLOT_HOURS_KST = [5, 17] as const;

/** 일일 예산이 리셋되는 KST 날짜의 시작(UTC 15:00). */
export function kstDayRange(instant: Date): { readonly from: Date; readonly to: Date } {
  const kst = instant.getTime() + KST_OFFSET_MS;
  const dayStartKst = Math.floor(kst / DAY_MS) * DAY_MS;
  return {
    from: new Date(dayStartKst - KST_OFFSET_MS),
    to: new Date(dayStartKst + DAY_MS - KST_OFFSET_MS),
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** 슬롯 시각(UTC `Date`) → 배치 키. */
export function slotKeyOf(slotAt: Date): string {
  const kst = new Date(slotAt.getTime() + KST_OFFSET_MS);
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}T${pad(kst.getUTCHours())}:00+09:00`;
}

/** 배치 키 → 슬롯 시각. 형식이 다르거나 슬롯 시각이 아니면 `undefined`. */
export function slotAtOf(slotKey: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):00\+09:00$/.exec(slotKey);
  if (match === null) return undefined;
  const hour = Number(match[4]);
  if (!SLOT_HOURS_KST.includes(hour as (typeof SLOT_HOURS_KST)[number])) return undefined;
  const slotAt = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hour) - KST_OFFSET_MS,
  );
  return slotKeyOf(slotAt) === slotKey ? slotAt : undefined;
}

/** `instant` 이전(같은 시각 포함) 가장 최근 슬롯의 시각. 크론이 만든 잡의 슬롯을 정할 때 쓴다. */
export function latestSlotAtOrBefore(instant: Date): Date {
  const { from } = kstDayRange(instant);
  for (const hour of [...SLOT_HOURS_KST].reverse()) {
    const candidate = new Date(from.getTime() + hour * 60 * 60 * 1000);
    if (candidate <= instant) return candidate;
  }
  // 오늘 05:00 전이면 어제 17:00.
  const lastHour = SLOT_HOURS_KST[SLOT_HOURS_KST.length - 1] as number;
  return new Date(from.getTime() - DAY_MS + lastHour * 60 * 60 * 1000);
}

/** `(since, until]`의 슬롯 시각을 오름차순으로. 누락 슬롯 회복이 `until` = 지금으로 부른다. */
export function slotsBetween(since: Date, until: Date): Date[] {
  const slots: Date[] = [];
  let cursor = latestSlotAtOrBefore(until);
  while (cursor > since) {
    slots.unshift(cursor);
    cursor = latestSlotAtOrBefore(new Date(cursor.getTime() - 1));
  }
  return slots;
}

/** 워커 시작 시 회복할 슬롯: 되돌아보는 기간 안의 슬롯 중 원장이 완료로 갖지 않은 것. */
export function missedSlots(input: {
  readonly now: Date;
  readonly lookbackMs: number;
  readonly completedSlotKeys: ReadonlySet<string>;
}): string[] {
  const since = new Date(input.now.getTime() - input.lookbackMs);
  return slotsBetween(since, input.now)
    .map(slotKeyOf)
    .filter((key) => !input.completedSlotKeys.has(key));
}
