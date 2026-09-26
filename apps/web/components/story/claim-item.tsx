/** @jsxImportSource react */
"use client";

import { claimLabel, evidenceTrigger, SELECTED } from "../../app/story/copy.ts";
import { claimAnchorId } from "../../lib/claim-anchor.ts";
import type { ClaimView } from "../../lib/story-view.ts";
import { cn } from "../../lib/utils.ts";
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
  return (
    <li className={cn("flex flex-col gap-3", marked && "border-s-2 border-foreground ps-3")}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={claimAnchorId(claim.order)} tabIndex={-1} className="text-meta font-semibold">
          {claimLabel(claim.order)}
        </h3>
        <StatusBadge status={claim.status} description="sr-only" />
        {marked ? <span className="text-meta font-semibold">{SELECTED}</span> : null}
      </div>
      <p>{claim.text}</p>
      <ClaimDisclosure order={claim.order} triggerLabel={evidenceTrigger(claim.evidence.length)}>
        <EvidenceList claim={claim} />
      </ClaimDisclosure>
    </li>
  );
}
