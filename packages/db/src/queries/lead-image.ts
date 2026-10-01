import { type AnyColumn, type SQL, sql } from "drizzle-orm";

/** 대표 이미지(`CONTEXT.md`): 발행사 주소를 그대로 핫링크하는 이미지 URL, 크레딧 출처명, 그 기사 원문 링크. */
export interface LeadImage {
  readonly url: string;
  readonly sourceName: string;
  readonly articleUrl: string;
}

/**
 * 대표 이미지를 고르는 상관 서브쿼리. `articleIds`(개정판의 출처 집합 `source_article_ids` 열)에 든 기사 중 이미지 URL이
 * 있는 기사를 발행 시각(링크만 기사는 관측 시각의 복사본)·기사 식별자 순으로 첫 기사의 것을 고른다. 없으면 null.
 */
export function leadImageSql(articleIds: AnyColumn): SQL<LeadImage | null> {
  // 단일 테이블 select에서 Drizzle은 열 이름에 테이블을 붙이지 않으므로 서브쿼리 안은 별칭으로 직접 쓴다.
  return sql<LeadImage | null>`(
    select json_build_object('url', lead_a.image_url, 'sourceName', lead_s.name, 'articleUrl', lead_a.url)
    from articles lead_a
    join sources lead_s on lead_s.id = lead_a.source_id
    where lead_a.id = any(${articleIds}) and lead_a.image_url is not null
    order by lead_a.published_at, lead_a.id
    limit 1
  )`;
}
