/** @jsxImportSource react */
"use client";

import { type ReactNode, useState } from "react";
import { Button } from "../ui/button.tsx";

/**
 * 주장 하나의 근거 펼침. 이 컴포넌트가 가진 상태는 `aria-expanded` 하나다.
 * 접혀 있으면 영역(`<section>` = region 역할)은 비어 있고 숨겨진다 — 링크·번역 컨트롤은 펼쳤을 때만 렌더된다.
 * 트리거는 네이티브 버튼이라 Enter/Space로 동작하고, 펼쳐도 포커스는 트리거에 남는다.
 */
export function ClaimDisclosure({
  triggerLabel,
  regionId,
  labelledBy,
  defaultExpanded = false,
  children,
}: {
  triggerLabel: string;
  regionId: string;
  labelledBy: string;
  defaultExpanded?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <>
      <Button
        className="self-start"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => setExpanded((value) => !value)}
      >
        {triggerLabel}
      </Button>
      <section id={regionId} aria-labelledby={labelledBy} hidden={!expanded}>
        {expanded ? children : null}
      </section>
    </>
  );
}
