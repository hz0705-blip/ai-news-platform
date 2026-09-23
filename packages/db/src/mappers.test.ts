import { describe, expect, it } from "vitest";
import { toDomainRevision, toRows } from "./mappers.ts";
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
});
