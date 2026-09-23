import { describe, expect, it } from "vitest";
import { splitSentences } from "./sentence.ts";
import { spanText } from "./span.ts";

function sentences(body: string): string[] {
  return splitSentences(body).map((span) => spanText(body, span));
}

describe("splitSentences", () => {
  it("마침표·물음표·느낌표에서 나눈다", () => {
    expect(sentences("A happened. B asked? C shouted!")).toEqual([
      "A happened.",
      "B asked?",
      "C shouted!",
    ]);
  });

  it("약어는 경계가 아니다", () => {
    expect(sentences("Dr. Kim met U.S. officials. They agreed.")).toEqual([
      "Dr. Kim met U.S. officials.",
      "They agreed.",
    ]);
  });

  it("소수점은 경계가 아니다", () => {
    expect(sentences("Growth reached 3.5 percent. Officials welcomed it.")).toEqual([
      "Growth reached 3.5 percent.",
      "Officials welcomed it.",
    ]);
  });

  it("닫는 따옴표는 문장에 포함한다", () => {
    expect(sentences('She said "we agreed." Talks continue.')).toEqual([
      'She said "we agreed."',
      "Talks continue.",
    ]);
  });

  it("줄바꿈으로 나뉜 단락도 각각 문장이 된다", () => {
    expect(sentences("First line.\n\nSecond line.")).toEqual(["First line.", "Second line."]);
  });
});
