/** @jsxImportSource react */
import { claimLabel, evidenceTrigger } from "../../app/story/copy.ts";
import type { ClaimView } from "../../lib/story-view.ts";
import { StatusBadge } from "../status-badge.tsx";
import { ClaimDisclosure } from "./claim-disclosure.tsx";
import { EvidenceRow } from "./evidence-row.tsx";

/**
 * 주장 목록. 주장 번호·주장·상태 배지는 접힘 영역 밖에 둔다.
 * `defaultExpanded`는 테스트·개정판 라우트 전용이며 사건 URL의 첫 진입은 항상 모두 접힌다.
 */
export function ClaimList({
  claims,
  defaultExpanded = [],
}: {
  claims: readonly ClaimView[];
  defaultExpanded?: readonly string[];
}) {
  return (
    <ol className="flex flex-col gap-6">
      {claims.map((claim) => {
        // 주장 식별자에는 `:`가 들어갈 수 있어 DOM id는 화면 번호로 만든다.
        const labelId = `claim-${claim.order}-label`;
        const regionId = `claim-${claim.order}-evidence`;
        return (
          <li key={claim.id} className="flex flex-col gap-3">
            <p className="flex flex-wrap items-center gap-2">
              <span id={labelId} className="text-meta font-semibold">
                {claimLabel(claim.order)}
              </span>
              <StatusBadge status={claim.status} />
            </p>
            <p>{claim.text}</p>
            <ClaimDisclosure
              triggerLabel={evidenceTrigger(claim.evidence.length)}
              regionId={regionId}
              labelledBy={labelId}
              defaultExpanded={defaultExpanded.includes(claim.id)}
            >
              <ul className="flex flex-col gap-4">
                {claim.evidence.map((item) => (
                  <EvidenceRow key={`${item.sourceUrl}#${item.highlight.start}`} evidence={item} />
                ))}
              </ul>
            </ClaimDisclosure>
          </li>
        );
      })}
    </ol>
  );
}
