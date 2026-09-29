import type { Metadata } from "next";
import { type ReactElement, Suspense } from "react";
import { LoginOptions } from "../../../components/auth/login-options.tsx";
import { Alert, AlertTitle } from "../../../components/ui/alert.tsx";
import { Button } from "../../../components/ui/button.tsx";
import { supabaseEnv } from "../../../lib/auth/env.ts";
import { safeReturnPath } from "../../../lib/auth/return-path.ts";
import { getCurrentUserId } from "../../../lib/auth/server.ts";
import {
  BACK_TO_READING,
  LOGIN_FAILED,
  LOGIN_REASON,
  LOGIN_TITLE,
  LOGIN_UNAVAILABLE,
  LOGOUT,
  RETURN_TO_READING,
  SIGNED_IN,
} from "../copy.ts";

export const metadata: Metadata = { title: LOGIN_TITLE };

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** 요청 시점 영역: 로그인 상태를 묻고 로그인 선택 또는 로그아웃을 보인다(개인 경로, proxy.ts가 세션을 갱신). */
async function LoginBody({
  searchParams,
}: {
  searchParams: PageProps<"/auth/login">["searchParams"];
}): Promise<ReactElement> {
  const params = await searchParams;
  const next = safeReturnPath(first(params.next));
  const userId = await getCurrentUserId();
  if (userId !== null) {
    return (
      <>
        <p>{SIGNED_IN}</p>
        <form action="/auth/logout" method="post">
          <input type="hidden" name="next" value={next} />
          <Button type="submit">{LOGOUT}</Button>
        </form>
        <a href={next} className="underline">
          {RETURN_TO_READING}
        </a>
      </>
    );
  }
  const error = first(params.error);
  const configured = supabaseEnv() !== null;
  const unavailable = !configured || error === "unavailable";
  return (
    <>
      {unavailable || error === "failed" ? (
        <Alert>
          <AlertTitle>{unavailable ? LOGIN_UNAVAILABLE : LOGIN_FAILED}</AlertTitle>
        </Alert>
      ) : null}
      <p>{LOGIN_REASON}</p>
      {configured ? <LoginOptions next={next} /> : null}
      <a href={next} className="underline">
        {BACK_TO_READING}
      </a>
    </>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/auth/login">): ReactElement {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
      <h1>{LOGIN_TITLE}</h1>
      <Suspense fallback={<div aria-hidden="true" className="min-h-40" />}>
        <LoginBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
