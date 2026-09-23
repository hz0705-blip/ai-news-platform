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
