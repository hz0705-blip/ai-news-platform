// 개인정보 처리방침 문구(#128, 컨트롤러 Ruling). 목차는 스펙 v1 "개발 중 결정 항목" 법적 페이지 범위가 정본이다.
// 쿠키 이름·scope는 코드 상수에서 가져온다. 위탁 업체의 지역·보존은 docs/agents/project.md "운영 환경"과 실제 설정에서 확인했다.
import { DELETION_INTENT_COOKIE, DELETION_STATUS_COOKIE } from "../../lib/account/deletion.ts";
import { GOOGLE_SCOPE, supabaseAuthCookieName } from "../../lib/auth/env.ts";
import { KAKAO_NONCE_COOKIE, KAKAO_SCOPE, KAKAO_STATE_COOKIE } from "../../lib/auth/kakao.ts";
import { RETURN_COOKIE } from "../../lib/auth/urls.ts";
import { ANON_COOKIE } from "../../lib/search/guard.ts";

export const PRIVACY_LEAD =
  "이 서비스가 어떤 개인정보를 왜 받고, 얼마 동안 두고, 누구에게 맡기는지 적습니다. 로그인하지 않고 읽는 동안에는 계정 정보를 받지 않습니다.";

// 절 제목. 순서는 스펙 "법적 페이지 범위"의 처리방침 목차 순서다.
export const PRIVACY_SECTIONS = {
  operator: "운영자·연락처·시행일",
  purposes: "처리 목적·항목·법적 근거·보존",
  collection: "수집 방법·필수/선택·거부 시 결과",
  processors: "처리 위탁과 국외 이전",
  retention: "보존·파기",
  rights: "권리 행사",
  cookies: "쿠키",
  safeguards: "안전 조치",
} as const;

// 운영자·연락처·시행일
export const OPERATOR =
  "운영자: 이 서비스를 만들고 운영하는 개인 개발자 1인이며, 개인정보 보호책임자를 겸합니다.";
export const CONTACT_INTRO = "개인정보에 관한 문의와 권리 행사 요청은 아래 메일로 받습니다.";
export const CONTACT_MAIL_SUBJECT = "개인정보 문의";
export const contactMailLink = (email: string) => `${email}로 개인정보 문의 메일 보내기`;
export const CONTACT_PENDING_DETAIL = "문의 메일 주소를 곧 이곳에 안내합니다.";
export const effectiveDate = (date: string) => `시행일: ${date}`;

// 처리 목적·항목·법적 근거·보존 표. 행 순서는 스펙 목차의 괄호 안 순서다.
export interface PurposeRow {
  readonly name: string;
  readonly purpose: string;
  readonly items: readonly string[];
  readonly basis: string;
  readonly retention: string;
}

const ACCOUNT_RETENTION =
  "계정 삭제 시 즉시 삭제합니다. 백업에는 최대 90일 동안 남을 수 있습니다(보존·파기 참고).";

export const PURPOSE_LABELS = {
  purpose: "목적",
  items: "항목",
  basis: "법적 근거",
  retention: "보존",
} as const;

export const PURPOSE_ROWS: readonly PurposeRow[] = [
  {
    name: "인증 식별자와 로그인 제공자 정보",
    purpose: "로그인과 계정 유지, 같은 사람의 중복 가입·삭제 직후 재가입 확인",
    items: [
      "서비스 계정 ID, 로그인 제공자 이름과 그 제공자의 사용자 ID, 가입·마지막 로그인 시각",
      `Kakao(요청 범위 ${KAKAO_SCOPE}): 닉네임(필수), 이메일(선택 동의한 경우)`,
      `Google(요청 범위 ${GOOGLE_SCOPE}): 이메일, 이름, 프로필 사진 주소`,
    ],
    basis: "이용 계약의 이행(개인정보 보호법 제15조 제1항 제4호)",
    retention: ACCOUNT_RETENTION,
  },
  {
    name: "팔로우·마지막으로 본 개정판",
    purpose: "팔로우한 사건·토픽 목록과 '읽은 이후 변화' 제공",
    items: ["팔로우한 사건·토픽과 그 시각", "사건마다 마지막으로 본 개정판과 그 시각"],
    basis: "이용 계약의 이행(개인정보 보호법 제15조 제1항 제4호)",
    retention: ACCOUNT_RETENTION,
  },
  {
    name: "남용 방지 쿠키·IP HMAC",
    purpose: "익명 검색의 요청 한도 적용과 비용 남용 방지",
    items: [
      "서명된 무작위 식별자 쿠키(계정과 연결하지 않습니다)",
      "쿠키 식별자와 IP 주소의 HMAC 값으로 만든 요청 카운터(원래 IP·검색어·쿠키 값은 저장하거나 로그에 남기지 않습니다. IP용 비밀은 매일 바뀝니다)",
    ],
    basis: "운영자의 정당한 이익(개인정보 보호법 제15조 제1항 제6호)",
    retention: "쿠키는 24시간 뒤 만료됩니다. 카운터는 창이 끝난 뒤 48시간 안에 지웁니다.",
  },
  {
    name: "보안 로그",
    purpose: "계정 삭제 이행 확인, 삭제 직후 재가입 차단, 장애·침해 대응",
    items: [
      "계정 삭제 기록: 서비스 계정 ID와 삭제 시각",
      "로그인 연결 해제 대기 기록: 로그인 제공자 이름과 그 제공자의 사용자 ID",
      "호스팅·인증 서비스의 요청·로그인 기록(접속 IP, 시각, 요청 경로)",
    ],
    basis: "운영자의 정당한 이익(개인정보 보호법 제15조 제1항 제6호)",
    retention:
      "삭제 기록은 90일 뒤, 연결 해제 대기 기록은 해제가 끝나면(72시간 안) 지웁니다. 요청·로그인 기록은 각 업체의 기본 보존 기간 동안 남습니다.",
  },
  {
    name: "요청자 연락처",
    purpose: "정정·삭제·게시 중단 요청과 개인정보 문의의 처리와 결과 통지",
    items: ["보낸 메일 주소, 메일에 적은 이름과 요청 내용"],
    basis: "요청에 따른 조치의 이행(개인정보 보호법 제15조 제1항 제4호)",
    retention:
      "처리를 마치고 결과를 알린 뒤 1년 안에 지웁니다. 공개 저장소(GitHub)의 이슈·기록에는 올리지 않습니다.",
  },
];

// 수집 방법·필수/선택·거부 시 결과
export const COLLECTION: readonly string[] = [
  "로그인 제공자 정보는 Kakao·Google 로그인 때 그 제공자의 동의 화면을 거쳐 받습니다. Kakao 닉네임은 필수, 이메일은 선택입니다. Google은 이메일·이름·프로필 사진 주소를 함께 줍니다. 프로필 사진은 Kakao에 요청하지 않습니다.",
  "팔로우와 마지막으로 본 개정판은 로그인한 뒤 서비스를 쓰는 동안 만들어집니다.",
  "남용 방지 쿠키는 검색을 실행할 때만 발급합니다. 읽기 화면은 이 쿠키를 만들지 않습니다.",
  "요청자 연락처는 요청자가 보낸 메일에서 받습니다.",
  "로그인하지 않아도 사건 읽기와 검색은 모두 쓸 수 있습니다. 로그인을 거부하면 팔로우와 '읽은 이후 변화'만 쓸 수 없습니다.",
  "Kakao 이메일 동의를 거부해도 가입과 이용에 차이가 없습니다.",
  "쿠키를 막으면 로그인과 검색이 동작하지 않을 수 있습니다. 읽기는 계속됩니다.",
  "14세 미만은 계정을 만들 수 없습니다.",
];

// 처리 위탁과 국외 이전. 쓰지 않는 업체는 적지 않는다.
export interface ProcessorRow {
  readonly name: string;
  readonly task: string;
  readonly items: string;
  readonly region: string;
  readonly retention: string;
}

export const PROCESSOR_LABELS = {
  task: "맡기는 일",
  items: "처리 항목",
  region: "처리 지역",
  retention: "보존",
} as const;

export const PROCESSORS_INTRO =
  "다음 업체에 처리를 맡깁니다. 아래 업체는 모두 미국 법인이며, 대한민국 밖에서 처리하는 경우 서비스를 쓸 때 네트워크로 전송됩니다. 국외 이전을 원하지 않으면 해당 기능을 쓰지 않거나 계정을 삭제할 수 있습니다.";

export const PROCESSORS: readonly ProcessorRow[] = [
  {
    name: "Supabase",
    task: "데이터베이스, 로그인(인증), 일일 백업",
    items: "이 방침의 계정 데이터·보안 기록·요청 카운터 전부",
    region: "대한민국 서울(AWS ap-northeast-2)",
    retention: "운영 데이터는 위 표의 보존 기간, 일일 백업은 7일",
  },
  {
    name: "Vercel",
    task: "웹 호스팅과 요청 처리",
    items: "접속 IP, 요청 경로, 쿠키, 검색어(전달만 하고 저장하지 않음)",
    region: "서버 기능은 대한민국 서울(icn1), 정적 전송은 Vercel 전 세계 네트워크",
    retention: "요청 기록은 Vercel의 기본 보존 기간",
  },
  {
    name: "OpenAI",
    task: "검색어의 의미 벡터(임베딩) 생성",
    items: "검색어 원문(계정·쿠키·IP와 함께 보내지 않음)",
    region: "미국",
    retention: "저장하지 않도록(store: false) 보내지만, 남용 감시용으로 최대 30일 보관될 수 있음",
  },
  {
    name: "Railway",
    task: "배치 작업 서버(기사 분석, 계정 삭제 뒤 로그인 연결 해제 재시도)",
    items: "로그인 연결 해제 대기 기록(제공자 이름·사용자 ID)",
    region: "싱가포르(asia-southeast1)",
    retention: "해제가 끝나면(72시간 안) 지움, 작업 기록은 Railway의 기본 보존 기간",
  },
  {
    name: "GitHub(Actions)",
    task: "야간 데이터베이스 백업의 생성·암호화·보관",
    items: "암호화한 데이터베이스 전체 덤프(계정 데이터 포함)",
    region: "GitHub 호스팅 실행 환경과 저장소(미국 등, 지역 지정 없음)",
    retention: "90일",
  },
];

// 보존·파기
export const RETENTION: readonly string[] = [
  "각 항목은 위 표의 보존 기간이 지나면 지웁니다.",
  "계정을 삭제하면 로그인 계정, 팔로우, 마지막으로 본 개정판을 즉시 지우고 Kakao·Google 로그인 연결을 해제합니다.",
  "백업(Supabase 7일, GitHub Actions 아티팩트 90일)에는 그 기간 동안 남을 수 있습니다. 백업을 복원하면 삭제 기록을 다시 적용한 뒤 서비스를 엽니다.",
  "전자 파일은 되살릴 수 없는 방법으로 지웁니다. 종이로 받는 개인정보는 없습니다.",
];

// 권리 행사
export const RIGHTS_INTRO =
  "개인정보의 열람, 정정, 삭제, 처리 정지를 요구하고 동의를 철회할 수 있습니다.";
export const RIGHTS_ACCOUNT = "계정과 계정 데이터 삭제는 계정 화면에서 바로 할 수 있습니다.";
export const RIGHTS_ACCOUNT_LINK = "계정 화면으로 가기";
export const ACCOUNT_PATH = "/account";
export const RIGHTS_MAIL =
  "그 밖의 요청은 메일로 보내 주세요(운영자·연락처·시행일 참고). 요청자 본인인지 확인한 뒤 지체 없이 처리하고 결과를 알려 드립니다.";

// 쿠키 표. 이름은 코드 상수에서 가져온다(테스트가 같은 상수로 비교한다).
export interface CookieRow {
  readonly name: string;
  readonly purpose: string;
  readonly duration: string;
}

export const COOKIE_LABELS = { name: "이름", purpose: "목적", duration: "기간" } as const;
export const COOKIES_INTRO =
  "광고·분석 쿠키는 쓰지 않습니다. 아래 쿠키는 로그인과 남용 방지에 꼭 필요한 것입니다.";

export const COOKIES: readonly CookieRow[] = [
  {
    name: supabaseAuthCookieName("<프로젝트 ref>"),
    purpose:
      "로그인 세션 유지. 값이 크면 .0·.1로 나뉘고, Google 로그인 중에는 같은 접두의 코드 검증자 쿠키가 붙습니다.",
    duration: "최대 400일, 로그아웃·계정 삭제 시 삭제",
  },
  { name: RETURN_COOKIE, purpose: "로그인 뒤 돌아갈 주소", duration: "10분" },
  { name: KAKAO_STATE_COOKIE, purpose: "Kakao 로그인 위조 요청 방지(state)", duration: "10분" },
  { name: KAKAO_NONCE_COOKIE, purpose: "Kakao 로그인 재사용 방지(nonce)", duration: "10분" },
  {
    name: DELETION_INTENT_COOKIE,
    purpose: "계정 삭제 전 다시 로그인한 계정이 같은지 확인",
    duration: "10분",
  },
  { name: DELETION_STATUS_COOKIE, purpose: "계정 삭제 처리 상태 확인", duration: "4일" },
  { name: ANON_COOKIE, purpose: "익명 검색 요청 한도(남용 방지)", duration: "24시간" },
];

// 안전 조치
export const SAFEGUARDS: readonly string[] = [
  "모든 통신은 HTTPS로 암호화합니다. 로그인 과정·계정 삭제·남용 방지 쿠키는 스크립트가 읽을 수 없게(HttpOnly) 두고, 남용 방지 쿠키는 서명해 위조를 막습니다.",
  "계정 데이터 표는 공개 데이터 API로 닿지 않게 막고, 모든 개인 읽기·쓰기는 서버가 로그인을 직접 확인한 뒤 그 사용자 것만 다룹니다.",
  "관리자 키와 비밀 값은 서버 환경변수에만 두고 저장소에 넣지 않습니다. 백업은 암호화해 보관합니다.",
  "원래 IP와 검색어는 로그에 남기지 않습니다.",
];
