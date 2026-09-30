import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import { ContactMail } from "../../components/contact-mail.tsx";
import { LEGAL_EFFECTIVE_DATE, PRIVACY_PATH, PRIVACY_TITLE, TERMS_TITLE } from "../legal.ts";
import { effectiveDate } from "../privacy/copy.ts";
import {
  ACCOUNT,
  ANONYMOUS,
  CONTACT_INTRO,
  CONTACT_MAIL_SUBJECT,
  CONTACT_PENDING_DETAIL,
  CORRECTIONS,
  contactMailLink,
  LIMITS,
  SOURCES,
  TERMINATION,
  TERMS_LEAD,
  TERMS_SECTIONS,
} from "./copy.ts";

export const metadata: Metadata = { title: TERMS_TITLE };

function Section({
  id,
  title,
  lines,
  children,
}: {
  id: string;
  title: string;
  lines?: readonly string[];
  children?: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id}>{title}</h2>
      {lines === undefined ? null : (
        <ul className="list-disc pl-6">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {children}
    </section>
  );
}

/** 이용약관(렌더링은 정적). 연락처는 `ContactMail`이 `CONTACT_EMAIL`에서 읽는다. */
export default function Page(): ReactElement {
  return (
    <main className="mx-auto flex max-w-[48rem] flex-col gap-8 px-4 py-12 lg:px-6">
      <header className="flex flex-col gap-3">
        <h1>{TERMS_TITLE}</h1>
        <p>{TERMS_LEAD}</p>
        <p>{effectiveDate(LEGAL_EFFECTIVE_DATE)}</p>
      </header>
      <Section id="terms-anonymous" title={TERMS_SECTIONS.anonymous} lines={ANONYMOUS} />
      <Section id="terms-account" title={TERMS_SECTIONS.account} lines={ACCOUNT}>
        <p>
          <a href={PRIVACY_PATH} className="underline">
            {PRIVACY_TITLE}
          </a>
        </p>
      </Section>
      <Section id="terms-limits" title={TERMS_SECTIONS.limits} lines={LIMITS} />
      <Section id="terms-termination" title={TERMS_SECTIONS.termination} lines={TERMINATION} />
      <Section id="terms-sources" title={TERMS_SECTIONS.sources} lines={SOURCES} />
      <Section id="terms-corrections" title={TERMS_SECTIONS.corrections} lines={CORRECTIONS} />
      <Section id="terms-contact" title={TERMS_SECTIONS.contact}>
        <p>{CONTACT_INTRO}</p>
        <ContactMail
          subject={CONTACT_MAIL_SUBJECT}
          label={contactMailLink}
          pendingDetail={CONTACT_PENDING_DETAIL}
        />
      </Section>
    </main>
  );
}
