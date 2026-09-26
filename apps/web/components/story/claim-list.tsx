/** @jsxImportSource react */
import type { ReactNode } from "react";
import type { ClaimView } from "../../lib/story-view.ts";
import { ClaimExpansionProvider } from "./claim-expansion.tsx";
import { ClaimItem } from "./claim-item.tsx";
import { EvidencePanel } from "./evidence-panel.tsx";

/**
 * 주장 목록과 데스크톱 근거 패널. Provider 하나가 둘을 함께 감싸고, 데스크톱(lg)은 38:32 두 열이다(Ruling 24-5).
 * `frame`은 목록을 감싸는 첫 열(사건 화면의 주장 구획과 헤딩)이다.
 * `defaultExpanded`(주장 id)는 테스트 전용이며 사건 URL의 첫 진입은 항상 모두 접힌다.
 */
export function ClaimList({
  claims,
  defaultExpanded = [],
  frame = (list) => list,
}: {
  claims: readonly ClaimView[];
  defaultExpanded?: readonly string[];
  frame?: (list: ReactNode) => ReactNode;
}) {
  const initialExpanded = claims
    .filter((claim) => defaultExpanded.includes(claim.id))
    .map((claim) => claim.order);
  return (
    <ClaimExpansionProvider initialExpanded={initialExpanded}>
      <div className="lg:grid lg:grid-cols-[minmax(0,19fr)_minmax(0,16fr)] lg:items-start lg:gap-8">
        {frame(
          <ol className="flex flex-col gap-6">
            {claims.map((claim) => (
              <ClaimItem key={claim.id} claim={claim} />
            ))}
          </ol>,
        )}
        <EvidencePanel claims={claims} />
      </div>
    </ClaimExpansionProvider>
  );
}
