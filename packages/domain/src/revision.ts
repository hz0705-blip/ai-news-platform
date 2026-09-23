import type { Claim } from "./claim.ts";
import type { ContradictionStatus } from "./contradiction-status.ts";
import type { RightsTier } from "./rights.ts";

/**
 * 개정판의 출처 구획 한 줄 (#21 Ruling 15).
 * 링크만 등급 기사는 근거를 주지 않지만 여기에는 들어온다 — 허용된 메타데이터
 * (출처·기사 제목·URL·발행 시각)만 남긴다(docs/spec/v1.md "사건 배정").
 */
export interface RevisionSource {
  readonly sourceId: string;
  readonly articleId: string;
  readonly articleTitle: string;
  readonly articleUrl: string;
  readonly publishedAt: Date;
  readonly rightsTier: RightsTier;
}

/**
 * 개정판(Revision): 파이프라인이 사건을 처리한 결과의 한 스냅샷
 * (CONTEXT.md "개정판"). 사건은 개정판의 열이다.
 *
 * `contradictionStatus`는 `deriveStoryStatus`가 주장들에서 파생한 스냅샷이며
 * 따로 편집하는 필드가 아니다(ADR-0009).
 * `promptVersions`는 `<단계>@<정수>` 문자열이고 `modelId`는 모델 식별자다
 * (#21 Ruling 4: 이 티켓은 기록된 응답만 쓰므로 `recorded`).
 */
export interface Revision {
  readonly id: string;
  readonly storyId: string;
  readonly revisionNumber: number;
  readonly title: string;
  readonly publishedAt: Date;
  readonly contradictionStatus: ContradictionStatus;
  readonly promptVersions: {
    readonly evidenceExtract: string;
    readonly claimGenerate: string;
    readonly contradictionLabel: string;
  };
  readonly modelId: string;
  readonly claims: readonly Claim[];
  readonly sources: readonly RevisionSource[];
}
