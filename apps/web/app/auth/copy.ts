// 로그인 게이트·로그인 화면·인앱 안내 문구(스펙 "계정"). 테스트는 이 리터럴을 단언한다.
export const LOGIN_TITLE = "로그인";
export const LOGIN_REASON =
  "팔로우와 읽은 이후 변화는 로그인한 뒤 쓸 수 있습니다. 읽기는 로그인 없이 계속됩니다.";
export const AGE_NOTICE = "14세 이상만 계정을 만들 수 있습니다. 계속하면 14세 이상임을 확인합니다.";
export const CONTINUE_KAKAO = "카카오로 계속하기";
export const CONTINUE_GOOGLE = "Google로 계속하기";
export const CANCEL = "취소";
export const BACK_TO_READING = "로그인하지 않고 읽기로 돌아가기";

export const SIGNED_IN = "로그인되어 있습니다.";
export const LOGOUT = "로그아웃";
export const RETURN_TO_READING = "읽던 곳으로 돌아가기";
export const LOGIN_UNAVAILABLE = "지금은 로그인할 수 없습니다. 잠시 뒤 다시 시도해 주세요.";
export const LOGIN_FAILED = "로그인을 완료하지 못했습니다. 다시 시도해 주세요.";
export const LOGIN_PENDING_DELETION =
  "삭제한 계정의 로그인 연결 해제가 아직 끝나지 않아 이 계정으로는 로그인할 수 없습니다. 연결 해제는 72시간 안에 끝나며, 그 뒤에 다시 가입할 수 있습니다.";

/** 인앱 브라우저에서 Google을 고른 경우(스펙 "계정" 인앱 브라우저). */
export const IN_APP_TITLE = "외부 브라우저에서 Google 로그인";
export const IN_APP_REASON =
  "이 앱 안의 브라우저에서는 Google 로그인이 막혀 있습니다. Safari·Chrome 같은 외부 브라우저에서 이어 주세요.";
export const OPEN_EXTERNAL = "외부 브라우저로 열기";
export const COPY_LINK = "링크 복사";
export const LINK_COPIED = "링크를 복사했습니다. 외부 브라우저 주소창에 붙여 넣으세요.";
export const COPY_FAILED = "복사하지 못했습니다. 아래 링크를 길게 눌러 복사하세요.";
export const IN_APP_MENU: Readonly<Record<"kakaotalk" | "naver", string>> = {
  kakaotalk: "열리지 않으면 오른쪽 아래 ⋯ 메뉴에서 ‘다른 브라우저로 열기’를 누르세요.",
  naver: "열리지 않으면 오른쪽 아래 ⋯ 메뉴에서 ‘기본 브라우저로 열기’를 누르세요.",
};
export const OTHER_LOGIN = "다른 방법 보기";

/** 모든 화면 우측 상단 계정 진입점(스펙 "계정"). */
export const HEADER_LOGIN = "로그인";
export const ACCOUNT_NAV = "계정 메뉴";
export const HEADER_FOLLOWS = "팔로우";
