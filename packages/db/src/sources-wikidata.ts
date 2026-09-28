import { z } from "zod";
import type { SourceRegistryRow } from "./sources-file.ts";

/**
 * Wikidata(CC0)로 출처 표 행 초안을 만든다(#76, 스펙 "출처 표"): P856 공식 웹사이트로 항목을 찾고
 * P17 국가(→ P297 ISO 코드), P127 소유·P749 모회사, P407 언어(→ P424 코드), P31 유형(통신사 Q192283)을 읽는다.
 * 소유 형태는 소유자 이름만으로 정할 수 없어 초안은 `unknown`이고 소유자·모회사는 힌트로 출력한다.
 * 이 모듈은 순수하다 — 질의 문자열, 응답 → 초안, 초안 ↔ 기존 행 차이. HTTP·파일은 `scripts/sources-wikidata.ts`가 한다.
 */
export const WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql";
const NEWS_AGENCY = "Q192283";

/** 공식 웹사이트 값은 스킴·`www.`·끝 `/`가 제각각이라 여덟 변형을 정확히 맞춘다(정규식은 시간 초과). */
function siteVariants(domain: string): string[] {
  const variants: string[] = [];
  for (const scheme of ["https", "http"]) {
    for (const host of [`www.${domain}`, domain]) {
      variants.push(`${scheme}://${host}`, `${scheme}://${host}/`);
    }
  }
  return variants;
}

export function buildWikidataQuery(domains: readonly string[]): string {
  const values = domains
    .flatMap(siteVariants)
    .map((v) => `<${v}>`)
    .join(" ");
  return [
    "SELECT ?item ?itemLabel ?site ?countryCode ?ownerLabel ?parentLabel ?langCode ?type WHERE {",
    `  VALUES ?site { ${values} }`,
    "  ?item wdt:P856 ?site .",
    "  OPTIONAL { ?item wdt:P17 ?country . ?country wdt:P297 ?countryCode }",
    "  OPTIONAL { ?item wdt:P127 ?owner }",
    "  OPTIONAL { ?item wdt:P749 ?parent }",
    "  OPTIONAL { ?item wdt:P407 ?lang . ?lang wdt:P424 ?langCode }",
    "  OPTIONAL { ?item wdt:P31 ?type }",
    '  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }',
    "}",
  ].join("\n");
}

const Literal = z.object({ value: z.string() });
export const WikidataResponseSchema = z.object({
  results: z.object({
    bindings: z.array(
      z.object({
        item: Literal,
        itemLabel: Literal.optional(),
        site: Literal,
        countryCode: Literal.optional(),
        ownerLabel: Literal.optional(),
        parentLabel: Literal.optional(),
        langCode: Literal.optional(),
        type: Literal.optional(),
      }),
    ),
  }),
});

export interface WikidataDraft {
  readonly domain: string;
  readonly row: SourceRegistryRow | undefined;
  /** 소유자·모회사·다른 후보 항목 등 사람이 판단할 재료. */
  readonly hints: readonly string[];
}

interface Candidate {
  qid: string;
  label: string;
  site: string;
  countryCode?: string;
  langCode?: string;
  owners: Set<string>;
  parents: Set<string>;
  isWire: boolean;
}

function domainOfSite(site: string): string {
  return new URL(site).hostname.toLowerCase().replace(/^www\./, "");
}

/** 응답을 도메인마다 초안 하나로 만든다. 항목이 여럿이면 채워진 칸이 많은 항목을 고르고 나머지는 힌트로 남긴다. */
export function draftsFromWikidata(
  response: unknown,
  domains: readonly string[],
  checkedOn: string,
): WikidataDraft[] {
  const { results } = WikidataResponseSchema.parse(response);
  const byDomain = new Map<string, Map<string, Candidate>>();
  for (const b of results.bindings) {
    const domain = domainOfSite(b.site.value);
    const qid = b.item.value.replace(/^.*\//, "");
    const candidates = byDomain.get(domain) ?? new Map<string, Candidate>();
    const c = candidates.get(qid) ?? {
      qid,
      label: b.itemLabel?.value ?? qid,
      site: b.site.value,
      owners: new Set<string>(),
      parents: new Set<string>(),
      isWire: false,
    };
    if (b.countryCode) c.countryCode = b.countryCode.value.toLowerCase();
    // P424는 `en-us` 같은 BCP-47 값도 있다 — ISO 639-1 두 글자만 쓴다.
    const langCode = b.langCode?.value.toLowerCase().split("-")[0];
    if (langCode) c.langCode = langCode;
    if (b.ownerLabel) c.owners.add(b.ownerLabel.value);
    if (b.parentLabel) c.parents.add(b.parentLabel.value);
    if (b.type?.value.endsWith(`/${NEWS_AGENCY}`)) c.isWire = true;
    candidates.set(qid, c);
    byDomain.set(domain, candidates);
  }

  const score = (c: Candidate) =>
    (c.countryCode ? 1 : 0) + (c.langCode ? 1 : 0) + c.owners.size + c.parents.size;
  return domains.map((domain) => {
    const candidates = [...(byDomain.get(domain)?.values() ?? [])].sort(
      (a, b) => score(b) - score(a),
    );
    const best = candidates[0];
    if (best === undefined) {
      return {
        domain,
        row: undefined,
        hints: ["Wikidata에 공식 웹사이트가 이 도메인인 항목이 없다"],
      };
    }
    const hints = [
      ...(best.owners.size > 0 ? [`소유(P127): ${[...best.owners].join(", ")}`] : []),
      ...(best.parents.size > 0 ? [`모회사(P749): ${[...best.parents].join(", ")}`] : []),
      ...candidates.slice(1).map((c) => `다른 후보: ${c.qid} ${c.label}`),
    ];
    return {
      domain,
      row: {
        id: domain,
        domains: [domain],
        name: best.label,
        region: best.countryCode ?? "미확인",
        ownership: "unknown",
        isWire: best.isWire,
        language: best.langCode ?? "미확인",
        // 국내 언론사는 제외한다(ADR-0001).
        isExcluded: best.countryCode === "kr",
        rightsTier: "본문 처리 + 발췌 표시",
        basisUrl: best.site,
        checkedOn,
        wikidataId: best.qid,
      },
      hints,
    };
  });
}

/** 기존 행과 초안의 차이만 줄로 만든다. 같으면 빈 배열. 기존 행이 없으면 초안 전체가 `+`다. */
export function diffRegistryRow(
  existing: SourceRegistryRow | undefined,
  draft: SourceRegistryRow,
): string[] {
  const lines: string[] = [];
  for (const key of Object.keys(draft) as (keyof SourceRegistryRow)[]) {
    const before = existing === undefined ? undefined : JSON.stringify(existing[key]);
    const after = JSON.stringify(draft[key]);
    if (before === after) continue;
    lines.push(before === undefined ? `+ ${key}: ${after}` : `~ ${key}: ${before} → ${after}`);
  }
  return lines;
}
