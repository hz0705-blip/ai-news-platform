// 사건 화면의 절대 시각 표기. 한국 시간 고정, 상대 시각을 쓰지 않는다.
const formatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** `2026. 9. 17. 오전 9:30 KST`와 `<time dateTime>`용 ISO 문자열. */
export function formatAbsolute(date: Date): { text: string; dateTime: string } {
  return { text: `${formatter.format(date)} KST`, dateTime: date.toISOString() };
}

const KST_OFFSET_MS = 9 * 3_600_000;
const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * 보도량 추이 구간 표기(KST). 6시간 구간은 `2026. 9. 17. 06:00~12:00`(눈금 `17일 06시`),
 * 1일 구간은 `2026. 9. 17.`(눈금 `9. 17.`).
 */
export function formatKstBin(
  start: Date,
  binSize: "6시간" | "1일",
): { full: string; tick: string } {
  const d = new Date(start.getTime() + KST_OFFSET_MS);
  const date = `${d.getUTCFullYear()}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()}.`;
  if (binSize === "1일") return { full: date, tick: `${d.getUTCMonth() + 1}. ${d.getUTCDate()}.` };
  const hour = d.getUTCHours();
  return {
    full: `${date} ${pad(hour)}:00~${pad(hour + 6)}:00`,
    tick: `${d.getUTCDate()}일 ${pad(hour)}시`,
  };
}
