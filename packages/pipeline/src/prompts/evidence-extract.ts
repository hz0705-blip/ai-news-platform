import { sha256Hex, spanText, splitSentences } from "@newsplatform/domain";
import { z } from "zod";
import type { Prompt } from "./prompt.ts";

/** 모델은 문장 식별자만 고른다. 인용문 원문과 구간은 백엔드가 만든다(스펙 "근거"). */
const WireSchema = z.object({
  quotes: z.array(z.object({ sentenceIds: z.array(z.string()) })),
});

type Wire = z.infer<typeof WireSchema>;

export const PROMPT: Prompt<Wire> = {
  version: "evidence-extract@1",
  reasoningEffort: "low",
  maxOutputTokens: 6000,
  schemaName: "evidence_quotes",
  schema: WireSchema,
  instructions: `You select evidence sentences from one English news article. A Korean summary will be written from them, and every Korean claim must be traceable to the exact English sentences you pick.

The article body is given as numbered sentences: [s1], [s2], ...

Select the sentences that carry the article's verifiable content about the news event: who did what, when and where; figures; official statements and positions attributed to named people or bodies; forecasts and expectations; corrections, denials and disputed accounts.

Rules:
- A quote is one sentence, or two consecutive sentences only when the first cannot be understood without the second.
- Use sentence ids exactly as given. Never invent ids, skip ahead inside a quote, or paraphrase.
- Skip bylines, captions, navigation or promotional text, and background that is not about this event.
- Select at most 12 quotes, in article order. Prefer sentences that name the actor and the source of the information.`,
};

function sentenceId(index: number): string {
  return `s${index + 1}`;
}

/** 본문을 `[s1] …` 줄로 렌더한다. 문장 분할은 게이트 1단계와 같은 `splitSentences`다. */
export function render(body: string): string {
  return splitSentences(body)
    .map((span, index) => `[${sentenceId(index)}] ${spanText(body, span).replace(/\s+/g, " ")}`)
    .join("\n");
}

/**
 * 모델이 고른 문장 식별자를 기록 형식 `{ quotes: [{ quoteId, quote }] }`로 바꾼다.
 * 인용문 식별자는 `q-<기사 버전 id 해시 앞 6자>-<순번>`이라 사건 안의 여러 기사에서 겹치지 않는다.
 * 없는 식별자, 1~2개가 아닌 문장 수, 연속하지 않는 두 문장은 응답 위반으로 던진다.
 */
export function toRecord(articleVersionId: string, body: string): (wire: Wire) => unknown {
  const sentences = splitSentences(body);
  const prefix = `q-${sha256Hex(articleVersionId).slice(0, 6)}`;
  return (wire) => ({
    quotes: wire.quotes.map(({ sentenceIds }, index) => {
      const positions = sentenceIds.map((id) => {
        const position = /^s[1-9][0-9]*$/.test(id) ? Number(id.slice(1)) - 1 : -1;
        if (position < 0 || position >= sentences.length)
          throw new Error(`없는 문장 식별자: ${id}`);
        return position;
      });
      const [first, second] = positions;
      if (
        first === undefined ||
        positions.length > 2 ||
        (second !== undefined && second !== first + 1)
      ) {
        throw new Error(`인용문은 연속한 1~2문장이어야 한다: ${sentenceIds.join(",")}`);
      }
      const start = sentences[first];
      const end = sentences[second ?? first];
      if (start === undefined || end === undefined) throw new Error("문장 범위 오류");
      return {
        quoteId: `${prefix}-${index + 1}`,
        quote: spanText(body, { start: start.start, end: end.end }),
      };
    }),
  });
}
