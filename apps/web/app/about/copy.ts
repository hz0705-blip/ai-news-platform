// 소개 화면 문구(#127, 컨트롤러 Ruling). 수치는 스펙 v1 "배치와 비용"·"데이터 보존"·"개발 중 결정 항목"(원문 재수집·법적 페이지 범위) 원문을 옮긴다.
export const ABOUT_TITLE = "서비스 소개";
export const ABOUT_LEAD =
  "해외 보도를 사건 단위로 묶고, 요약 문장마다 영어 원문 근거를 붙여 보여 드립니다. 데이터를 어디서 받고 어떻게 다루는지 적습니다.";

// 절 제목. 순서는 스펙 "화면과 경험"의 소개 항목 순서다.
export const SECTION_RIGHTS = "데이터 권리";
export const SECTION_UPDATES = "갱신 주기";
export const SECTION_TRANSLATION = "번역 원칙";
export const SECTION_REQUESTS = "정정·삭제 요청";
export const SECTION_PRIVACY = "개인정보 처리방침";
export const SECTION_REPORT = "평가 리포트";

// 데이터 권리
export const SOURCES_HEADING = "출처와 권리 등급";
export const RIGHTS_GRADES =
  "모든 출처에는 권리 등급이 있습니다. '본문 처리 + 발췌 표시' 등급은 기사 본문을 분석하되 화면에는 근거 구간(1~2문장)과 출처명·원문 링크만 보입니다. '링크만' 등급은 제목·출처·원문 링크·관측 시각만 보입니다. 기사 본문 전체는 어떤 화면에도 나오지 않습니다.";
export const GNEWS_SOURCE =
  "'본문 처리 + 발췌 표시' 등급 기사는 GNews API(유료 Essential 요금제)로 받습니다.";
export const GNEWS_RISK =
  "GNews는 제공하는 기사의 저작권을 부인합니다. 기사 저작권은 각 발행사에 있으며, 발행사별 권리 위험이 남아 있습니다.";
export const GDELT_SOURCE =
  "'링크만' 등급 기사는 GDELT 프로젝트의 GKG 2.1 데이터에서 찾아 같은 사건을 다룬 다른 보도로 붙입니다. GDELT는 발행 시각을 주지 않으므로 GDELT가 기사를 본 시각을 '관측 시각'으로 표시합니다.";
export const GDELT_CREDIT = "링크만 등급 출처 데이터 제공:";
export const GDELT_LINK = "The GDELT Project";
export const GDELT_URL = "https://www.gdeltproject.org/";
export const DEMO_SOURCE =
  "데모 사건은 실제 사건을 바탕으로 직접 쓴 가상 기사와 가상 출처이며, 픽스처와 그 정답은 CC-BY-4.0입니다.";

export const RETENTION_HEADING = "데이터 보존";
export const RETENTION: readonly (readonly [string, string])[] = [
  [
    "기사 본문",
    "기사 발행 시각 기준 30일 뒤 삭제합니다(발행 시각을 모르면 수집 시각 기준). 근거 구간 원문·해시·URL·메타데이터는 보존합니다. 삭제 뒤에는 보존된 구간의 무결성만 다시 검사할 수 있고 그 기사에서 새 근거를 뽑지 못합니다.",
  ],
  ["근거·주장·개정판·변화·배치 리포트·비용 기록", "무기한 보존합니다."],
  ["기사 임베딩", "사건 종료 시 삭제합니다. 사건·주장 임베딩은 검색용으로 보존합니다."],
  ["번역 캐시", "사건 종료 후 90일 보존합니다."],
  [
    "계정 데이터",
    "계정 삭제 시 즉시 삭제합니다. 백업(Supabase 7일, GitHub Actions 아티팩트 보관 기간)에는 그 기간 동안 남을 수 있습니다. 백업을 복원하면 삭제 기록을 다시 적용한 뒤 서비스를 엽니다.",
  ],
  [
    "모델 처리",
    "OpenAI 호출은 저장하지 않도록(store: false) 보내지만, OpenAI가 남용 감시용으로 입력을 최대 30일 보관할 수 있습니다.",
  ],
];

// 갱신 주기
export const UPDATE_SCHEDULE = "매일 오전 6시, 오후 6시 갱신";
export const UPDATE_DETAIL =
  "갱신 작업은 한국 시간 05:00과 17:00에 시작합니다. 화면의 '마지막 갱신'은 마지막으로 발행된 개정판의 시각입니다. 6시를 넘겨도 끝나지 않으면 '갱신 진행 중'을 표시하고, 분석 한도 도달·갱신 실패·지연은 서로 다른 상태로 알려 드립니다.";
export const RECHECK_HEADING = "원문 변경 확인 범위";
export const RECHECK_RULE =
  "출처가 명시적으로 밝힌 수정만 '정정'으로 표시합니다. 그 밖에 다시 가져온 본문이 달라진 것은 '원문 변경'입니다. GNews는 URL로 기사를 다시 조회하는 기능이 없어, 정확한 제목으로 발행 시각 ±24시간 안을 다시 검색해 같은 URL을 찾은 경우에만 확인합니다. 찾지 못하면 '미확인'으로 두고 변경으로 보지 않으며, 발행사 페이지를 직접 가져오지 않습니다.";
export const RECHECK_SCHEDULE_INTRO = "다시 확인하는 일정은 다음과 같습니다.";
export const RECHECK_SCHEDULE: readonly string[] = [
  "활성 사건 기사: 수집 뒤 12시간·60시간에 각 1회",
  "휴면 사건 기사: 수집 뒤 7·14·28일째 표본(나이대마다 하루 40건 상한)",
  "본문 삭제(30일) 뒤의 기사와 종료된 사건의 기사는 다시 확인하지 않습니다.",
];
export const RECHECK_LIMIT = "이 범위 밖에서 일어난 조용한 수정은 감지하지 못합니다.";

// 번역 원칙
export const TRANSLATION: readonly string[] = [
  "근거는 영어 원문으로 먼저 보입니다. 한국어 번역은 근거마다 요청할 때만 만듭니다.",
  "번역은 기계 번역이며 참고용입니다. 번역에는 항상 '기계 번역, 참고용'을 표시합니다.",
  "기계 번역에는 오역이나 빠진 뜻이 있을 수 있습니다. 판단은 영어 원문을 기준으로 해 주세요.",
  "번역에는 하루 한도가 있습니다. 한도에 도달하면 '오늘 번역 한도 도달'로 번역만 멈추고, 원문 근거와 이미 만든 번역은 계속 볼 수 있습니다.",
];

// 정정·삭제 요청
export const REQUEST_INTRO =
  "사실 오류, 권리 침해, 개인에 관한 내용의 정정·삭제 요청은 메일로 받습니다.";
export const requestMailLink = (email: string) => `${email}로 정정·삭제 요청 메일 보내기`;
export const REQUEST_MAIL_SUBJECT = "정정·삭제 요청";
export const CONTACT_PENDING = "연락처 준비 중";
export const CONTACT_PENDING_DETAIL = "요청 메일 주소를 곧 이곳에 안내합니다.";
export const REQUEST_FIELDS_INTRO = "메일에 다음을 적어 주세요.";
export const REQUEST_FIELDS: readonly string[] = [
  "대상 URL: 문제가 있는 사건 또는 개정판의 주소",
  "주장: 정정·삭제가 필요한 주장 문장",
  "근거: 요청하는 이유와 그것을 뒷받침하는 자료",
];
export const REQUEST_PROCESS =
  "받은 요청은 비공개 요청 번호로 관리하고, 대상 URL·주장·근거를 확인한 뒤 정정, 게시 제한 또는 사유 답변으로 조치하고 결과를 알려 드립니다.";
export const REQUEST_DEADLINE =
  "요청은 72시간 안에 처리하는 것을 목표로 합니다. 법이 더 빠른 조치를 요구하면 그 기한을 따릅니다.";
export const REQUEST_PRIVACY =
  "요청자 정보는 공개하지 않으며, 공개 저장소(GitHub)의 이슈·기록에도 올리지 않습니다.";

// 개인정보 처리방침
export const PRIVACY_TEXT = "계정, 쿠키, 요청자 연락처 같은 개인정보를 어떻게 다루는지 적었습니다.";
export const PRIVACY_LINK = "개인정보 처리방침 읽기";
export const PRIVACY_PATH = "/privacy";

// 평가 리포트
export const REPORT_PENDING =
  "근거 게이트 통과율·사건 배정 정확도·상충 판정 정확도와 그 측정 방법을 담은 평가 리포트는 준비 중입니다. 1차 완성 때 이곳에 링크합니다.";
