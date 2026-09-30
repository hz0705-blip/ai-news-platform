import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import {
  ABOUT_LEAD,
  ABOUT_TITLE,
  CONTACT_PENDING,
  CONTACT_PENDING_DETAIL,
  DEMO_SOURCE,
  GDELT_CREDIT,
  GDELT_LINK,
  GDELT_SOURCE,
  GDELT_URL,
  GNEWS_RISK,
  GNEWS_SOURCE,
  PRIVACY_LINK,
  PRIVACY_PATH,
  PRIVACY_TEXT,
  RECHECK_HEADING,
  RECHECK_LIMIT,
  RECHECK_RULE,
  RECHECK_SCHEDULE,
  RECHECK_SCHEDULE_INTRO,
  REPORT_PENDING,
  REQUEST_DEADLINE,
  REQUEST_FIELDS,
  REQUEST_FIELDS_INTRO,
  REQUEST_INTRO,
  REQUEST_MAIL_SUBJECT,
  REQUEST_PRIVACY,
  REQUEST_PROCESS,
  RETENTION,
  RETENTION_HEADING,
  RIGHTS_GRADES,
  requestMailLink,
  SECTION_PRIVACY,
  SECTION_REPORT,
  SECTION_REQUESTS,
  SECTION_RIGHTS,
  SECTION_TRANSLATION,
  SECTION_UPDATES,
  SOURCES_HEADING,
  TRANSLATION,
  UPDATE_DETAIL,
  UPDATE_SCHEDULE,
} from "./copy.ts";

export const metadata: Metadata = { title: ABOUT_TITLE };

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}

/**
 * 소개(스펙 "화면과 경험", 렌더링은 정적). 요청 메일 주소는 서버 전용 `CONTACT_EMAIL`에서만 읽는다.
 * 정적 페이지라 빌드 때 값이 들어가므로 바꾸면 재배포해야 반영된다. 비어 있으면 "연락처 준비 중"을 보인다.
 */
export default function Page(): ReactElement {
  const email = process.env.CONTACT_EMAIL?.trim();
  return (
    <main className="mx-auto flex max-w-[48rem] flex-col gap-8 px-4 py-12 lg:px-6">
      <header className="flex flex-col gap-3">
        <h1>{ABOUT_TITLE}</h1>
        <p>{ABOUT_LEAD}</p>
      </header>
      <Section id="about-rights" title={SECTION_RIGHTS}>
        <h3>{SOURCES_HEADING}</h3>
        <p>{RIGHTS_GRADES}</p>
        <p>
          {GNEWS_SOURCE} {GNEWS_RISK}
        </p>
        <p>{GDELT_SOURCE}</p>
        <p>
          {GDELT_CREDIT}{" "}
          <a href={GDELT_URL} className="underline">
            {GDELT_LINK}
          </a>
        </p>
        <p>{DEMO_SOURCE}</p>
        <h3>{RETENTION_HEADING}</h3>
        <dl className="flex flex-col gap-2">
          {RETENTION.map(([term, detail]) => (
            <div key={term}>
              <dt className="font-semibold">{term}</dt>
              <dd>{detail}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <Section id="about-updates" title={SECTION_UPDATES}>
        <p className="font-semibold">{UPDATE_SCHEDULE}</p>
        <p>{UPDATE_DETAIL}</p>
        <h3>{RECHECK_HEADING}</h3>
        <p>{RECHECK_RULE}</p>
        <p>{RECHECK_SCHEDULE_INTRO}</p>
        <ul className="list-disc pl-6">
          {RECHECK_SCHEDULE.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p>{RECHECK_LIMIT}</p>
      </Section>
      <Section id="about-translation" title={SECTION_TRANSLATION}>
        <ul className="list-disc pl-6">
          {TRANSLATION.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Section>
      <Section id="about-requests" title={SECTION_REQUESTS}>
        <p>{REQUEST_INTRO}</p>
        {email ? (
          <p>
            <a
              href={`mailto:${email}?subject=${encodeURIComponent(REQUEST_MAIL_SUBJECT)}`}
              className="underline"
            >
              {requestMailLink(email)}
            </a>
          </p>
        ) : (
          <p>
            <strong>{CONTACT_PENDING}</strong> {CONTACT_PENDING_DETAIL}
          </p>
        )}
        <p>{REQUEST_FIELDS_INTRO}</p>
        <ul className="list-disc pl-6">
          {REQUEST_FIELDS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p>{REQUEST_PROCESS}</p>
        <p>{REQUEST_DEADLINE}</p>
        <p>{REQUEST_PRIVACY}</p>
      </Section>
      <Section id="about-privacy" title={SECTION_PRIVACY}>
        <p>{PRIVACY_TEXT}</p>
        <p>
          <a href={PRIVACY_PATH} className="underline">
            {PRIVACY_LINK}
          </a>
        </p>
      </Section>
      <Section id="about-report" title={SECTION_REPORT}>
        <p>{REPORT_PENDING}</p>
      </Section>
    </main>
  );
}
