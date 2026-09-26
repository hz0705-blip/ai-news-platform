import type { Article, Revision, Source, Story } from "@newsplatform/domain";

/**
 * 배치에 들어오는 기사 한 건: 기사 메타데이터 + 기사 버전 식별자 + 원문 본문.
 * 권리 등급은 기사가 아니라 출처가 가진다 — `BatchInput.sources`에서 `sourceId`로 찾는다.
 */
export type ArticleInput = Article & {
  readonly articleVersionId: string;
  readonly rawBody: string;
};

/** 하루 비용 상한(docs/spec/v1.md "배치와 비용"). */
export interface Budget {
  readonly tokens: number;
  readonly spend: number;
}

/** 배치가 이미 아는 사건 하나. 슬러그는 결정론 식별자(개정판·주장·근거)의 접두사가 된다. */
export interface StoryState {
  readonly story: Story;
  /** 마지막 발행 개정판. 있으면 개정판 번호 계산과 중복 제거(스펙 134행)에 쓴다. */
  readonly latestRevision?: Revision;
}

/** 가드 ①로 이번 개정판에서 빠진 주장 하나(#22 Ruling 22-4). */
export interface DroppedClaim {
  readonly storyId: string;
  readonly claimKey: string;
  readonly reason: string;
}

/** 이전 개정판과 내용이 같아 새 개정판을 만들지 않고 확인만 한 사건(스펙 134행, Ruling 22-11). */
export interface ConfirmedRevision {
  readonly storyId: string;
  readonly revisionId: string;
  readonly checkedAt: Date;
}

/** 변화 종류 넷(docs/spec/v1.md 사용자 이야기 19, CONTEXT.md "변화"). */
export const CHANGE_KINDS = [
  "주장 추가·삭제·수정",
  "상충 상태 변화",
  "원문 변경",
  "출처 추가",
] as const;

export type ChangeKind = (typeof CHANGE_KINDS)[number];

/**
 * 두 개정판 사이의 변화 하나. 변화 계산은 M3가 채우므로 배치의 `changes`는 아직 늘 비어 있다.
 */
export interface Change {
  readonly storyId: string;
  readonly kind: ChangeKind;
}

/** 모델 호출 의존성. 반환값은 호출한 단계의 zod 스키마가 파싱한다. */
export interface ModelClient {
  complete(stage: string, key: string): Promise<unknown>;
}

/** 임베딩 의존성. #21에서는 통과 단계용이라 호출되지 않는다(M2a에서 사건 배정이 쓴다). */
export interface EmbeddingClient {
  embed(texts: readonly string[]): Promise<readonly (readonly number[])[]>;
}

export interface BatchInput {
  readonly articles: readonly ArticleInput[];
  readonly now: Date;
  readonly dailyBudget: Budget;
  readonly sources: readonly Source[];
  readonly existingStories: readonly StoryState[];
}

export interface BatchDeps {
  readonly modelClient: ModelClient;
  readonly embeddingClient: EmbeddingClient;
  readonly clock: () => Date;
}

export interface BatchReport {
  readonly processed: number;
  readonly deferred: number;
  readonly failed: number;
  readonly failures: readonly { readonly storyId: string; readonly reason: string }[];
  readonly droppedClaims: readonly DroppedClaim[];
  readonly usage: readonly {
    readonly stage: string;
    readonly tokens: number;
    readonly spend: number;
  }[];
  readonly budgetReached: boolean;
}

export interface BatchResult {
  readonly revisions: readonly Revision[];
  readonly confirmed: readonly ConfirmedRevision[];
  readonly changes: readonly Change[];
  readonly report: BatchReport;
}

/**
 * 한 단계가 사건을 더 진행할 수 없을 때 던진다. 배치는 이것을 잡아 그 사건을 실패로
 * 리포트하고 다음 사건으로 넘어간다(사건 단위 원자성). 메시지에 단계 이름과 멱등키가 들어간다.
 */
export class StageFailure extends Error {
  override readonly name = "StageFailure";

  constructor(stage: string, key: string, detail: string) {
    super(`${stage} [${key}]: ${detail}`);
  }
}
