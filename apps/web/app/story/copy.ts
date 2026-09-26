// 사건 화면 문구. 테스트는 스펙 문구를 리터럴로 단언한다.
import type { ContradictionStatus } from "@newsplatform/domain";

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

/** 상충 상태 배지의 설명 문구(스펙 #12 §2.3, Ruling 22-9). */
export const STATUS_DESCRIPTION: Readonly<Record<ContradictionStatus, string>> = {
  "단일 출처": "이 주장을 뒷받침하는 출처가 하나입니다.",
  "복수 출처 일치": "여러 출처의 보도가 이 주장에 일치합니다.",
  "보도 상충": "출처에 따라 보도가 다릅니다.",
  "상충 해소": "이전 상충이 해소된 근거가 있습니다.",
  정정됨: "출처가 정정을 명시했습니다.",
};
export const STATUS_COUNTS_LABEL = "주장 상태별 개수";
export const statusCount = (status: ContradictionStatus, count: number): string =>
  `${status} ${count}개`;
export const statusCountClaims = (orders: readonly number[]): string =>
  `주장 ${orders.join(", ")}번`;

export const claimLabel = (order: number): string => `주장 ${order}`;
export const evidenceTrigger = (count: number): string => `근거 ${count}개 보기`;

export const DIFFERS_IN = "다른 점";
export const comparisonPosition = (index: number, total: number): string =>
  `보도 ${index}/${total}`;

export const FICTIONAL_SOURCE = "가상 출처";
export const ORIGINAL_LINK = "원문 보기";
export const originalLinkContext = (sourceName: string): string =>
  `, ${sourceName} 기사, 새 창에서 열림`;
export const TRANSLATE = "번역";
export const TRANSLATE_PENDING = "번역은 준비 중입니다";
export const EVIDENCE_SPAN = "근거 구간";
/** 출처의 현재 권리 등급으로 구간을 보일 수 없는 근거(스펙 리터럴). 상충 상태가 아니다. */
export const EXCERPT_UNAVAILABLE = "근거 발췌를 표시할 수 없음";

export const SOURCE_REGION = "지역";
export const SOURCE_OWNERSHIP = "소유 형태";
export const SOURCE_LANGUAGE = "언어";
export const SOURCE_RIGHTS_TIER = "권리 등급";
const LANGUAGE_NAMES: Readonly<Record<string, string>> = { en: "영어", ko: "한국어" };
export const languageName = (code: string): string => LANGUAGE_NAMES[code] ?? code;

export const NO_CHANGES = "아직 변화가 없습니다";
