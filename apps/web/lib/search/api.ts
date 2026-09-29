/**
 * 검색 실행 경로의 요청·응답 모양(#125). 브라우저 번들이 읽는 파일이라 서버 모듈을 import하지 않는다.
 * 서버 쪽은 app/api/search/route.ts.
 */
export const SEARCH_PATH = "/api/search";

export type SearchRequest = { readonly query: string };

export type SearchResultStory = {
  readonly slug: string;
  readonly title: string;
  /** 최신 발행 개정판의 발행 시각(ISO). */
  readonly updatedAt: string;
  readonly isDemo: boolean;
  readonly lifecycle: "활성" | "휴면" | "종료";
  /** 가장 가까운 주장 최대 3개(가까운 순). */
  readonly claims: readonly { readonly claimId: string; readonly text: string }[];
};

/**
 * `ok` 200. `invalid` 400(질의 1~200 코드 포인트가 아님). `rate-limited` 429 + `Retry-After`(쿠키·IP 한도, 동시 한도).
 * `search-limit` 429 + `Retry-After`(오늘 검색 예산 소진 — "오늘 검색 한도 도달", 다음 KST 자정까지).
 * `unavailable` 503(설정 없음·카운터 오류·모델 오류 — 새 유료 작업을 하지 않는다). 교차 출처는 403 `forbidden`.
 */
export type SearchResponse =
  | { readonly state: "ok"; readonly stories: readonly SearchResultStory[] }
  | { readonly state: "invalid" | "rate-limited" | "search-limit" | "unavailable" | "forbidden" };
