import type { ReactElement } from "react";
import { PRIVACY_PATH, PRIVACY_TITLE, TERMS_PATH, TERMS_TITLE } from "../app/legal.ts";

/** 처리방침·약관 링크(로그인·계정 화면). Google OAuth 동의 화면의 처리방침 URL도 이 경로다. */
export function LegalLinks(): ReactElement {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-2 text-meta">
      <a href={PRIVACY_PATH} className="underline">
        {PRIVACY_TITLE}
      </a>
      <a href={TERMS_PATH} className="underline">
        {TERMS_TITLE}
      </a>
    </p>
  );
}
