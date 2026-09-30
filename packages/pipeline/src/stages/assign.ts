import {
  ASSIGNMENT_THRESHOLDS,
  type AssignmentCandidate,
  type AssignmentThresholds,
  decideAssignment,
  embeddingInputFor,
  orderForAssignment,
  storyIdForFirstArticle,
  type Topic,
} from "@newstrail/domain";
import type { EmbeddingClient } from "../types.ts";

export const STAGE = "story-assign";

/** 배정할 기사 한 건. DB가 읽어 준다(`loadAssignmentArticles`). `storyId`가 있으면 기존 기사의 갱신 버전이다. */
export interface AssignmentArticle {
  readonly id: string;
  readonly storyId: string | null;
  readonly title: string;
  readonly description: string | undefined;
  readonly body: string;
  readonly publishedAt: Date;
  readonly topics: readonly Topic[];
}

/** 배정 단계가 쓰는 저장소 포트. 검색과 쓰기는 DB가, 판정은 도메인이 한다. */
export interface AssignmentStore {
  findCandidates(
    embedding: readonly number[],
    options: { readonly now: Date; readonly k: number },
  ): Promise<readonly AssignmentCandidate[]>;
  assignToStory(input: {
    readonly articleId: string;
    readonly storyId: string;
    readonly embedding: readonly number[];
    readonly publishedAt: Date;
    readonly topics: readonly Topic[];
    readonly processedAt: Date;
  }): Promise<void>;
  createStory(input: {
    readonly story: {
      readonly id: string;
      readonly slug: string;
      readonly title: string;
      readonly topics: readonly Topic[];
    };
    readonly articleId: string;
    readonly embedding: readonly number[];
    readonly publishedAt: Date;
    readonly processedAt: Date;
  }): Promise<void>;
  keepOnStory(input: { readonly storyId: string; readonly processedAt: Date }): Promise<void>;
}

export type AssignmentOutcome =
  | { readonly articleId: string; readonly kind: "assigned"; readonly storyId: string }
  | {
      readonly articleId: string;
      readonly kind: "new-story";
      readonly storyId: string;
      readonly reason: string;
    }
  | { readonly articleId: string; readonly kind: "kept"; readonly storyId: string };

export interface AssignmentResult {
  /** 처리 순서대로. */
  readonly outcomes: readonly AssignmentOutcome[];
  readonly usage: { readonly tokens: number; readonly spend: number };
}

export interface AssignmentInput {
  readonly articles: readonly AssignmentArticle[];
  readonly now: Date;
  readonly thresholds?: AssignmentThresholds;
}

export interface AssignmentDeps {
  readonly embeddingClient: EmbeddingClient;
  readonly store: AssignmentStore;
}

/**
 * 임베딩 → 사건 배정(스펙 "파이프라인", "사건 배정"). 발행 시각·기사 식별자 순으로 처리한다.
 * - 이미 사건이 있는 기사(갱신 버전)는 그 사건에 그대로 두고 처리 시각만 갱신한다(임베딩하지 않는다).
 * - 사건이 없는 기사는 제목+설명(없으면 본문 첫 500자)을 한 번에 임베딩하고, 기사마다 활성 사건 후보 K개를
 *   검색해 도메인 판정대로 붙이거나 새 사건을 만든다. 앞 기사가 만든 사건은 곧바로 뒤 기사의 후보가 된다.
 * 임베딩 호출은 DB 쓰기 전에 끝나므로 트랜잭션 중에 모델을 기다리지 않는다.
 */
export async function runAssignment(
  input: AssignmentInput,
  deps: AssignmentDeps,
): Promise<AssignmentResult> {
  const thresholds = input.thresholds ?? ASSIGNMENT_THRESHOLDS;
  const ordered = orderForAssignment(input.articles);
  const pending = ordered.filter((a) => a.storyId === null);
  const embedded =
    pending.length === 0
      ? { vectors: [], usage: { tokens: 0, spend: 0 } }
      : await deps.embeddingClient.embed(pending.map(embeddingInputFor));
  if (embedded.vectors.length !== pending.length) {
    throw new Error(`임베딩 수 불일치: 요청 ${pending.length}, 응답 ${embedded.vectors.length}`);
  }
  const embeddingOf = new Map(pending.map((a, i) => [a.id, embedded.vectors[i]]));

  const outcomes: AssignmentOutcome[] = [];
  for (const article of ordered) {
    if (article.storyId !== null) {
      await deps.store.keepOnStory({ storyId: article.storyId, processedAt: input.now });
      outcomes.push({ articleId: article.id, kind: "kept", storyId: article.storyId });
      continue;
    }
    const embedding = embeddingOf.get(article.id);
    if (embedding === undefined) throw new Error(`임베딩 없음: ${article.id}`);
    const candidates = await deps.store.findCandidates(embedding, {
      now: input.now,
      k: thresholds.candidates,
    });
    const decision = decideAssignment({ candidates, now: input.now, thresholds });
    if (decision.kind === "assign") {
      await deps.store.assignToStory({
        articleId: article.id,
        storyId: decision.storyId,
        embedding,
        publishedAt: article.publishedAt,
        topics: article.topics,
        processedAt: input.now,
      });
      outcomes.push({ articleId: article.id, kind: "assigned", storyId: decision.storyId });
    } else {
      const storyId = storyIdForFirstArticle(article.id);
      await deps.store.createStory({
        story: { id: storyId, slug: storyId, title: article.title, topics: article.topics },
        articleId: article.id,
        embedding,
        publishedAt: article.publishedAt,
        processedAt: input.now,
      });
      outcomes.push({ articleId: article.id, kind: "new-story", storyId, reason: decision.reason });
    }
  }
  return { outcomes, usage: embedded.usage };
}
