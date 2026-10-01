import type { Metadata } from "next";
import { type ReactElement, Suspense } from "react";
import { ClearErrorParam } from "../../components/auth/clear-error-param.tsx";
import { LegalLinks } from "../../components/legal-links.tsx";
import { Alert, AlertTitle } from "../../components/ui/alert.tsx";
import { Button } from "../../components/ui/button.tsx";
import { deletionEnv } from "../../lib/account/admin.ts";
import { getCurrentUserId } from "../../lib/auth/server.ts";
import { LOGOUT } from "../auth/copy.ts";
import { FOLLOWS_TITLE } from "../follows/copy.ts";
import {
  ACCOUNT_LOGIN,
  ACCOUNT_LOGIN_REQUIRED,
  ACCOUNT_TITLE,
  DELETION_BACKUP,
  DELETION_CONFIRM,
  DELETION_ERRORS,
  DELETION_HEADING,
  DELETION_INTRO,
  DELETION_ITEMS,
  DELETION_REAUTH,
  DELETION_SUBMIT,
} from "./copy.ts";

export const metadata: Metadata = { title: ACCOUNT_TITLE };

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * 요청 시점 영역(개인 경로, proxy.ts가 세션을 갱신): 로그인 사용자에게 계정 삭제의 결과 안내와 확인을 보인다.
 * 폼은 `POST /account/delete`로 가고, 대상 사용자는 서버가 현재 사용자 헬퍼로 정한다(폼에 사용자 값이 없다).
 */
async function AccountBody({
  searchParams,
}: {
  searchParams: PageProps<"/account">["searchParams"];
}): Promise<ReactElement> {
  const userId = await getCurrentUserId();
  if (userId === null) {
    return (
      <>
        <p>{ACCOUNT_LOGIN_REQUIRED}</p>
        <p>
          <a href={`/auth/login?next=${encodeURIComponent("/account")}`} className="underline">
            {ACCOUNT_LOGIN}
          </a>
        </p>
      </>
    );
  }
  const error = first((await searchParams).error);
  const message = error === undefined ? undefined : DELETION_ERRORS[error];
  const available = deletionEnv() !== null;
  return (
    <>
      <ClearErrorParam />
      <section aria-labelledby="account-session" className="flex flex-col items-start gap-4">
        <h2 id="account-session">로그인 관리</h2>
        <form action="/auth/logout" method="post">
          <input type="hidden" name="next" value="/" />
          <Button type="submit" variant="outline">
            {LOGOUT}
          </Button>
        </form>
      </section>
      <section aria-labelledby="account-deletion" className="flex flex-col gap-4">
        <h2 id="account-deletion">{DELETION_HEADING}</h2>
        {message !== undefined || !available ? (
          <Alert>
            <AlertTitle>{message ?? DELETION_ERRORS.unavailable}</AlertTitle>
          </Alert>
        ) : null}
        <p>{DELETION_INTRO}</p>
        <ul className="list-disc pl-6">
          {DELETION_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="text-meta text-muted-foreground">{DELETION_BACKUP}</p>
        {available ? (
          <form action="/account/delete" method="post" className="flex flex-col items-start gap-4">
            <p className="text-meta">{DELETION_REAUTH}</p>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="confirm" value="yes" required className="size-4" />
              {DELETION_CONFIRM}
            </label>
            <Button type="submit">{DELETION_SUBMIT}</Button>
          </form>
        ) : null}
      </section>
    </>
  );
}

/** 계정 화면(로그인). 머리는 공개 껍데기이고 본문은 요청 시점에 스트리밍한다. 팔로우 화면에서 들어온다. */
export default function AccountPage({ searchParams }: PageProps<"/account">): ReactElement {
  return (
    <main id="main-content" tabIndex={-1} className="editorial-page account-page">
      <header className="flex flex-col gap-3">
        <p className="text-meta">
          <a href="/follows" className="underline">
            {FOLLOWS_TITLE}
          </a>
        </p>
        <h1>{ACCOUNT_TITLE}</h1>
      </header>
      <Suspense fallback={<div aria-hidden="true" className="min-h-40" />}>
        <AccountBody searchParams={searchParams} />
      </Suspense>
      <LegalLinks />
    </main>
  );
}
