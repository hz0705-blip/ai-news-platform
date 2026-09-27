import { CLAIM_TYPES, MODALITIES } from "@newsplatform/domain";
import { z } from "zod";
import type { Prompt } from "./prompt.ts";

/** 주장 키(`c-<순번>`)는 백엔드가 출력 순서대로 붙인다. */
const WireSchema = z.object({
  title: z.string(),
  claims: z.array(
    z.object({
      text: z.string(),
      claimType: z.enum(CLAIM_TYPES),
      modality: z.enum(MODALITIES),
      quoteIds: z.array(z.string()),
    }),
  ),
});

type Wire = z.infer<typeof WireSchema>;

export const PROMPT: Prompt<Wire> = {
  version: "claim-generate@1",
  reasoningEffort: "medium",
  maxOutputTokens: 12000,
  schemaName: "story_claims",
  schema: WireSchema,
  instructions: `You write the Korean claim list for one news story. The input lists the story's articles (source, title) and English evidence quotes with ids. Use only what the quotes say.

Output
- title: a Korean story title of 15 to 45 characters that describes the event. Do not adopt one side's version of a disputed point.
- claims: Korean sentences, each with claimType, modality and quoteIds.

Each claim
- States exactly one proposition that can be checked on its own. If only one clause of a sentence is supported, split it.
- Keeps the actor, time, negation, numbers, modality and attribution of the quotes. Never drop hedges ("may", "could", "reportedly", "expected to") or the speaker to make it shorter. "X said P" stays attributed to X. Use causal wording only when a quote states the cause.
- Is written in natural Korean only. Translate quoted words into Korean inside quotation marks; do not copy English phrases into the claim. Write names in Hangul.
- 40 to 120 Korean characters is the target; never exceed 160 (split instead).
- claimType: "보도된 사실" (a reported fact), "귀속 입장" (a position or statement attributed to a named person or body), "전망" (a forecast or expectation).
- modality: "단정" (definite), "의혹" (alleged), "가능" (possible), "예상" (expected), "조건부" (conditional). It must match the English; never strengthen it (may -> definite).
- quoteIds: every quote that states this proposition, from any article; plus any quote from another source that reports an incompatible version of the same proposition, so the dispute stays visible. Use only ids from the input.
- If the type or the attribution cannot be determined from the quotes, leave the claim out.

Count and order
- Aim for 3 to 5 claims, at most 7. If the evidence is thin, write only 1 or 2; never pad.
- Order: the current event first, then unresolved competing accounts, then corrections or resolutions, then background and outlook.`,
};

export interface RenderInput {
  readonly articles: readonly {
    readonly sourceName: string;
    readonly title: string;
    readonly quotes: readonly { readonly quoteId: string; readonly quote: string }[];
  }[];
}

export function render(input: RenderInput): string {
  return input.articles
    .map((article, index) =>
      [
        `Article ${index + 1} — source: ${article.sourceName}; title: ${article.title}`,
        ...article.quotes.map((q) => `[${q.quoteId}] ${q.quote.replace(/\s+/g, " ")}`),
      ].join("\n"),
    )
    .join("\n\n");
}

/** 기록 형식은 모델 출력에 주장 키를 더한 것이다. */
export function toRecord(wire: Wire): unknown {
  return {
    title: wire.title,
    claims: wire.claims.map((claim, index) => ({ claimKey: `c-${index + 1}`, ...claim })),
  };
}
