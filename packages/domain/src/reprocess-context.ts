import type { Claim } from "./claim.ts";
import { openEpisodeClaims } from "./contradiction-episode.ts";
import type { Revision } from "./revision.ts";

/** 사건 기사의 기사 버전 원자료 한 건(DB `article_versions` 행, 데모는 단계 파일). */
export interface ArticleVersionRecord {
  readonly articleId: string;
  readonly articleVersionId: string;
  /** 정규화 본문. null이면 보존 기한이 지나 지운 본문이다(#144). */
  readonly body: string | null;
  readonly capturedAt: Date;
  /** 재수집에서 정정 표지가 새로 생긴 버전(#86). */
  readonly correctionCandidate: boolean;
}

export interface ReprocessContextInput {
  /** 사건의 최신 개정판. 없으면 첫 처리다. */
  readonly latestRevision: Revision | undefined;
  /** 사건 개정판 확인 시각(`checked_at`)의 최댓값. 개정판이 없으면 undefined. */
  readonly latestCheckedAt: Date | undefined;
  /** 주장 개정판 이력: 개정판 순서(오래된 것 먼저)의 개정판별 주장. */
  readonly claimHistory: readonly (readonly Claim[])[];
  /** 사건 기사들의 기사 버전 전부(순서 무관). */
  readonly articleVersions: readonly ArticleVersionRecord[];
}

/** 기사 하나의 이번 재처리 입력 버전(마지막 기사 버전)과 정정 표시. */
export interface ReprocessArticleVersion {
  readonly articleVersionId: string;
  readonly body: string;
  readonly correctionCandidate?: true;
  readonly correctionFirstReprocess?: true;
}

/** 재처리 컨텍스트: 파이프라인 `StoryState`의 규칙 부분과 기사별 입력 버전. 빈 목록은 필드를 두지 않는다. */
export interface ReprocessContext {
  readonly latestRevision?: Revision;
  /** 기사 식별자 → 마지막 기사 버전. 버전이 없는 기사(링크만)와 마지막 버전의 본문을 지운 기사는 없다. */
  readonly currentVersions: ReadonlyMap<string, ReprocessArticleVersion>;
  readonly previousVersionBodies?: readonly {
    readonly articleVersionId: string;
    readonly body: string;
  }[];
  readonly openEpisodeClaims?: readonly Claim[];
}

/**
 * 재처리 컨텍스트 규칙(#86·#90·#94). 라이브(DB 행)와 데모(단계 파일)가 모두 이 함수로 배치 입력을 만든다.
 * - 입력 버전: 기사마다 `capturedAt`이 가장 늦은 기사 버전. 그 본문을 지웠으면(#144) 그 기사는 입력이 아니다 —
 *   지운 본문에서는 새 근거를 뽑지 않는다(스펙 "데이터 보존").
 * - 첫 재처리(#94): 정정 후보 입력 버전이 최신 확인 시각보다 늦게 수집됐으면(개정판이 없으면 항상) 그 버전이 생긴 뒤
 *   첫 재처리다. 미뤄지거나 실패한 배치는 확인 시각을 바꾸지 않으므로 다음 배치가 여전히 첫 재처리다.
 * - 열린 에피소드(#90): 최신 개정판 밖의 열린 상충 에피소드 주장(`openEpisodeClaims`).
 * - 이전 본문(#86): 최신 개정판과 열린 에피소드 주장의 근거가 가리키는 기사 버전 중 입력 버전이 아닌 것의 본문
 *   (기사 버전 식별자 순). 원자료에 없거나 본문을 지운 버전은 빠진다(좌표 정렬 실패).
 */
export function deriveReprocessContext(input: ReprocessContextInput): ReprocessContext {
  const latest = input.latestRevision;
  const current = new Map<string, ArticleVersionRecord>();
  for (const version of input.articleVersions) {
    const seen = current.get(version.articleId);
    if (seen === undefined || version.capturedAt > seen.capturedAt) {
      current.set(version.articleId, version);
    }
  }
  const currentVersions = new Map<string, ReprocessArticleVersion>();
  for (const [articleId, version] of current) {
    if (version.body === null) continue;
    const firstReprocess =
      version.correctionCandidate &&
      (input.latestCheckedAt === undefined || version.capturedAt > input.latestCheckedAt);
    currentVersions.set(articleId, {
      articleVersionId: version.articleVersionId,
      body: version.body,
      ...(version.correctionCandidate ? { correctionCandidate: true } : {}),
      ...(firstReprocess ? { correctionFirstReprocess: true } : {}),
    });
  }

  const episodes =
    latest === undefined
      ? []
      : openEpisodeClaims(
          input.claimHistory,
          latest.claims.map((c) => c.id),
        );
  const currentIds = new Set([...current.values()].map((v) => v.articleVersionId));
  const referenced = new Set(
    [...(latest?.claims ?? []), ...episodes]
      .flatMap((c) => c.evidence.map((e) => e.articleVersionId))
      .filter((id) => !currentIds.has(id)),
  );
  const bodyById = new Map(input.articleVersions.map((v) => [v.articleVersionId, v.body]));
  const previousVersionBodies = [...referenced].sort().flatMap((articleVersionId) => {
    const body = bodyById.get(articleVersionId);
    return body === undefined || body === null ? [] : [{ articleVersionId, body }];
  });

  return {
    ...(latest === undefined ? {} : { latestRevision: latest }),
    currentVersions,
    ...(previousVersionBodies.length === 0 ? {} : { previousVersionBodies }),
    ...(episodes.length === 0 ? {} : { openEpisodeClaims: episodes }),
  };
}
