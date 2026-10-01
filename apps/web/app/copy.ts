// Ruling 25-1: #26의 문구 매트릭스 확정 시 이 파일에서 교체한다.
// 서비스 이름(스펙 "서비스 이름"). 문서 제목·공유 카드 사이트 이름에 쓰고, 오늘 화면 h1은 부제 SCREEN_TITLE을 유지한다.
export const SERVICE_NAME = "Newstrail";
export const SCREEN_TITLE = "사건으로 읽는 해외 보도";
export const TODAY_LABEL = "오늘";
export const LAST_UPDATED = "마지막 갱신";
export const NEVER_PUBLISHED = "마지막 갱신 — 아직 발행된 사건이 없습니다";
export const NEXT_UPDATE = "매일 오전 6시·오후 6시 갱신 예정";
export const NO_STORIES = "아직 발행된 사건이 없습니다";
export const TOPICS_LABEL = "토픽";
export const LATEST_STORIES = "최신 사건";
export const DEMO_STORIES = "데모 사건";
export const DEMO_NOTICE = "기능 설명을 위해 만든 데모 사건입니다.";
export const DEMO_TIME = "데모 기준 시각";
export const STORY_UPDATED = "사건 갱신";
export const MORE = "더 보기";
export const FOLLOWS_LINK = "팔로우한 사건 보기";
export const SEARCH_LINK = "사건 검색";
export const ABOUT_LINK = "서비스 소개";
export const storyCount = (count: number) => `사건 ${count}건`;
export const sourceCount = (count: number) => `출처 ${count}곳`;
// 배치 상태(#56, 스펙 "배치와 비용"). 제목은 상태 이름, 설명은 독자가 할 일·남는 것.
export const BATCH_RUNNING = "갱신 진행 중";
export const BATCH_RUNNING_DETAIL =
  "예정된 갱신이 아직 끝나지 않았습니다. 끝나면 새 사건이 반영됩니다.";
export const BATCH_CAP_REACHED = "분석 한도 도달";
export const batchCapReachedDetail = (deferred: number) =>
  `오늘 분석 한도에 도달해 ${deferred}개 사건이 다음 갱신에 처리됩니다`;
export const BATCH_FAILED = "갱신 실패";
export const BATCH_FAILED_DETAIL =
  "이번 갱신을 완료하지 못했습니다. 마지막 갱신 결과를 그대로 보여 드립니다.";
export const BATCH_DELAYED = "갱신 지연";
export const BATCH_DELAYED_DETAIL =
  "예정된 갱신이 아직 시작되지 않았습니다. 마지막 갱신 결과를 그대로 보여 드립니다.";
