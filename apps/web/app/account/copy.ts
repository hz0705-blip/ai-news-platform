// 계정 화면·계정 삭제 결과 화면 문구(#106 Ruling). 테스트는 이 리터럴을 단언한다.
export const ACCOUNT_TITLE = "계정";
export const ACCOUNT_LOGIN_REQUIRED = "로그인하면 계정을 관리하고 삭제할 수 있습니다.";
export const ACCOUNT_LOGIN = "로그인하기";
export const ACCOUNT_LINK = "계정";

export const DELETION_HEADING = "계정 삭제";
export const DELETION_INTRO = "계정을 삭제하면 다음을 바로 지웁니다. 되돌릴 수 없습니다.";
export const DELETION_ITEMS = [
  "팔로우한 사건과 토픽",
  "사건마다 마지막으로 본 개정판",
  "로그인 계정과 Kakao·Google 로그인 연결",
] as const;
export const DELETION_BACKUP =
  "백업에는 최대 90일 동안 남을 수 있으며, 백업을 복원하면 삭제를 다시 적용한 뒤 서비스를 엽니다. 로그인 연결 해제가 끝날 때까지(72시간 안) 같은 Kakao·Google 계정으로는 다시 가입할 수 없습니다.";
export const DELETION_REAUTH = "삭제하기 전에 로그인한 서비스로 한 번 더 로그인합니다.";
export const DELETION_CONFIRM = "위 내용을 확인했고 계정을 삭제합니다";
export const DELETION_SUBMIT = "다시 로그인하고 계정 삭제";

export const DELETION_ERRORS: Readonly<Record<string, string>> = {
  unavailable: "지금은 계정을 삭제할 수 없습니다. 잠시 뒤 다시 시도해 주세요.",
  failed: "계정을 삭제하지 못했습니다. 계정과 데이터는 그대로입니다. 다시 시도해 주세요.",
  mismatch: "삭제하려던 계정과 다른 계정으로 로그인해 삭제하지 않았습니다. 다시 로그인해 주세요.",
  reauth: "삭제하려면 방금 로그인한 상태여야 합니다. 로그아웃한 뒤 다시 로그인해 주세요.",
  confirm: "삭제 확인란을 선택해 주세요.",
};

export const DELETED_TITLE = "계정 삭제";
export const DELETED_PENDING = "계정 삭제 처리 중";
export const DELETED_PENDING_BODY =
  "계정과 팔로우·마지막으로 본 개정판은 지웠습니다. Kakao·Google 로그인 연결 해제를 다시 시도하고 있으며 72시간 안에 끝납니다. 끝나기 전에는 같은 계정으로 다시 가입할 수 없습니다.";
export const DELETED_DONE = "계정을 삭제했습니다";
export const DELETED_DONE_BODY =
  "계정과 팔로우·마지막으로 본 개정판을 지우고 로그인 연결을 해제했습니다. 백업에는 최대 90일 동안 남을 수 있습니다.";
export const DELETED_UNKNOWN = "확인할 계정 삭제 요청이 없습니다.";
export const DELETED_REFRESH = "처리 상태 다시 보기";
export const GO_TODAY = "오늘 화면으로 가기";
