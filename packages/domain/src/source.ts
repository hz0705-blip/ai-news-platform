import type { RightsTier } from "./rights.ts";

/**
 * 출처(Source): 기사를 발행한 매체 (CONTEXT.md "출처").
 * 표시하는 메타데이터는 지역·소유 형태·언어까지이며 정치 편향은 담지 않는다
 * (docs/spec/v1.md "표시하지 않는 것", ADR-0004). 이 셋의 값 목록과 유지 방식은
 * 리서치 대기 #9라 열거형으로 좁히지 않고 문자열로 둔다.
 * `isFictional`은 데모 사건의 가상 출처 표기용이다(#21 Ruling 9).
 * `wireId`는 이 출처가 전재한 통신 기사 식별자다. 같은 `wireId`의 출처들은 보도 원점 하나로 센다(#22 Ruling 22-13).
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
}
