import type { Article, Revision, Source, Story } from "@newsplatform/domain";
import type { z } from "zod";

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

/** 모델 호출 한 번의 사용량: 토큰(입력 + 출력)과 USD. */
export interface ModelUsage {
  readonly tokens: number;
  readonly spend: number;
}

export type ReasoningEffort = "minimal" | "low" | "medium" | "high";

/**
 * 모델 호출 요청 하나. 단계가 프롬프트(`src/prompts/`)에서 만든다. 기록된 클라이언트는
 * `stage`·`key`로만 찾고, 실제 클라이언트는 프롬프트와 입력으로 호출한 뒤 `decode`로
 * 모델 출력을 그 단계의 기록 형식(`recorded/<stage>.json`의 값)으로 바꾼다.
 */
export interface ModelRequest {
  readonly stage: string;
  /** 단계의 멱등키. 기록된 응답의 조회 키이기도 하다. */
  readonly key: string;
  readonly promptVersion: string;
  readonly instructions: string;
  readonly input: string;
  readonly reasoningEffort: ReasoningEffort;
  /** 추론 토큰을 포함한 최대 출력 토큰. */
  readonly maxOutputTokens: number;
  readonly schemaName: string;
  /** 모델 출력의 구조화 출력 스키마(strict JSON 스키마로 바꿔 보낸다). */
  readonly schema: z.ZodType;
  /** JSON으로 읽은 모델 출력을 검증해 기록 형식으로 바꾼다. 위반이면 던진다. */
  readonly decode: (raw: unknown) => unknown;
}

/** 모델 호출 결과: 기록 형식의 출력(호출한 단계가 다시 zod로 파싱한다)과 사용량. */
export interface ModelResponse {
  readonly output: unknown;
  readonly usage: ModelUsage;
}

/** 모델 호출 의존성. `modelId`는 개정판에 기록되는 모델 식별자다. */
export interface ModelClient {
  readonly modelId: string;
  complete(request: ModelRequest): Promise<ModelResponse>;
}

/** 임베딩 호출 한 번의 결과: 입력 순서대로의 벡터와 사용량(토큰·USD). */
export interface EmbeddingResult {
  readonly vectors: readonly (readonly number[])[];
  readonly usage: { readonly tokens: number; readonly spend: number };
}

/** 임베딩 의존성. 사건 배정(#53, `runAssignment`)이 쓴다. `runBatch`는 아직 호출하지 않는다. */
export interface EmbeddingClient {
  embed(texts: readonly string[]): Promise<EmbeddingResult>;
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

/**
 * 모델이 응답했지만 쓸 수 없다(미완료, 구조화 출력 위반). 이미 쓴 사용량을 담아
 * 배치 리포트가 실패한 호출의 지출도 센다.
 */
export class ModelResponseError extends StageFailure {
  readonly usage: ModelUsage;

  constructor(stage: string, key: string, detail: string, usage: ModelUsage) {
    super(stage, key, detail);
    this.usage = usage;
  }
}
