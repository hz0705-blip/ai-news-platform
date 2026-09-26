/** @jsxImportSource react */
"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { claimAnchorId, parseClaimHash } from "../../lib/claim-anchor.ts";

interface Expansion {
  readonly expanded: ReadonlySet<number>;
  readonly toggle: (order: number) => void;
}

const ExpansionContext = createContext<Expansion | undefined>(undefined);

/**
 * 주장 목록 하나의 펼침 상태. 서버 렌더는 항상 모두 접힘이고, 마운트 뒤 URL 해시 `#claim-N`이 있으면
 * 그 주장을 펼치고 헤딩에 포커스한다(Ruling 23-1·23-2). 페이지 안 해시 변경도 같은 규칙으로 추가 펼침만 한다.
 * 여러 패널이 동시에 열릴 수 있다(상충 비교).
 */
export function ClaimExpansionProvider({
  initialExpanded = [],
  children,
}: {
  initialExpanded?: readonly number[];
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set(initialExpanded));
  const toggle = useCallback((order: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(order)) next.delete(order);
      else next.add(order);
      return next;
    });
  }, []);

  useEffect(() => {
    const open = (hash: string) => {
      const order = parseClaimHash(hash);
      if (order === undefined) return;
      const heading = document.getElementById(claimAnchorId(order));
      if (heading === null) return; // 범위 밖 번호는 무시
      setExpanded((prev) => (prev.has(order) ? prev : new Set(prev).add(order)));
      heading.focus();
    };
    const openFromHash = () => open(window.location.hash);
    // 해시가 이미 같으면 hashchange가 나지 않는다(딥링크로 들어와 닫은 뒤 헤더 링크를 다시 누르는 경로).
    // 같은 문서 안 `#claim-N` 링크 클릭을 위임으로 받아 같은 규칙을 적용한다(Ruling 23-2).
    const openFromClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const anchor = (event.target as Element | null)?.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.pathname !== window.location.pathname || url.search !== window.location.search)
        return;
      open(url.hash);
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    document.addEventListener("click", openFromClick);
    return () => {
      window.removeEventListener("hashchange", openFromHash);
      document.removeEventListener("click", openFromClick);
    };
  }, []);

  return (
    <ExpansionContext.Provider value={{ expanded, toggle }}>{children}</ExpansionContext.Provider>
  );
}

export function useClaimExpansion(order: number): {
  readonly expanded: boolean;
  readonly toggle: () => void;
} {
  const context = useContext(ExpansionContext);
  if (context === undefined)
    throw new Error("ClaimExpansionProvider 밖에서 useClaimExpansion을 불렀다");
  const { expanded, toggle } = context;
  return {
    expanded: expanded.has(order),
    toggle: useCallback(() => toggle(order), [toggle, order]),
  };
}
