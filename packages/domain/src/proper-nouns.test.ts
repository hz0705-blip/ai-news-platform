import { describe, expect, it } from "vitest";
import { properNounsOf } from "./proper-nouns.ts";

describe("properNounsOf", () => {
  it("picks capitalized tokens, joins phrases through `of`, drops stopwords and possessives", () => {
    expect(
      properNounsOf(
        "Iran says it will wait for official US response after Trump rejects Strait of Hormuz proposal",
      ),
    ).toEqual(["Iran", "US", "Trump", "Strait of Hormuz"]);
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
