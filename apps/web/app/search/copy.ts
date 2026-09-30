// 검색 화면 문구(#126, 이슈 #12 마감 코멘트의 Search 행을 바탕으로 한 Ruling).
export const SEARCH_TITLE = "사건 검색";
export const SEARCH_LABEL = "검색어";
export const SEARCH_BUTTON = "검색";
export const SEARCH_HINT = "발행된 사건의 제목과 주장에서 뜻이 가까운 사건을 찾습니다.";
export const SEARCH_PROMPT = "찾고 싶은 사건을 한국어로 입력하세요.";
export const SEARCHING = "검색 중…";
export const SEARCH_RESULTS = "검색 결과";
export const SEARCH_DEMO_RESULTS = "데모 사건 결과";
export const NO_RESULTS = "검색 결과가 없습니다";
export const NO_RESULTS_HINT = "다른 검색어로 찾거나 데모 사건을 둘러보세요.";
export const NEAREST_CLAIMS = "가까운 주장";
export const SEARCH_FAILED = "검색하지 못했습니다";
export const SEARCH_FAILED_DETAIL = "잠시 뒤 같은 검색어로 다시 시도하세요.";
export const RETRY = "다시 시도";
export const RATE_LIMITED = "검색 요청이 많습니다";
export const SEARCH_LIMIT = "오늘 검색 한도 도달";
export const SEARCH_LIMIT_DETAIL =
  "한국 시간 자정 뒤에 다시 검색할 수 있습니다. 발행된 사건은 오늘 화면에서 계속 읽을 수 있습니다.";
export const INVALID_QUERY = "검색어는 200자 이하로 입력하세요.";
export const GO_TODAY = "오늘로 가기";

export const resultCount = (live: number, demo: number) =>
  demo === 0 ? `검색 결과 사건 ${live}건` : `검색 결과 사건 ${live}건, 데모 사건 ${demo}건`;

/** `Retry-After`(초)를 사람이 읽는 문구로. 모르면 시간을 말하지 않는다. */
export function retryAfterText(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return "잠시 뒤 다시 시도하세요.";
  }
  const wait =
    seconds < 60
      ? `${Math.ceil(seconds)}초`
      : seconds < 3600
        ? `${Math.ceil(seconds / 60)}분`
        : `${Math.ceil(seconds / 3600)}시간`;
  return `${wait} 뒤에 다시 시도하세요.`;
}
