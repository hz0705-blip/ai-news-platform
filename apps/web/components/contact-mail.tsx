import type { ReactElement } from "react";

export const CONTACT_PENDING = "연락처 준비 중";

/**
 * 운영자 연락처 메일. 서버 전용 `CONTACT_EMAIL`에서만 읽는다(값은 저장소·문서에 두지 않는다). 정적 페이지는 빌드 때
 * 값이 들어가므로 바꾸면 재배포해야 반영된다. 비었거나 공백이면 mailto 대신 "연락처 준비 중"을 보인다.
 */
export function ContactMail({
  subject,
  label,
  pendingDetail,
}: {
  subject: string;
  label: (email: string) => string;
  pendingDetail: string;
}): ReactElement {
  const email = process.env.CONTACT_EMAIL?.trim();
  return email ? (
    <p>
      <a href={`mailto:${email}?subject=${encodeURIComponent(subject)}`} className="underline">
        {label(email)}
      </a>
    </p>
  ) : (
    <p>
      <strong>{CONTACT_PENDING}</strong> {pendingDetail}
    </p>
  );
}
