/** @jsxImportSource react */
"use client";

import { claimLabel, evidenceTrigger, SELECTED } from "../../app/story/copy.ts";
import { claimAnchorId } from "../../lib/claim-anchor.ts";
import type { ClaimView } from "../../lib/story-view.ts";
import { StatusBadge } from "../status-badge.tsx";
import { ClaimDisclosure } from "./claim-disclosure.tsx";
import { useClaimExpansion } from "./claim-expansion.tsx";
import { EvidenceList } from "./evidence-row.tsx";

/**
 * 주장 하나. 주장 번호(h3, 딥링크·포커스 대상)·주장·상태 배지는 접힘 영역 밖에 둔다.
 * 데스크톱에서 선택되면 시작 쪽 테두리와 `선택됨` 글자로 표시한다(Ruling 24-3).
 */
export function ClaimItem({ claim }: { claim: ClaimView }) {
  const { selected, isDesktop } = useClaimExpansion(claim.order);
  const marked = isDesktop && selected;
  const differences = claim.isComparison
    ? claim.evidence.filter((item) => item.display === "발췌" && item.differsIn)
    : [];
  return (
    <li className="story-claim" data-selected={marked || undefined}>
      <div className="claim-label-row">
        <h3 id={claimAnchorId(claim.order)} tabIndex={-1} className="text-meta font-semibold">
          <span className="claim-number" aria-hidden="true">
            {String(claim.order).padStart(2, "0")}
          </span>
          <span className="sr-only">{claimLabel(claim.order)}</span>
        </h3>
        <StatusBadge status={claim.status} description="sr-only" />
        {marked ? <span className="text-meta font-semibold">{SELECTED}</span> : null}
      </div>
      <p className="claim-text">{claim.text}</p>
      {differences.length > 0 && (
        <div className="claim-differences">
          <p>보도가 갈리는 지점</p>
          {differences.map((item) => (
            <p key={`${item.sourceUrl}#${item.publishedAt.getTime()}`}>
              {item.sourceName} — {item.differsIn}
            </p>
          ))}
        </div>
      )}
      <p className="claim-source-line">
        근거: {[...new Set(claim.evidence.map((item) => item.sourceName))].join(", ")}
      </p>
      <ClaimDisclosure order={claim.order} triggerLabel={evidenceTrigger(claim.evidence.length)}>
        <EvidenceList claim={claim} />
      </ClaimDisclosure>
    </li>
  );
}
