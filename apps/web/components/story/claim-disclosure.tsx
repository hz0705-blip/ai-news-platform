/** @jsxImportSource react */
"use client";

import type { MouseEvent, ReactNode } from "react";
import { GO_TO_SELECTED_EVIDENCE } from "../../app/story/copy.ts";
import {
  claimEvidenceId,
  EVIDENCE_PANEL_HEADING_ID,
  EVIDENCE_PANEL_ID,
} from "../../lib/claim-anchor.ts";
import { Button } from "../ui/button.tsx";
import { useClaimExpansion } from "./claim-expansion.tsx";

/** 해시를 바꾸지 않고 패널 헤딩으로 포커스를 옮긴다(hashchange 규칙과 얽히지 않게, Ruling 24-3). */
function focusPanelHeading(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  document.getElementById(EVIDENCE_PANEL_HEADING_ID)?.focus();
}

/**
 * 주장 하나의 근거 펼침. 상태는 `ClaimExpansionProvider`가 갖고 이 컴포넌트는 `aria-expanded`만 그린다.
 * 모바일: 접혀 있으면 영역은 비어 있고 숨겨진다 — 링크·번역 컨트롤은 펼쳤을 때만 렌더된다.
 * 데스크톱: 근거는 옆 패널에만 그리고(Ruling 24-2) 인라인 영역은 숨겨진 빈 채로 둔다. 트리거는 패널을 가리키고
 * 선택된 주장에만 패널 헤딩으로 가는 링크를 붙인다.
 * 영역은 `<div>`라 랜드마크가 아니다(Ruling 23-8). 트리거는 네이티브 버튼이라 Enter/Space로 동작하고,
 * 활성화해도 포커스는 트리거에 남는다.
 */
export function ClaimDisclosure({
  order,
  triggerLabel,
  children,
}: {
  order: number;
  triggerLabel: string;
  children: ReactNode;
}) {
  const { expanded, selected, isDesktop, activate } = useClaimExpansion(order);
  const regionId = claimEvidenceId(order);
  const inlineOpen = !isDesktop && expanded;
  return (
    <>
      <Button
        className="self-start"
        aria-expanded={isDesktop ? selected : expanded}
        aria-controls={isDesktop ? EVIDENCE_PANEL_ID : regionId}
        onClick={activate}
      >
        {triggerLabel}
      </Button>
      {isDesktop && selected ? (
        <a
          href={`#${EVIDENCE_PANEL_HEADING_ID}`}
          className="self-start"
          onClick={focusPanelHeading}
        >
          {GO_TO_SELECTED_EVIDENCE}
        </a>
      ) : null}
      <div id={regionId} hidden={!inlineOpen}>
        {inlineOpen ? children : null}
      </div>
    </>
  );
}
