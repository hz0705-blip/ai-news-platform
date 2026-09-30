import type { Revision, Source } from "@newstrail/domain";
import { describe, expect, it } from "vitest";
import {
  type RevisionSourceRow,
  toDomainRevision,
  toDomainSource,
  toDomainStory,
  toRows,
  toSourceRow,
  toStoryRow,
} from "./mappers.ts";
// 개정판 픽스처는 publish.test.ts와 공유한다(src/test-fixtures.ts).
import { fixture, revision } from "./test-fixtures.ts";

/** 읽기 질의가 `articles`·`sources`를 이어 만드는 출처 구획 행(쓰기 행에는 없다). */
function joinedSources(r: Revision): RevisionSourceRow[] {
  return r.sources.map((s) => ({
    source_id: s.sourceId,
    article_id: s.articleId,
    article_title: s.articleTitle,
    article_url: s.articleUrl,
    published_at: s.publishedAt,
    rights_tier: s.rightsTier,
  }));
}

describe("행 ↔ 도메인 매퍼", () => {
  it("개정판을 행으로 바꿨다 되돌리면 같다", () => {
    expect(toDomainRevision({ ...toRows(revision), sources: joinedSources(revision) })).toEqual(
      revision,
    );
  });

  it("근거 행은 구간 단위와 정규화 버전을 명시한다", () => {
    const rows = toRows(revision);
    for (const row of rows.evidence) {
      expect(row.offset_unit).toBe("code-point");
      expect(row.normalization_version).toBe(1);
    }
  });

  it("근거 differsIn은 행 differs_in으로 왕복하고 없으면 null", () => {
    const first = revision.claims[0];
    const firstEvidence = first?.evidence[0];
    if (first === undefined || firstEvidence === undefined) throw new Error("픽스처에 근거가 없다");
    const withDiff: Revision = {
      ...revision,
      claims: [
        {
          ...first,
          evidence: [{ ...firstEvidence, differsIn: "모두 중단" }, ...first.evidence.slice(1)],
        },
      ],
    };
    const rows = toRows(withDiff);
    expect(rows.evidence[0]?.differs_in).toBe("모두 중단");
    expect(rows.evidence[1]?.differs_in).toBeNull();
    expect(toDomainRevision({ ...rows, sources: joinedSources(withDiff) })).toEqual(withDiff);
  });

  it("개정판 행 checked_at은 발행 시각으로 시작한다", () => {
    expect(toRows(revision).revision.checked_at).toEqual(revision.publishedAt);
  });

  it("출처 wireId는 행 wire_id로 왕복하고 없으면 null", () => {
    const source: Source = {
      id: "src-a",
      name: "A",
      rightsTier: "링크만",
      region: "가상 지역",
      ownership: "민간 소유",
      language: "영어",
      isFictional: true,
    };
    expect(toSourceRow(source).wire_id).toBeNull();
    expect(toDomainSource(toSourceRow(source))).toEqual(source);
    const wired: Source = { ...source, wireId: "wire-1" };
    expect(toSourceRow(wired).wire_id).toBe("wire-1");
    expect(toDomainSource(toSourceRow(wired))).toEqual(wired);
  });

  it("사건 행은 도메인 사건으로 왕복한다", () => {
    expect(toDomainStory(toStoryRow(fixture.story))).toEqual(fixture.story);
  });
});
