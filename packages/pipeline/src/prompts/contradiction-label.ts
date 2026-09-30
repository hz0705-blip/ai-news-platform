import { RELATION_LABELS } from "@newstrail/domain";
import { z } from "zod";
import type { Prompt } from "./prompt.ts";

/** strict 출력에는 선택 필드가 없으므로 `differsIn`은 늘 배열이고, 양립 불가가 아니면 비운다. */
const WireSchema = z.object({
  pairs: z.array(
    z.object({
      a: z.string(),
      b: z.string(),
      label: z.enum(RELATION_LABELS),
      differsIn: z.array(z.object({ quoteId: z.string(), text: z.string() })),
    }),
  ),
});

type Wire = z.infer<typeof WireSchema>;

/** 상충 관계 라벨(스펙 "상충 상태": 모델은 근거 사이의 관계를 라벨하고 최종 상태는 규칙이 정한다). */
export const PROMPT: Prompt<Wire> = {
  version: "contradiction-label@1",
  reasoningEffort: "low",
  maxOutputTokens: 6000,
  schemaName: "relation_labels",
  schema: WireSchema,
  instructions: `You label the relations between English evidence quotes attached to one Korean claim. Each quote has an id and a source id. Label every unordered pair of quotes exactly once.

Labels
- "뒷받침 일치": both quotes state the claim's proposition in compatible ways.
- "양립 불가": one quote states the claim's proposition and the other reports an incompatible version of the same proposition, so both cannot be true. Put the quote that matches the claim in "a" and the incompatible one in "b". Fill "differsIn" with exactly two entries, one for a and one for b, each a short Korean sentence saying what that quote reports differently.
- "판정 불가": the relation cannot be determined from the quotes.

Only compare like with like: same claim type, subject, predicate, time, scope and modality. These are NOT incompatible: positions of different speakers, forecasts under different assumptions, figures for different times, "at least 10" versus "12", a source revising its own report, and one source omitting a detail. Label such pairs "뒷받침 일치" when both support the claim, otherwise "판정 불가".

For every label other than "양립 불가", "differsIn" must be an empty array.`,
};

export interface RenderInput {
  readonly claimText: string;
  readonly evidence: readonly {
    readonly quoteId: string;
    readonly sourceId: string;
    readonly quote: string;
  }[];
}

export function render(input: RenderInput): string {
  return [
    `Claim: ${input.claimText}`,
    "",
    "Quotes:",
    ...input.evidence.map(
      (e) => `[${e.quoteId}] (source ${e.sourceId}) ${e.quote.replace(/\s+/g, " ")}`,
    ),
  ].join("\n");
}

/** 기록 형식: 양립 불가 쌍만 `differsIn`을 `{ quoteId: 다른 점 }`으로 가진다. */
export function toRecord(wire: Wire): unknown {
  return {
    pairs: wire.pairs.map(({ differsIn, ...pair }) =>
      pair.label === "양립 불가"
        ? { ...pair, differsIn: Object.fromEntries(differsIn.map((d) => [d.quoteId, d.text])) }
        : pair,
    ),
  };
}
