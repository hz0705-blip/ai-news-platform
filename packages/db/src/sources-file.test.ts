import { describe, expect, it } from "vitest";
import { parseSourceRegistry, readSourceRegistryFile, toSource } from "./sources-file.ts";

const row = {
  id: "yna.co.kr",
  domains: ["yna.co.kr"],
  name: "Yonhap News Agency",
  region: "kr",
  ownership: "public-service",
  isWire: true,
  language: "ko",
  isExcluded: true,
  rightsTier: "본문 처리 + 발췌 표시",
  basisUrl: "https://www.yna.co.kr/",
  checkedOn: "2026-09-28",
  wikidataId: "Q333206",
};

describe("출처 표 파일", () => {
  it("sources file schema rejects invalid ownership", () => {
    expect(() => parseSourceRegistry([{ ...row, ownership: "불명" }])).toThrow(/ownership/);
    expect(() => parseSourceRegistry([{ ...row, ownership: "public" }])).toThrow(/ownership/);
    expect(parseSourceRegistry([row])).toHaveLength(1);
  });

  it("rejects www. domains, duplicate domains across rows, and bad dates", () => {
    expect(() => parseSourceRegistry([{ ...row, domains: ["www.yna.co.kr"] }])).toThrow(/domains/);
    expect(() =>
      parseSourceRegistry([row, { ...row, id: "yonhap-en", domains: ["yna.co.kr"] }]),
    ).toThrow(/중복 도메인/);
    expect(() => parseSourceRegistry([{ ...row, checkedOn: "2026/09/28" }])).toThrow(/checkedOn/);
  });

  it("committed sources.json parses and maps to non-fictional sources with domains", () => {
    const rows = readSourceRegistryFile();
    expect(rows.length).toBeGreaterThanOrEqual(50);
    // 확인된 국내 언론사(연합·코리아타임스)는 제외 행이다(ADR-0001).
    expect(rows.find((r) => r.id === "yna.co.kr")?.isExcluded).toBe(true);
    expect(rows.find((r) => r.id === "koreatimes.co.kr")?.isExcluded).toBe(true);
    expect(toSource(rows[0] as (typeof rows)[number])).toMatchObject({
      isFictional: false,
      domains: expect.arrayContaining([expect.any(String)]),
    });
  });
});
