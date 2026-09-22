/** @jsxImportSource react */
import type { ReactNode } from "react";

export function EvidenceHighlight({ children, lang }: { children: ReactNode; lang: "ko" | "en" }) {
  return (
    <span
      lang={lang}
      className="evidence-highlight border-s-2 border-evidence-highlight-foreground bg-evidence-highlight px-2 text-evidence-highlight-foreground"
    >
      <span lang="ko" className="me-2 text-meta font-semibold">
        근거 구간
      </span>
      <mark className="bg-evidence-highlight text-evidence-highlight-foreground">{children}</mark>
    </span>
  );
}
