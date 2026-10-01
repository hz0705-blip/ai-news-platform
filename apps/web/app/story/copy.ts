// 사건 화면 문구. 테스트는 스펙 문구를 리터럴로 단언한다.
import type { ContradictionStatus } from "@newstrail/domain";

export const DEMO_NOTICE = "기능 설명을 위해 만든 데모 사건입니다.";
export const TOPICS_LABEL = "토픽";
export const STORY_UPDATED = "사건 갱신";
export const ARTICLE_PUBLISHED = "기사 발행";
/** 링크만 기사(GDELT)의 시각 라벨. GDELT가 기사를 본 시각이며 발행 시각이 아니다(스펙 "데이터 소스와 권리"). */
export const ARTICLE_OBSERVED = "관측 시각";
export const FOLLOW = "팔로우";
export const FOLLOW_FAILED = "팔로우를 바꾸지 못했습니다. 다시 눌러 주세요.";
export const SHARE = "공유";
export const SHARE_COPIED = "링크를 복사했습니다";
export const SHARE_COPY_FAILED = "링크를 복사할 수 없습니다. 주소창의 주소를 사용하세요";
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

/** 데스크톱 근거 패널(Ruling 24-2·24-3·24-4). */
export const SELECTED = "선택됨";
export const GO_TO_SELECTED_EVIDENCE = "선택한 근거로 이동";
// 마지막 숫자의 한국어 읽기가 ㄹ 외의 받침으로 끝나면(영·삼·육) "으로", 받침이 없거나 ㄹ이면(일·이·사·오·칠·팔·구) "로".
const takesEuro = (order: number): boolean => [0, 3, 6].includes(order % 10);
export const backToClaim = (order: number): string =>
  `주장 ${order}${takesEuro(order) ? "으로" : "로"} 돌아가기`;
export const panelHeading = (order: number): string => `주장 ${order}의 근거`;
export const PANEL_EMPTY_HEADING = "근거";
export const PANEL_EMPTY_HINT = "주장의 근거 보기를 누르면 여기에 보입니다";
export const panelAnnouncement = (order: number): string =>
  `주장 ${order}의 근거를 옆 패널에 표시합니다`;

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
/** 출처의 권리 등급이 링크만이라 근거 발췌가 없는 행(색만으로 구분하지 않는다). */
export const SOURCE_NO_EXCERPT = "링크만 제공하는 출처라 근거 발췌가 없습니다.";
const LANGUAGE_NAMES: Readonly<Record<string, string>> = { en: "영어", ko: "한국어" };
export const languageName = (code: string): string => LANGUAGE_NAMES[code] ?? code;
/** 출처 표(#76)의 소유 형태 값. 데모 출처의 자유 문자열은 그대로 보인다. */
const OWNERSHIP_NAMES: Readonly<Record<string, string>> = {
  "public-service": "공영",
  private: "민영",
  "state-owned": "국영",
  "nonprofit-cooperative": "비영리·협동조합",
  unknown: "미확인",
};
export const ownershipName = (value: string): string => OWNERSHIP_NAMES[value] ?? value;

export const NO_CHANGES = "아직 변화가 없습니다";

/** 변화 구획(#87). 변화 종류는 아이콘과 글자로 함께 보인다(색만으로 부호화하지 않는다). */
export const CHANGES_INTRO = "직전 개정판과 비교한 변화입니다.";
export const revisionLabel = (revisionNumber: number): string => `개정판 ${revisionNumber}`;
export const CHANGE_CLAIM_ADDED = "주장 추가";
export const CHANGE_CLAIM_REMOVED = "주장 삭제";
export const CHANGE_CLAIM_MODIFIED = "주장 수정";
export const STORY_STATUS = "사건 상태";
export const PREVIOUS_SENTENCE = "이전";
export const CURRENT_SENTENCE = "현재";
export const PREVIOUS_STATUS = "이전 상태";
export const CURRENT_STATUS = "현재 상태";
/** `<del>`·`<ins>`의 텍스트 대체(스크린리더는 대개 두 요소를 따로 알리지 않는다). */
export const DELETED_WORDS = "지운 단어:";
export const INSERTED_WORDS = "넣은 단어:";
export const sourceAdditionCount = (count: number): string => `출처 추가 ${count}건`;
/** 변화 종류의 화면 이름. 주장 추가·삭제·수정은 "주장 변화"로 묶는다(CONTEXT.md "변화"). */
export const CHANGE_KIND_NAMES = {
  "주장 추가·삭제·수정": "주장 변화",
  "상충 상태 변화": "상충 상태 변화",
  "원문 변경": "원문 변경",
  "출처 추가": "출처 추가",
} as const;
export const changeKindCount = (name: string, count: number): string => `${name} ${count}건`;

export const REVISION_STRIP_HEADING = "개정판 이력";
export const REVISION_STRIP_CAPTION =
  "개정판을 발행 순서대로 보입니다. 각 개정판의 고정 주소로 이동합니다.";
export const LATEST_REVISION = "최신";
export const VIEWING_REVISION = "보는 중";
export const OLDER_REVISION_NOTICE = "이전 개정판을 보고 있습니다.";
export const VIEW_LATEST_REVISION = "최신 개정판 보기";
export const FIRST_REVISION = "첫 개정판";
export const SHOW_TABLE = "표로 보기";
export const REVISION_COLUMN = "개정판";

/** 읽은 이후 변화(#105, 로그인 사용자의 요청 시점 영역). */
export const SEEN_POINT = "내가 본 지점";
export const SINCE_LAST_SEEN_HEADING = "읽은 이후 변화";
export const sinceLastSeenIntro = (lastSeen: number, count: number): string =>
  `${SEEN_POINT}(개정판 ${lastSeen}) 이후 개정판 ${count}개의 변화입니다.`;
export const NOTHING_SINCE_LAST_SEEN = "마지막으로 본 이후 새 개정판이 없습니다.";

export const COVERAGE_HEADING = "보도량 추이";
export const coverageCaption = (binSize: string): string =>
  `기사 발행 시각 기준 ${binSize} 구간별 기사 수, 한국 시간(KST)`;
export const coverageObservedNote = (count: number): string =>
  `발행 시각을 모르는 기사 ${count}건은 관측 시각으로 셌습니다.`;
export const COVERAGE_BIN_COLUMN = "구간(KST)";
export const COVERAGE_COUNT_COLUMN = "기사 수";
export const COVERAGE_OBSERVED_COLUMN = "관측 시각으로 센 기사";
