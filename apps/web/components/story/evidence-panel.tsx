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
 * live 영역은 항상 렌더해 두고 선택이 바뀔 때 안내만 읽힌다(근거 발췌는 낭독하지 않는다).
 */
export function EvidencePanel({ claims }: { claims: readonly ClaimView[] }) {
  const { selected, isDesktop } = useSelectedClaim();
  const claim = isDesktop ? claims.find((c) => c.order === selected) : undefined;
  // 안내는 선택에서만 파생한다 — 폭 전환만으로는 문구가 바뀌지 않는다. 모바일에서는 aside가 display:none이라 읽히지 않는다.
  const announcement = selected === undefined ? "" : panelAnnouncement(selected);
  return (
    <aside
      id={EVIDENCE_PANEL_ID}
      aria-labelledby={EVIDENCE_PANEL_HEADING_ID}
      className="story-evidence-panel hidden lg:block"
    >
      <div className="flex flex-col gap-4">
        <p className="editorial-eyebrow">원문으로 확인하기</p>
        <h2 id={EVIDENCE_PANEL_HEADING_ID} tabIndex={-1}>
          {claim === undefined ? PANEL_EMPTY_HEADING : panelHeading(claim.order)}
        </h2>
        {claim === undefined ? (
          <>
            <p className="text-muted-foreground">{PANEL_EMPTY_HINT}</p>
            <ol aria-label="원문 확인 순서" className="evidence-reading-steps">
              <li>
                <span aria-hidden="true">01</span>확인하고 싶은 주장의 근거를 펼칩니다.
              </li>
              <li>
                <span aria-hidden="true">02</span>출처별 영어 발췌와 보도가 다른 지점을 읽습니다.
              </li>
              <li>
                <span aria-hidden="true">03</span>원문 링크에서 전체 맥락을 확인합니다.
              </li>
            </ol>
          </>
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
        {announcement}
      </p>
    </aside>
  );
}
