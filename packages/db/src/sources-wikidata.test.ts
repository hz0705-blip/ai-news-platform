import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  readSourceRegistryFile,
  SOURCES_FILE_PATH,
  type SourceRegistryRow,
} from "./sources-file.ts";
import {
  buildWikidataQuery,
  diffRegistryRow,
  draftsFromWikidata,
  type WikidataDraft,
} from "./sources-wikidata.ts";

/** 2026-09-28 실제 Wikidata SPARQL 응답(koreatimes.co.kr, reuters.com). `request.query`가 그때의 질의다. */
const recorded: { domains: string[]; request: { query: string }; body: unknown } = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../fixtures/wikidata/koreatimes-reuters.json", import.meta.url)),
    "utf8",
  ),
);

function rowOf(draft: WikidataDraft | undefined): SourceRegistryRow {
  if (draft?.row === undefined) throw new Error(`초안 없음: ${draft?.domain}`);
  return draft.row;
}

describe("sources:wikidata", () => {
  it("wikidata draft prints diff and leaves file unchanged", () => {
    const before = readFileSync(SOURCES_FILE_PATH, "utf8");
    const existing = readSourceRegistryFile();
    const drafts = draftsFromWikidata(recorded.body, recorded.domains, "2026-09-28");

    // 등록된 행: 소유 형태는 초안이 정하지 못해 `unknown`이고, 소유자는 힌트로 나온다.
    const koreaTimes = drafts.find((d) => d.domain === "koreatimes.co.kr");
    expect(koreaTimes?.row).toMatchObject({
      id: "koreatimes.co.kr",
      name: "The Korea Times",
      region: "kr",
      language: "en",
      isExcluded: true,
      wikidataId: "Q486950",
    });
    expect(koreaTimes?.hints).toEqual(["소유(P127): Hankook Ilbo"]);
    const current = existing.find((r) => r.domains.includes("koreatimes.co.kr"));
    const diff = diffRegistryRow(current, rowOf(koreaTimes));
    expect(diff).toEqual(['~ ownership: "private" → "unknown"']);

    // 미등록 행: 여러 항목 중 채워진 항목(Reuters)을 고르고 나머지는 힌트, 차이는 전부 `+`.
    const reuters = drafts.find((d) => d.domain === "reuters.com");
    expect(reuters?.row).toMatchObject({ name: "Reuters", region: "gb", isExcluded: false });
    expect(reuters?.hints).toContain("다른 후보: Q22343541 reuters.com");
    const added = diffRegistryRow(undefined, rowOf(reuters));
    expect(added).toContain('+ wikidataId: "Q130879"');
    expect(added.every((line) => line.startsWith("+ "))).toBe(true);

    expect(readFileSync(SOURCES_FILE_PATH, "utf8")).toBe(before);
  });

  it("builds the recorded query from the same domains", () => {
    expect(buildWikidataQuery(recorded.domains)).toBe(recorded.request.query);
  });
});
