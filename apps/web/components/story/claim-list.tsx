/** @jsxImportSource react */
import { claimLabel, evidenceTrigger } from "../../app/story/copy.ts";
import { claimAnchorId } from "../../lib/claim-anchor.ts";
import type { ClaimView } from "../../lib/story-view.ts";
import { StatusBadge } from "../status-badge.tsx";
import { ClaimDisclosure } from "./claim-disclosure.tsx";
import { ClaimExpansionProvider } from "./claim-expansion.tsx";
import { EvidenceRow } from "./evidence-row.tsx";

/**
 * 주장 목록. 주장 번호(h3, 딥링크·포커스 대상)·주장·상태 배지는 접힘 영역 밖에 둔다.
 * `defaultExpanded`(주장 id)는 테스트·개정판 라우트 전용이며 사건 URL의 첫 진입은 항상 모두 접힌다.
 */
export function ClaimList({
  claims,
  defaultExpanded = [],
}: {
  claims: readonly ClaimView[];
  defaultExpanded?: readonly string[];
}) {
  const initialExpanded = claims
    .filter((claim) => defaultExpanded.includes(claim.id))
    .map((claim) => claim.order);
  return (
    <ClaimExpansionProvider initialExpanded={initialExpanded}>
      <ol className="flex flex-col gap-6">
        {claims.map((claim) => (
          <li key={claim.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id={claimAnchorId(claim.order)} tabIndex={-1} className="text-meta font-semibold">
                {claimLabel(claim.order)}
              </h3>
              <StatusBadge status={claim.status} description="sr-only" />
            </div>
            <p>{claim.text}</p>
            <ClaimDisclosure
              order={claim.order}
              triggerLabel={evidenceTrigger(claim.evidence.length)}
            >
              <ul className="flex flex-col gap-4">
                {claim.evidence.map((item, i) => (
                  <EvidenceRow
                    key={`${item.sourceUrl}#${item.publishedAt.getTime()}`}
                    evidence={item}
                    {...(claim.isComparison
                      ? { position: { index: i + 1, total: claim.evidence.length } }
                      : {})}
                  />
                ))}
              </ul>
            </ClaimDisclosure>
          </li>
        ))}
      </ol>
    </ClaimExpansionProvider>
  );
}
