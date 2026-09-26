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
  /** 주장 쪽 보도 원점 수와, 주장 쪽과 겹치지 않는 반대 쪽 보도 원점 수(Ruling 22-1 개정). */
  readonly origins: { readonly supporting: number; readonly conflicting: number };
}

/** `<storyId>:<claimKey>` — 주장 키는 사건마다 `c-1`부터 다시 시작하므로 사건 식별자를 앞에 붙인다. */
export function idempotencyKey(input: ContradictionInput): string {
  return `${input.storyId}:${input.claimKey}`;
}

/**
 * 기록된 관계 라벨로 주장 상태를 정한다(Ruling 22-1 개정·22-6). 인용을 주장 쪽과 반대 쪽으로
 * 나눠(`partitionSides`) 주장 쪽 원점을 뒷받침 원점으로, 주장 쪽과 겹치지 않는 반대 쪽 원점을
 * 상충 원점으로 센다. 근거가 둘 이상인데 쌍이 없으면 뒷받침 원점이 0이다.
 * 응답 스키마 불일치로 실패하는 경우: 쌍의 a·b가 이 주장의 근거 인용이 아니거나 서로 같다,
 * 같은 인용 쌍에 라벨이 둘이다, 같은 쌍이 양쪽 방향으로 양립 불가다, 한 인용의 다른 점이 쌍마다 다르다,
 * 한 인용이 주장 쪽과 반대 쪽에 모두 속한다.
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
  const mismatch = (detail: string) =>
    new StageFailure(STAGE, key, `응답 스키마 불일치: ${detail}`);
  const quoteIds = new Set(input.evidence.map((item) => item.quoteId));
  // 인용 쌍(순서 없음)마다 라벨 하나. 양립 불가는 방향(a→b)까지 하나다.
  const seen = new Map<string, { label: string; a: string }>();
  for (const pair of pairs) {
    if (!quoteIds.has(pair.a) || !quoteIds.has(pair.b) || pair.a === pair.b) {
      throw mismatch(`쌍 ${pair.a}/${pair.b}가 이 주장의 근거 인용이 아니거나 서로 같다`);
    }
    const pairKey = JSON.stringify([pair.a, pair.b].sort());
    const previous = seen.get(pairKey);
    if (previous === undefined) {
      seen.set(pairKey, { label: pair.label, a: pair.a });
    } else if (previous.label !== pair.label) {
      throw mismatch(`쌍 ${pair.a}/${pair.b}에 라벨이 둘이다(${previous.label}, ${pair.label})`);
    } else if (pair.label === "양립 불가" && previous.a !== pair.a) {
      throw mismatch(`쌍 ${pair.a}/${pair.b}가 양쪽 방향으로 양립 불가다`);
    }
  }

  const differsIn: Record<string, string> = {};
  for (const pair of pairs) {
    if (pair.label !== "양립 불가") continue;
    // 스키마가 양립 불가 쌍의 differsIn 키가 정확히 a·b임을 보장한다.
    for (const [quoteId, text] of Object.entries(pair.differsIn ?? {})) {
      const existing = differsIn[quoteId];
      if (existing !== undefined && existing !== text) {
        throw mismatch(`인용 ${quoteId}의 다른 점이 쌍마다 다르다`);
      }
      differsIn[quoteId] = text;
    }
  }

  const { claimSide, opposingSide } = partitionSides(input.evidence, pairs);
  for (const quoteId of claimSide) {
    if (opposingSide.has(quoteId))
      throw mismatch(`인용 ${quoteId}가 주장 쪽과 반대 쪽에 모두 있다`);
  }

  const evidenceOf = (side: ReadonlySet<string>) =>
    input.evidence.filter((item) => side.has(item.quoteId));
  const supporting = reportingOrigins(evidenceOf(claimSide));
  const opposing = reportingOrigins(evidenceOf(opposingSide));
  // 반대 쪽 원점 중 주장 쪽 원점과 같은 것은 같은 출처의 자체 수정이라 상충으로 세지 않는다(스펙 131행).
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

  return {
    claimKey: input.claimKey,
    result,
    differsIn,
    origins: { supporting: supporting.size, conflicting: conflictingOrigins },
  };
}

/**
 * 주장의 인용을 주장 쪽과 반대 쪽으로 나눈다(Ruling 22-1 개정).
 * 씨앗: 주장 쪽 = 양립 불가 쌍의 a ∪ (근거가 정확히 하나면 그것), 반대 쪽 = 양립 불가 쌍의 b.
 * 뒷받침 일치 쌍은 방향 없는 간선으로 쪽을 전파한다. 양립 불가 쌍이 하나도 없으면 뒷받침 일치 쌍에
 * 걸린 인용은 모두 주장 쪽이다. 어느 쌍에도 없는 인용(단일 근거 예외 제외)은 어느 쪽도 아니다.
 * 두 쪽이 겹치는지는 호출한 쪽이 검사한다.
 */
function partitionSides(
  evidence: ContradictionInput["evidence"],
  pairs: readonly { readonly a: string; readonly b: string; readonly label: string }[],
): { claimSide: Set<string>; opposingSide: Set<string> } {
  const agreeing = pairs.filter((pair) => pair.label === "뒷받침 일치");
  const incompatible = pairs.filter((pair) => pair.label === "양립 불가");

  const claimSeeds = incompatible.map((pair) => pair.a);
  const [only] = evidence;
  if (evidence.length === 1 && only !== undefined) claimSeeds.push(only.quoteId);
  if (incompatible.length === 0) claimSeeds.push(...agreeing.flatMap((pair) => [pair.a, pair.b]));

  const neighbours = new Map<string, string[]>();
  for (const { a, b } of agreeing) {
    neighbours.set(a, [...(neighbours.get(a) ?? []), b]);
    neighbours.set(b, [...(neighbours.get(b) ?? []), a]);
  }
  const reach = (seeds: readonly string[]): Set<string> => {
    const side = new Set(seeds);
    const queue = [...seeds];
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      for (const neighbour of neighbours.get(next) ?? []) {
        if (side.has(neighbour)) continue;
        side.add(neighbour);
        queue.push(neighbour);
      }
    }
    return side;
  };

  return {
    claimSide: reach(claimSeeds),
    opposingSide: reach(incompatible.map((pair) => pair.b)),
  };
}
