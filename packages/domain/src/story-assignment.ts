/**
 * 사건 배정 판정(docs/spec/v1.md "사건 배정", "사건 수명"). 순수 함수만 있다 — 임베딩 호출과 후보 검색은
 * 파이프라인·DB가 하고, 여기는 후보 목록을 받아 "기존 사건에 붙인다 / 새 사건을 만든다"만 정한다.
 *
 * 숫자는 초기값이다(스펙 "개발 중 결정 항목" 사건 배정 후보 수·임계값·마진, 개발셋 전).
 * 거짓 병합보다 거짓 분리를 택하므로 하나라도 미달이면 새 사건이다.
 */

/** 활성 창: 마지막 신규 보도 뒤 72시간(스펙 "사건 수명"). */
export const ACTIVE_WINDOW_MS = 72 * 60 * 60 * 1000;

export interface AssignmentThresholds {
  /** 코사인으로 검색하는 활성 사건 후보 수 K. */
  readonly candidates: number;
  /** 사건 중심(소속 기사 임베딩 평균)과의 코사인 유사도 하한. */
  readonly centroid: number;
  /** 대표 기사(사건의 첫 기사)와의 코사인 유사도 하한. */
  readonly representative: number;
  /** 최선 후보와 차순위 후보의 중심 유사도 차이 하한. */
  readonly margin: number;
}

export const ASSIGNMENT_THRESHOLDS: AssignmentThresholds = {
  candidates: 5,
  centroid: 0.8,
  representative: 0.75,
  margin: 0.03,
};

/** 후보 검색이 돌려준 사건 하나. 유사도는 새 기사 임베딩과의 코사인 유사도다. */
export interface AssignmentCandidate {
  readonly storyId: string;
  readonly centroidSimilarity: number;
  readonly representativeSimilarity: number;
  /** 사건이 마지막 신규 보도를 받은 시각. 없으면 배정 대상이 아니다. */
  readonly lastNewReportAt: Date | undefined;
}

export interface AssignmentInput {
  readonly candidates: readonly AssignmentCandidate[];
  readonly now: Date;
  readonly thresholds?: AssignmentThresholds;
  /**
   * 후보 거부 훅 자리: 사건 앵커(주체·행위·장소·시간) 정합과 경계 사례 모델 판정이 들어올 곳이다.
   * 이 티켓(#53)에서는 구현하지 않으며 기본은 아무것도 거부하지 않는다. 후보를 거부하거나 고를 수만 있고
   * 동일성을 만들 수는 없다(스펙 "사건 배정").
   */
  readonly rejectCandidate?: (candidate: AssignmentCandidate) => boolean;
}

export type AssignmentDecision =
  | { readonly kind: "assign"; readonly storyId: string }
  | { readonly kind: "new-story"; readonly reason: string };

/** 활성: 마지막 신규 보도 뒤 72시간 안(경계 포함). 신규 보도가 없던 사건은 활성이 아니다. */
export function isActiveStory(lastNewReportAt: Date | undefined, now: Date): boolean {
  if (lastNewReportAt === undefined) return false;
  const age = now.getTime() - lastNewReportAt.getTime();
  return age >= 0 && age <= ACTIVE_WINDOW_MS;
}

/** 처리 순서: 발행 시각 오름차순, 같으면 기사 식별자 오름차순(스펙 "사건 배정"). 입력을 바꾸지 않는다. */
export function orderForAssignment<T extends { readonly id: string; readonly publishedAt: Date }>(
  items: readonly T[],
): T[] {
  return [...items].sort(
    (a, b) =>
      a.publishedAt.getTime() - b.publishedAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/**
 * 배정 판정. 활성이고 거부되지 않은 후보를 중심 유사도 내림차순(동률은 사건 식별자 오름차순)으로 두고
 * 최선 후보가 중심·대표 하한을 모두 넘고 차순위와의 마진도 넘을 때만 배정한다. 차순위는 하한 통과 여부와
 * 무관하게 본다 — 두 사건이 비슷하게 가까우면 그 자체가 경계 사례라 분리한다.
 */
export function decideAssignment(input: AssignmentInput): AssignmentDecision {
  const thresholds = input.thresholds ?? ASSIGNMENT_THRESHOLDS;
  const reject = input.rejectCandidate ?? (() => false);
  const ranked = input.candidates
    .filter((c) => isActiveStory(c.lastNewReportAt, input.now) && !reject(c))
    .sort(
      (a, b) =>
        b.centroidSimilarity - a.centroidSimilarity ||
        (a.storyId < b.storyId ? -1 : a.storyId > b.storyId ? 1 : 0),
    );
  const best = ranked[0];
  if (best === undefined) return { kind: "new-story", reason: "활성 후보 없음" };
  if (best.centroidSimilarity < thresholds.centroid) {
    return { kind: "new-story", reason: "중심 유사도 미달" };
  }
  if (best.representativeSimilarity < thresholds.representative) {
    return { kind: "new-story", reason: "대표 기사 유사도 미달" };
  }
  const runnerUp = ranked[1];
  if (
    runnerUp !== undefined &&
    best.centroidSimilarity - runnerUp.centroidSimilarity < thresholds.margin
  ) {
    return { kind: "new-story", reason: "차순위 마진 부족" };
  }
  return { kind: "assign", storyId: best.storyId };
}

/** 임베딩 입력: 영어 제목 + 설명, 설명이 없으면 본문 첫 500자(스펙 "임베딩 모델·차원"). */
export function embeddingInputFor(article: {
  readonly title: string;
  readonly description: string | undefined;
  readonly body: string;
}): string {
  const lead =
    article.description !== undefined && article.description.trim() !== ""
      ? article.description.trim()
      : [...article.body.trim()].slice(0, 500).join("");
  return `${article.title.trim()}\n${lead}`;
}

/** 코사인 유사도. 영벡터가 있으면 0이다. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new RangeError(`차원이 다르다: ${a.length} vs ${b.length}`);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / Math.sqrt(normA * normB);
}

/** 사건 식별자·슬러그: 첫 기사 식별자에서 결정론으로 만든다(`a-<hash>` → `story-<hash>`). */
export function storyIdForFirstArticle(articleId: string): string {
  return `story-${articleId.replace(/^a-/, "")}`;
}
