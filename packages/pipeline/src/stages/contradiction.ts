import {
  type ClaimStatusResult,
  CONTRADICTION_STATUSES,
  deriveClaimStatus,
  RIGHTS_TIERS,
  reportingOrigins,
} from "@newsplatform/domain";
import { z } from "zod";
import { ContradictionLabelResponseSchema } from "../schemas.ts";
import { type ModelClient, StageFailure } from "../types.ts";

/** batch-run.ts가 사용량 줄 순서에 참조한다 — export 유지. */
export const STAGE = "contradiction-label";

/**
 * 게이트 1단계를 통과한 주장 하나의 근거들(인용문 식별자와 출처)과 이전 개정판의 주장 상태.
 * `wireId`는 출처가 전재한 통신 기사 식별자다(Ruling 22-13).
 */
export const InputSchema = z.object({
  storyId: z.string(),
  claimKey: z.string(),
  previous: z.enum(CONTRADICTION_STATUSES).optional(),
  evidence: z.array(
    z.object({
      quoteId: z.string(),
      sourceId: z.string(),
      wireId: z.string().exactOptional(),
      rightsTier: z.enum(RIGHTS_TIERS),
    }),
  ),
});

export type ContradictionInput = z.infer<typeof InputSchema>;

export interface ContradictionOutput {
  readonly claimKey: string;
  readonly result: ClaimStatusResult;
  /** quoteId → 다른 점. `양립 불가` 쌍의 양쪽 인용에만 있다(Ruling 22-6). */
  readonly differsIn: Readonly<Record<string, string>>;
}

/** `<storyId>:<claimKey>` — 주장 키는 사건마다 `c-1`부터 다시 시작하므로 사건 식별자를 앞에 붙인다. */
export function idempotencyKey(input: ContradictionInput): string {
  return `${input.storyId}:${input.claimKey}`;
}

/**
 * 기록된 관계 라벨로 주장 상태를 정한다(Ruling 22-1·22-6).
 * 뒷받침 인용 = `뒷받침 일치` 쌍 양쪽 ∪ `양립 불가` 쌍의 a ∪ (근거가 정확히 하나면 그것).
 * 반대편 인용 = `양립 불가` 쌍의 b. 반대편 원점 중 뒷받침 원점과 같은 것은 같은 출처의
 * 자체 수정이라 상충으로 세지 않는다(스펙 131행). 근거가 둘 이상인데 쌍이 없으면 뒷받침 원점이 0이다.
 * 쌍의 a·b가 이 주장의 근거 인용이 아니거나 서로 같으면 응답 스키마 불일치로 실패한다.
 */
export async function runContradictionLabel(
  input: ContradictionInput,
  modelClient: ModelClient,
): Promise<ContradictionOutput> {
  const key = idempotencyKey(input);
  const parsed = ContradictionLabelResponseSchema.safeParse(await modelClient.complete(STAGE, key));
  if (!parsed.success) {
    throw new StageFailure(STAGE, key, `응답 스키마 불일치: ${z.prettifyError(parsed.error)}`);
  }

  const { pairs } = parsed.data;
  const byQuote = new Map(input.evidence.map((item) => [item.quoteId, item]));
  for (const pair of pairs) {
    if (!byQuote.has(pair.a) || !byQuote.has(pair.b) || pair.a === pair.b) {
      throw new StageFailure(
        STAGE,
        key,
        `응답 스키마 불일치: 쌍 ${pair.a}/${pair.b}가 이 주장의 근거 인용이 아니거나 서로 같다`,
      );
    }
  }

  const supportingQuoteIds = new Set<string>();
  const opposingQuoteIds = new Set<string>();
  const differsIn: Record<string, string> = {};
  for (const pair of pairs) {
    if (pair.label === "뒷받침 일치") {
      supportingQuoteIds.add(pair.a);
      supportingQuoteIds.add(pair.b);
    } else if (pair.label === "양립 불가") {
      supportingQuoteIds.add(pair.a);
      opposingQuoteIds.add(pair.b);
      // 스키마가 양립 불가 쌍의 a·b 모두에 다른 점이 있음을 보장한다.
      for (const quoteId of [pair.a, pair.b]) {
        const text = pair.differsIn?.[quoteId];
        if (text !== undefined) differsIn[quoteId] = text;
      }
    }
  }
  const [only] = input.evidence;
  if (input.evidence.length === 1 && only !== undefined) supportingQuoteIds.add(only.quoteId);

  const evidenceOf = (quoteIds: ReadonlySet<string>) =>
    input.evidence.filter((item) => quoteIds.has(item.quoteId));
  const supporting = reportingOrigins(evidenceOf(supportingQuoteIds));
  const opposing = reportingOrigins(evidenceOf(opposingQuoteIds));
  const conflictingOrigins = [...opposing].filter((origin) => !supporting.has(origin)).length;

  const result = deriveClaimStatus({
    previous: input.previous,
    // 이 단계에는 게이트 1단계를 통과한 근거만 온다.
    verified: true,
    undeterminable: pairs.some((pair) => pair.label === "판정 불가"),
    supportingOrigins: supporting.size,
    conflictingOrigins,
    // 에피소드 기록은 M3가 채운다. 사건 단위의 열린 에피소드는 batch-run이 `openEpisodes`로 넘긴다.
    openEpisode: false,
    // 아래 두 플래그는 "이번 패스에서 관찰했다"가 아니라 "이전 개정판 이후 명시 정정·해소가
    // 기록되었다"는 뜻이다. 에피소드 기록이 생기는 M3가 채운다.
    explicitCorrection: false,
    explicitResolution: false,
  });

  return { claimKey: input.claimKey, result, differsIn };
}
