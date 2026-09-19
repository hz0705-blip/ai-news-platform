/**
 * 서비스가 다루는 토픽 넷 (CONTEXT.md "토픽").
 * 배열 순서는 배치가 비용 상한에 도달했을 때 사건을 처리하는 우선순위다
 * (docs/spec/v1.md "배치와 비용": 기사가 많이 붙은 사건부터 처리하고, 동률이면 이 순서).
 */
export const TOPICS = [
  "한국 관련 해외 보도",
  "국제 정치·외교·안보",
  "세계 경제·금융",
  "기술·AI",
] as const;

export type Topic = (typeof TOPICS)[number];
