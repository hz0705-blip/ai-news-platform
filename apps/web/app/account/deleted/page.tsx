import { loadDeletionStatus } from "@newstrail/db";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { type ReactElement, Suspense } from "react";
import { DELETION_STATUS_COOKIE } from "../../../lib/account/deletion.ts";
import { getRuntimeDb } from "../../../lib/db.ts";
import {
  DELETED_DONE,
  DELETED_DONE_BODY,
  DELETED_PENDING,
  DELETED_PENDING_BODY,
  DELETED_REFRESH,
  DELETED_TITLE,
  DELETED_UNKNOWN,
  GO_TODAY,
} from "../copy.ts";

export const metadata: Metadata = { title: DELETED_TITLE };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * 요청 시점 영역: 멱등 키 쿠키(경로 `/account`)로 그 요청의 삭제 대기 행을 본다. 남아 있으면 "처리 중"이고,
 * 연결 해제가 모두 끝났을 때만 "삭제했습니다"를 보인다(스펙 "계정": 완료 전에는 완료로 보고하지 않는다).
 */
async function DeletedBody(): Promise<ReactElement> {
  const key = (await cookies()).get(DELETION_STATUS_COOKIE)?.value;
  if (key === undefined || !UUID.test(key)) return <p>{DELETED_UNKNOWN}</p>;
  const status = await loadDeletionStatus(getRuntimeDb().db, key);
  return status === "pending" ? (
    <section aria-labelledby="deletion-status" className="flex flex-col gap-4">
      <h2 id="deletion-status">{DELETED_PENDING}</h2>
      <p>{DELETED_PENDING_BODY}</p>
      <p>
        <a href="/account/deleted" className="underline">
          {DELETED_REFRESH}
        </a>
      </p>
    </section>
  ) : (
    <section aria-labelledby="deletion-status" className="flex flex-col gap-4">
      <h2 id="deletion-status">{DELETED_DONE}</h2>
      <p>{DELETED_DONE_BODY}</p>
    </section>
  );
}

/** 계정 삭제 결과 화면. */
export default function DeletedPage(): ReactElement {
  return (
    <main id="main-content" tabIndex={-1} className="editorial-page account-page">
      <h1>{DELETED_TITLE}</h1>
      <Suspense fallback={<div aria-hidden="true" className="min-h-40" />}>
        <DeletedBody />
      </Suspense>
      <p>
        <a href="/" className="underline">
          {GO_TODAY}
        </a>
      </p>
    </main>
  );
}
