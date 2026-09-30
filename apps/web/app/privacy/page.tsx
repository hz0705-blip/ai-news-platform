import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import { ContactMail } from "../../components/contact-mail.tsx";
import { LEGAL_EFFECTIVE_DATE, PRIVACY_TITLE, TERMS_PATH, TERMS_TITLE } from "../legal.ts";
import {
  ACCOUNT_PATH,
  COLLECTION,
  CONTACT_INTRO,
  CONTACT_MAIL_SUBJECT,
  CONTACT_PENDING_DETAIL,
  COOKIE_LABELS,
  COOKIES,
  COOKIES_INTRO,
  contactMailLink,
  effectiveDate,
  OPERATOR,
  PRIVACY_LEAD,
  PRIVACY_SECTIONS,
  PROCESSOR_LABELS,
  PROCESSORS,
  PROCESSORS_INTRO,
  PURPOSE_LABELS,
  PURPOSE_ROWS,
  RETENTION,
  RIGHTS_ACCOUNT,
  RIGHTS_ACCOUNT_LINK,
  RIGHTS_INTRO,
  RIGHTS_MAIL,
  SAFEGUARDS,
} from "./copy.ts";

export const metadata: Metadata = { title: PRIVACY_TITLE };

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}

function Bullets({ lines }: { lines: readonly string[] }) {
  return (
    <ul className="list-disc pl-6">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

/** 표 대신 항목마다 정의 목록을 둔다(모바일 폭에서 가로 스크롤 없이 읽힌다). */
function Entry({
  title,
  rows,
}: {
  title: string;
  rows: readonly (readonly [string, ReactNode])[];
}) {
  return (
    <article className="flex flex-col gap-2 border-t pt-3">
      <h3>{title}</h3>
      <dl className="flex flex-col gap-2">
        {rows.map(([term, detail]) => (
          <div key={term}>
            <dt className="font-semibold">{term}</dt>
            <dd>{detail}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

/** 개인정보 처리방침(스펙 사용자 스토리 34, 렌더링은 정적). 연락처는 `ContactMail`이 `CONTACT_EMAIL`에서 읽는다. */
export default function Page(): ReactElement {
  return (
    <main className="mx-auto flex max-w-[48rem] flex-col gap-8 px-4 py-12 lg:px-6">
      <header className="flex flex-col gap-3">
        <h1>{PRIVACY_TITLE}</h1>
        <p>{PRIVACY_LEAD}</p>
      </header>
      <Section id="privacy-operator" title={PRIVACY_SECTIONS.operator}>
        <p>{OPERATOR}</p>
        <p>{CONTACT_INTRO}</p>
        <ContactMail
          subject={CONTACT_MAIL_SUBJECT}
          label={contactMailLink}
          pendingDetail={CONTACT_PENDING_DETAIL}
        />
        <p>{effectiveDate(LEGAL_EFFECTIVE_DATE)}</p>
      </Section>
      <Section id="privacy-purposes" title={PRIVACY_SECTIONS.purposes}>
        {PURPOSE_ROWS.map((row) => (
          <Entry
            key={row.name}
            title={row.name}
            rows={[
              [PURPOSE_LABELS.purpose, row.purpose],
              [PURPOSE_LABELS.items, <Bullets key="items" lines={row.items} />],
              [PURPOSE_LABELS.basis, row.basis],
              [PURPOSE_LABELS.retention, row.retention],
            ]}
          />
        ))}
      </Section>
      <Section id="privacy-collection" title={PRIVACY_SECTIONS.collection}>
        <Bullets lines={COLLECTION} />
      </Section>
      <Section id="privacy-processors" title={PRIVACY_SECTIONS.processors}>
        <p>{PROCESSORS_INTRO}</p>
        {PROCESSORS.map((row) => (
          <Entry
            key={row.name}
            title={row.name}
            rows={[
              [PROCESSOR_LABELS.task, row.task],
              [PROCESSOR_LABELS.items, row.items],
              [PROCESSOR_LABELS.region, row.region],
              [PROCESSOR_LABELS.retention, row.retention],
            ]}
          />
        ))}
      </Section>
      <Section id="privacy-retention" title={PRIVACY_SECTIONS.retention}>
        <Bullets lines={RETENTION} />
      </Section>
      <Section id="privacy-rights" title={PRIVACY_SECTIONS.rights}>
        <p>{RIGHTS_INTRO}</p>
        <p>
          {RIGHTS_ACCOUNT}{" "}
          <a href={ACCOUNT_PATH} className="underline">
            {RIGHTS_ACCOUNT_LINK}
          </a>
        </p>
        <p>{RIGHTS_MAIL}</p>
      </Section>
      <Section id="privacy-cookies" title={PRIVACY_SECTIONS.cookies}>
        <p>{COOKIES_INTRO}</p>
        <table className="w-full table-fixed border-collapse text-left">
          <thead>
            <tr>
              <th scope="col" className="w-[38%] pb-2">
                {COOKIE_LABELS.name}
              </th>
              <th scope="col" className="pb-2">
                {COOKIE_LABELS.purpose}
              </th>
              <th scope="col" className="w-[24%] pb-2">
                {COOKIE_LABELS.duration}
              </th>
            </tr>
          </thead>
          <tbody>
            {COOKIES.map((row) => (
              <tr key={row.name} className="border-t align-top">
                <td className="py-2 pr-2">
                  <code className="break-all">{row.name}</code>
                </td>
                <td className="py-2 pr-2">{row.purpose}</td>
                <td className="py-2">{row.duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section id="privacy-safeguards" title={PRIVACY_SECTIONS.safeguards}>
        <Bullets lines={SAFEGUARDS} />
      </Section>
      <p>
        <a href={TERMS_PATH} className="underline">
          {TERMS_TITLE}
        </a>
      </p>
    </main>
  );
}
