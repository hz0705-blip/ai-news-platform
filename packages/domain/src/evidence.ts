import type { CodePointSpan } from "./span.ts";

/**
 * 근거(Evidence): 주장을 뒷받침하는 기사 원문 구간 (CONTEXT.md "근거").
 *
 * 레코드는 강조 구간과 함께 게이트 1단계가 돌려준 허용 발췌 창 전문을 보존한다
 * (#21 Ruling 11). 기사 본문은 보존 기한(스펙 "데이터 보존")이 지나면 지워지지만
 * 화면은 이 레코드만으로 그려야 하기 때문이다.
 *
 * - `span`: 정규화된 기사 버전 본문 기준 코드 포인트 반개구간(강조 구간)
 * - `spanText`·`spanHash`: 강조 구간의 원문과 그 해시(#21 Ruling 2)
 * - `excerpt`·`excerptSpan`: 허용 발췌 창의 원문과 그 창의 본문 기준 구간
 * - `highlightInExcerpt`: `excerpt` 문자열 기준 지역 구간.
 *   `spanText === spanText(excerpt, highlightInExcerpt)`가 항상 성립한다.
 */
export interface Evidence {
  readonly id: string;
  readonly claimId: string;
  readonly articleId: string;
  readonly articleVersionId: string;
  readonly sourceId: string;
  readonly span: CodePointSpan;
  readonly offsetUnit: "code-point";
  readonly normalizationVersion: number;
  readonly spanText: string;
  readonly spanHash: string;
  readonly excerpt: string;
  readonly excerptSpan: CodePointSpan;
  readonly highlightInExcerpt: CodePointSpan;
  readonly sourceUrl: string;
  readonly verifiedAt: Date;
  /** `양립 불가` 쌍에서 이 근거가 무엇을 다르게 말했는지(한국어 한 문장). 상충 주장의 근거에만 있다(#22 Ruling 22-6). */
  readonly differsIn?: string;
}
