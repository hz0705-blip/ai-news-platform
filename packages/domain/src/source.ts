import type { RightsTier } from "./rights.ts";

/** 소유 형태(docs/spec/v1.md "개발 중 결정 항목" 출처 표). 출처 표 파일의 값 목록이며 DB 제약은 아니다. */
export const OWNERSHIP_TYPES = [
  "public-service",
  "private",
  "state-owned",
  "nonprofit-cooperative",
  "unknown",
] as const;

export type Ownership = (typeof OWNERSHIP_TYPES)[number];

/**
 * 출처(Source): 기사를 발행한 매체 (CONTEXT.md "출처").
 * 표시하는 메타데이터는 지역·소유 형태·언어까지이며 정치 편향은 담지 않는다
 * (docs/spec/v1.md "표시하지 않는 것", ADR-0004). 출처 표(#76)의 행은 `region`에 ISO 3166-1 국가 코드,
 * `ownership`에 `OWNERSHIP_TYPES`, `language`에 ISO 639-1 코드를 쓴다. 데모 출처는 자유 문자열이라 타입은 좁히지 않는다.
 * `isFictional`은 데모 사건의 가상 출처 표기용이다(#21 Ruling 9).
 * `wireId`는 이 출처가 전재한 통신 기사 식별자다. 같은 `wireId`의 출처들은 보도 원점 하나로 센다(#22 Ruling 22-13).
 * `externalId`는 제공자(GNews `source.id`) 쪽 식별자다. 데모의 가상 출처에는 없다.
 * `domains`·`isWire`·`isExcluded`는 출처 표에 등록된 출처만 갖는다: 도메인 목록으로 수집 기사를 이 출처에 맞추고,
 * 제외 출처(국내 언론사, ADR-0001)의 기사는 수집 단계에서 버린다.
 */
export interface Source {
  readonly id: string;
  readonly name: string;
  readonly rightsTier: RightsTier;
  readonly region: string;
  readonly ownership: string;
  readonly language: string;
  readonly isFictional: boolean;
  readonly wireId?: string;
  readonly externalId?: string;
  readonly domains?: readonly string[];
  readonly isWire?: boolean;
  readonly isExcluded?: boolean;
}

/** URL의 호스트를 소문자로, 앞의 `www.`을 떼어 돌려준다. URL이 아니면 undefined. */
export function sourceHostOf(url: string): string | undefined {
  try {
    return new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/**
 * 출처 표에서 URL의 출처를 찾는다(#76). 정규화 호스트(소문자, `www.` 제거)가 행의 도메인과 같거나
 * 그 서브도메인(`en.yna.co.kr` ⊂ `yna.co.kr`)이면 그 행이다. 여러 행이 맞으면 가장 긴 도메인의 행
 * (`economictimes.indiatimes.com`이 `indiatimes.com`보다 우선). 없으면 undefined.
 */
export function matchSourceByDomain(url: string, registry: readonly Source[]): Source | undefined {
  const host = sourceHostOf(url);
  if (host === undefined) return undefined;
  let best: { source: Source; domain: string } | undefined;
  for (const source of registry) {
    for (const domain of source.domains ?? []) {
      const d = domain.toLowerCase();
      if (host !== d && !host.endsWith(`.${d}`)) continue;
      if (best === undefined || d.length > best.domain.length) best = { source, domain: d };
    }
  }
  return best?.source;
}
