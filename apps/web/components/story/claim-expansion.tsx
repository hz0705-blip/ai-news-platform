/** @jsxImportSource react */
"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { claimAnchorId, parseClaimHash } from "../../lib/claim-anchor.ts";
import { useIsDesktop } from "../../lib/use-desktop.ts";

interface ExpansionState {
  readonly expanded: ReadonlySet<number>;
  readonly selected: number | undefined;
}

interface Expansion extends ExpansionState {
  readonly isDesktop: boolean;
  readonly activate: (order: number) => void;
}

const ExpansionContext = createContext<Expansion | undefined>(undefined);

const withOrder = (set: ReadonlySet<number>, order: number): ReadonlySet<number> =>
  set.has(order) ? set : new Set(set).add(order);
const withoutOrder = (set: ReadonlySet<number>, order: number): ReadonlySet<number> => {
  const next = new Set(set);
  next.delete(order);
  return next;
};

/**
 * 주장 목록 하나의 펼침·선택 상태. 서버 렌더는 항상 모두 접힘이고, 마운트 뒤 URL 해시 `#claim-N`이 있으면
 * 그 주장을 펼치고 선택하며 헤딩에 포커스한다(Ruling 23-1·23-2·24-1). 페이지 안 해시 변경도 같은 규칙으로 추가 펼침만 한다.
 * 모바일은 여러 패널이 동시에 열릴 수 있고(상충 비교), 데스크톱은 선택된 주장 하나의 근거를 옆 패널에 보인다.
 * 두 모드가 같은 펼침 집합을 공유하므로 폭이 바뀌어도 선택 주장은 열린 채로 남는다.
 */
export function ClaimExpansionProvider({
  initialExpanded = [],
  children,
}: {
  initialExpanded?: readonly number[];
  children: ReactNode;
}) {
  const isDesktop = useIsDesktop();
  const [state, setState] = useState<ExpansionState>(() => ({
    expanded: new Set(initialExpanded),
    selected: initialExpanded.at(-1),
  }));
  const activate = useCallback(
    (order: number) => {
      setState(({ expanded, selected }) => {
        if (isDesktop) {
          return selected === order
            ? { expanded: withoutOrder(expanded, order), selected: undefined }
            : { expanded: withOrder(expanded, order), selected: order };
        }
        return expanded.has(order)
          ? {
              expanded: withoutOrder(expanded, order),
              selected: selected === order ? undefined : selected,
            }
          : { expanded: withOrder(expanded, order), selected: order };
      });
    },
    [isDesktop],
  );

  useEffect(() => {
    const open = (hash: string) => {
      const order = parseClaimHash(hash);
      if (order === undefined) return;
      const heading = document.getElementById(claimAnchorId(order));
      if (heading === null) return; // 범위 밖 번호는 무시
      setState(({ expanded }) => ({ expanded: withOrder(expanded, order), selected: order }));
      heading.focus();
    };
    const openFromHash = () => open(window.location.hash);
    // 해시가 이미 같으면 hashchange가 나지 않는다(딥링크로 들어와 닫은 뒤 헤더 링크를 다시 누르는 경로).
    // 같은 문서 안 `#claim-N` 링크 클릭을 위임으로 받아 같은 규칙을 적용한다(Ruling 23-2).
    const openFromClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const anchor = (event.target as Element | null)?.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      // 보조키·새 창 클릭은 브라우저가 이 문서를 떠나지 않으므로 펼치지 않는다.
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        anchor.target === "_blank"
      )
        return;
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
    <ExpansionContext.Provider value={{ ...state, isDesktop, activate }}>
      {children}
    </ExpansionContext.Provider>
  );
}

function useExpansionContext(): Expansion {
  const context = useContext(ExpansionContext);
  if (context === undefined)
    throw new Error("ClaimExpansionProvider 밖에서 주장 펼침 상태를 읽었다");
  return context;
}

/** 주장 하나의 펼침(모바일 인라인)·선택(데스크톱 패널) 여부와 활성화. 활성화는 클릭·Enter/Space로만 부른다. */
export function useClaimExpansion(order: number): {
  readonly expanded: boolean;
  readonly selected: boolean;
  readonly isDesktop: boolean;
  readonly activate: () => void;
} {
  const { expanded, selected, isDesktop, activate } = useExpansionContext();
  return {
    expanded: expanded.has(order),
    selected: selected === order,
    isDesktop,
    activate: useCallback(() => activate(order), [activate, order]),
  };
}

/** 근거 패널이 읽는 선택 주장 번호와 모드. */
export function useSelectedClaim(): {
  readonly selected: number | undefined;
  readonly isDesktop: boolean;
} {
  const { selected, isDesktop } = useExpansionContext();
  return { selected, isDesktop };
}
