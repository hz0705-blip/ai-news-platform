import { describe, expect, it } from "vitest";
import { properNounsOf } from "./proper-nouns.ts";

describe("properNounsOf", () => {
  it("picks capitalized tokens, joins phrases through `of`, drops stopwords and possessives", () => {
    expect(
      properNounsOf(
        "Marrenland says it will wait for official NU response after Aldmark rejects Strait of Kaltenia proposal",
      ),
    ).toEqual(["Marrenland", "NU", "Aldmark", "Strait of Kaltenia"]);
    expect(
      properNounsOf("After the vote, South Korea's Lee Jae-myung meets Xi in Beijing"),
    ).toEqual(["South Korea", "Lee Jae-myung", "Xi", "Beijing"]);
    expect(properNounsOf("U.S. and EU agree on 'Tariff Deal' — Reuters")).toEqual([
      "U.S.",
      "EU",
      "Tariff Deal",
      "Reuters",
    ]);
  });

  it("caps phrases at three words, dedupes case-insensitively, and returns nothing for lowercase titles", () => {
    expect(properNounsOf("Bank Of England Monetary Policy Committee holds rates")).toEqual([
      "Bank Of England",
      "Monetary Policy Committee",
    ]);
    expect(properNounsOf("Seoul, SEOUL and seoul: Seoul again")).toEqual(["Seoul"]);
    expect(properNounsOf("markets fall as yields rise")).toEqual([]);
  });
});
