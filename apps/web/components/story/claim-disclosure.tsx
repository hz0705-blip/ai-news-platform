/** @jsxImportSource react */
"use client";

import type { ReactNode } from "react";
import { claimEvidenceId } from "../../lib/claim-anchor.ts";
import { Button } from "../ui/button.tsx";
import { useClaimExpansion } from "./claim-expansion.tsx";

/**
 * 주장 하나의 근거 펼침. 상태는 `ClaimExpansionProvider`가 갖고 이 컴포넌트는 `aria-expanded`만 그린다.
 * 접혀 있으면 영역은 비어 있고 숨겨진다 — 링크·번역 컨트롤은 펼쳤을 때만 렌더된다.
 * 영역은 `<div>`라 랜드마크가 아니다(Ruling 23-8). 트리거는 네이티브 버튼이라 Enter/Space로 동작하고,
 * 펼쳐도 포커스는 트리거에 남는다.
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
  const { expanded, toggle } = useClaimExpansion(order);
  const regionId = claimEvidenceId(order);
  return (
    <>
      <Button
        className="self-start"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={toggle}
      >
        {triggerLabel}
      </Button>
      <div id={regionId} hidden={!expanded}>
        {expanded ? children : null}
      </div>
    </>
  );
}
