import type { Revision, Source } from "@newsplatform/domain";
import { describe, expect, it } from "vitest";
import { toDomainRevision, toDomainSource, toRows, toSourceRow } from "./mappers.ts";
// 개정판 픽스처는 publish.test.ts와 공유한다(src/test-fixtures.ts).
import { revision } from "./test-fixtures.ts";

describe("행 ↔ 도메인 매퍼", () => {
  it("개정판을 행으로 바꿨다 되돌리면 같다", () => {
    expect(toDomainRevision(toRows(revision))).toEqual(revision);
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
    expect(toDomainRevision(rows)).toEqual(withDiff);
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
});
