/** @jsxImportSource react */
import type { ReactNode } from "react";
import { EVIDENCE_SPAN } from "../app/story/copy.ts";

/**
 * 근거 구간 강조(인라인). `px-2`에 `box-decoration-break: clone`을 써서 줄마다 여백을 복제하므로, Chromium에서는
 * 좁은 폭에서 배경이 담는 블록의 오른쪽 끝을 넘을 수 있다 — 담는 블록(예: `evidence-row.tsx`의 blockquote)이 `pe-2`를 둔다.
 */
export function EvidenceHighlight({ children, lang }: { children: ReactNode; lang: "ko" | "en" }) {
  return (
    <span
      lang={lang}
      className="evidence-highlight border-s-2 border-evidence-highlight-foreground bg-evidence-highlight px-2 text-evidence-highlight-foreground"
    >
      <span lang="ko" className="me-2 text-meta font-semibold">
        {EVIDENCE_SPAN}
      </span>
      <mark className="bg-evidence-highlight text-evidence-highlight-foreground">{children}</mark>
    </span>
  );
}
