import type {
  Article,
  Revision,
  RevisionChange,
  RevisionSource,
  Source,
  Story,
} from "@newsplatform/domain";
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
  /** 이전 배치가 한도 도달로 미룬 시각("수집됨, 분석 대기"). 있으면 이번 배치에서 우선 처리한다. */
  readonly deferredSince?: Date;
  /**
   * 사건에 붙은 링크만 기사(GDELT, #77)의 출처 구획 줄. 본문이 없어 배치 입력 기사에는 없지만 개정판 출처에는
   * 들어가야 한다 — 빠지면 출처 추가 개정판 뒤의 같은 내용 재처리가 매번 새 개정판이 된다(개정판 생성 조건).
   */
  readonly linkOnlySources?: readonly RevisionSource[];
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

/** 새 개정판 하나에 붙는 변화(#85, `computeChanges`). 첫 개정판은 빈 목록이다. */
export interface RevisionChanges {
  readonly storyId: string;
  readonly revisionId: string;
  readonly changes: readonly RevisionChange[];
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
  /** 이번 배치가 쓸 수 있는 남은 예산(일일 예산에서 같은 KST 날짜의 앞선 지출을 뺀 값). */
  readonly dailyBudget: Budget;
  readonly sources: readonly Source[];
  readonly existingStories: readonly StoryState[];
  /** 동시에 처리하는 사건 수. 기본 `BATCH_CONCURRENCY`. */
  readonly concurrency?: number;
  /** 이 시각 뒤에는 모델 호출을 시작하지 않고 남은 사건을 미룬다(잡 만료보다 짧은 배치 기한). */
  readonly deadline?: Date;
}

export interface BatchDeps {
  readonly modelClient: ModelClient;
  readonly embeddingClient: EmbeddingClient;
  readonly clock: () => Date;
  /** 전송 오류 재시도 전 대기. 테스트는 즉시 돌아오는 함수를 준다. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** 호출 전 예약액(USD). 기본 `requestReservationUsd`. */
  readonly reservation?: (request: ModelRequest) => number;
  /** 사건 하나가 끝날 때마다(성공·실패·미룸) 그 사이 늘어난 사용량을 받는다. 호출 시점에 진행 중 모델 호출은 없을 수도 있다. */
  readonly onUsage?: (delta: ModelUsage) => Promise<void>;
}

export interface BatchReport {
  readonly processed: number;
  readonly deferred: number;
  readonly failed: number;
  readonly failures: readonly { readonly storyId: string; readonly reason: string }[];
  /** 미룬 사건(우선순위 순). 다음 배치에서 우선 처리된다. */
  readonly deferredStories: readonly string[];
  readonly droppedClaims: readonly DroppedClaim[];
  readonly usage: readonly {
    readonly stage: string;
    readonly tokens: number;
    readonly spend: number;
  }[];
  readonly budgetReached: boolean;
  /** 배치 기한에 닿아 사건을 미뤘는가. */
  readonly deadlineReached: boolean;
}

export interface BatchResult {
  readonly revisions: readonly Revision[];
  readonly confirmed: readonly ConfirmedRevision[];
  /** `revisions`와 같은 순서로, 개정판마다 하나. */
  readonly changes: readonly RevisionChanges[];
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

/**
 * 모델 응답을 받지 못했다(전송 오류·429·5xx·제한 시간). 재시도는 클라이언트가 아니라 배치가 하며,
 * 시도마다 다시 예약한다(#55). `billable`은 제한 시간 초과처럼 응답 없이도 과금됐을 수 있는 시도다 —
 * 배치는 그 시도를 예약액만큼 지출로 센다. `retryable`이 아니면(제한 시간) 그 사건을 실패로 두고
 * 다음 배치에서 다시 처리한다.
 */
export class ModelTransportError extends StageFailure {
  readonly retryable: boolean;
  readonly billable: boolean;

  constructor(
    stage: string,
    key: string,
    detail: string,
    options: { readonly retryable: boolean; readonly billable: boolean },
  ) {
    super(stage, key, detail);
    this.retryable = options.retryable;
    this.billable = options.billable;
  }
}

/** 예약액이 남은 예산을 넘어 호출하지 않았다. 배치는 그 사건을 미룬다(스펙 "배치와 비용"). */
export class BudgetExceededError extends Error {
  override readonly name = "BudgetExceededError";

  constructor(stage: string, key: string, reservation: number, remaining: number) {
    super(
      `${stage} [${key}]: 예약액 $${reservation.toFixed(4)}이 남은 예산 $${remaining.toFixed(4)}을 넘는다`,
    );
  }
}

/** 배치 기한이 지나 호출을 시작하지 않았다. 배치는 그 사건을 미룬다. */
export class BatchDeadlineError extends Error {
  override readonly name = "BatchDeadlineError";

  constructor(stage: string, key: string) {
    super(`${stage} [${key}]: 배치 기한 초과`);
  }
}
