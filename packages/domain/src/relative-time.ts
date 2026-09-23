const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const kstDate = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
});

/** 목록 카드용 시각. 두 날짜는 유효해야 하며 publishedAt은 now보다 늦을 수 없다. */
export function formatRelativeTime(publishedAt: Date, now: Date): string {
  const publishedMs = publishedAt.getTime();
  const nowMs = now.getTime();
  if (!Number.isFinite(publishedMs) || !Number.isFinite(nowMs) || publishedMs > nowMs) {
    throw new RangeError("Expected valid dates with publishedAt at or before now");
  }

  const elapsed = nowMs - publishedMs;
  if (elapsed < MINUTE_MS) return "방금";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}분 전`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}시간 전`;

  const publishedParts = kstDate.formatToParts(publishedAt);
  const year = publishedParts.find((part) => part.type === "year")?.value;
  const nowYear = kstDate.formatToParts(now).find((part) => part.type === "year")?.value;
  const month = publishedParts.find((part) => part.type === "month")?.value;
  const day = publishedParts.find((part) => part.type === "day")?.value;
  const date = `${month} ${day}일`;
  return year === nowYear ? date : `${year}년 ${date}`;
}
