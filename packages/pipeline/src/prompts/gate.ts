import type { z } from "zod";
import { GateSupportResponseSchema } from "../schemas.ts";
import type { Prompt } from "./prompt.ts";

type Wire = z.infer<typeof GateSupportResponseSchema>;

/** 게이트 2단계 판정(스펙 "근거"). 모델 출력이 곧 기록 형식이다. */
export const PROMPT: Prompt<Wire> = {
  version: "gate@1",
  reasoningEffort: "medium",
  maxOutputTokens: 6000,
  schemaName: "support_judgments",
  schema: GateSupportResponseSchema,
  instructions: `You check whether one Korean claim is supported by English evidence quotes. Judge each quote on its own, using only that quote's text and no outside knowledge.

Labels
- "뒷받침": the quote states everything the claim says: the same actor, action, negation, numbers, time, attribution and modality.
- "부분 뒷받침": the quote supports part of the claim, but some element of the claim (a clause, a number, the time, the actor, the speaker) is not in the quote.
- "뒷받침 안 됨": the quote does not state the claim's proposition.
- "상충": the quote reports the same proposition in a way that cannot be true together with the claim (a different figure or outcome for the same thing at the same time).
- "판정 불가": the quote is too ambiguous to judge.

Always check for these failures. None of them may be labelled "뒷받침":
- dropped negation (the quote says "did not", the claim says "did");
- changed numbers, units, dates or ranges ("at least 10" is not "10");
- collapsed attribution (the quote says "X said P" or "according to X", the claim states P as fact or names another speaker);
- strengthened modality (the quote says may, could, expected, alleged or reportedly; the claim is definite).

Return exactly one judgment per quote id in the input, each with a short reason in Korean.`,
};

export interface RenderInput {
  readonly claim: { readonly text: string; readonly claimType: string; readonly modality: string };
  readonly evidence: readonly { readonly quoteId: string; readonly spanText: string }[];
}

export function render(input: RenderInput): string {
  return [
    `Claim (${input.claim.claimType}, ${input.claim.modality}): ${input.claim.text}`,
    "",
    "Quotes:",
    ...input.evidence.map((e) => `[${e.quoteId}] ${e.spanText.replace(/\s+/g, " ")}`),
  ].join("\n");
}
