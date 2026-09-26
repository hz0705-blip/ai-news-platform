/** @jsxImportSource react */
"use client";

import {
  backToClaim,
  PANEL_EMPTY_HEADING,
  PANEL_EMPTY_HINT,
  panelAnnouncement,
  panelHeading,
} from "../../app/story/copy.ts";
import { claimHref, EVIDENCE_PANEL_HEADING_ID, EVIDENCE_PANEL_ID } from "../../lib/claim-anchor.ts";
import type { ClaimView } from "../../lib/story-view.ts";
import { useSelectedClaim } from "./claim-expansion.tsx";
import { EvidenceList } from "./evidence-row.tsx";

/**
 * 데스크톱 근거 패널(Ruling 24-2·24-4). 선택된 주장의 근거만 그리며 모달·독립 스크롤·sticky가 아닌 페이지 흐름 안의 열이다.
 * 모바일 폭에서는 `display:none`이고 내용도 비운다 — 근거 행은 인라인 영역 한 곳에만 있다.
 * live 영역은 항상 렌더해 두고 선택이 바뀔 때 안내만 읽힌다(인용은 낭독하지 않는다).
 */
export function EvidencePanel({ claims }: { claims: readonly ClaimView[] }) {
  const { selected, isDesktop } = useSelectedClaim();
  const claim = isDesktop ? claims.find((c) => c.order === selected) : undefined;
  return (
    <aside
      id={EVIDENCE_PANEL_ID}
      aria-labelledby={EVIDENCE_PANEL_HEADING_ID}
      className="hidden lg:block"
    >
      <div className="flex flex-col gap-4">
        <h2 id={EVIDENCE_PANEL_HEADING_ID} tabIndex={-1}>
          {claim === undefined ? PANEL_EMPTY_HEADING : panelHeading(claim.order)}
        </h2>
        {claim === undefined ? (
          <p className="text-muted-foreground">{PANEL_EMPTY_HINT}</p>
        ) : (
          <>
            <p>{claim.text}</p>
            <a href={claimHref(claim.order)} className="self-start">
              {backToClaim(claim.order)}
            </a>
            <EvidenceList claim={claim} />
          </>
        )}
      </div>
      <p aria-live="polite" className="sr-only">
        {claim === undefined ? "" : panelAnnouncement(claim.order)}
      </p>
    </aside>
  );
}
