// 사건 화면 문구. 테스트는 스펙 문구를 리터럴로 단언한다.
export const DEMO_NOTICE = "기능 설명을 위해 만든 데모 사건입니다.";
export const TOPICS_LABEL = "토픽";
export const STORY_UPDATED = "사건 갱신";
export const ARTICLE_PUBLISHED = "기사 발행";
export const FOLLOW = "팔로우";
export const SHARE = "공유";
export const sourceCount = (count: number): string => `출처 ${count}곳`;

export const SECTION_NAV_LABEL = "사건 구획 바로가기";
export const CLAIMS_HEADING = "주장";
export const SOURCES_HEADING = "출처";
export const CHANGES_HEADING = "변화";

export const claimLabel = (order: number): string => `주장 ${order}`;
export const evidenceTrigger = (count: number): string => `근거 ${count}개 보기`;

export const FICTIONAL_SOURCE = "가상 출처";
export const ORIGINAL_LINK = "원문 보기";
export const originalLinkContext = (sourceName: string): string =>
  `, ${sourceName} 기사, 새 창에서 열림`;
export const TRANSLATE = "번역";

export const SOURCE_REGION = "지역";
export const SOURCE_OWNERSHIP = "소유 형태";
export const SOURCE_LANGUAGE = "언어";
export const SOURCE_RIGHTS_TIER = "권리 등급";
const LANGUAGE_NAMES: Readonly<Record<string, string>> = { en: "영어", ko: "한국어" };
export const languageName = (code: string): string => LANGUAGE_NAMES[code] ?? code;

export const NO_CHANGES = "아직 변화가 없습니다";
