import { sha256Hex } from "./hash.ts";
import { NORMALIZATION_VERSION, normalizeBody } from "./text.ts";

/**
 * 기사 버전(Article Version): 기사 본문을 특정 시점에 정규화한 스냅샷.
 * 개정판을 넘어 유지되는 불변 값이며, `readonly` 타입으로만 불변을 표현한다
 * (#21 브리프: `Object.freeze`는 쓰지 않는다).
 */
export interface ArticleVersion {
  readonly id: string;
  readonly articleId: string;
  readonly body: string;
  readonly normalizationVersion: number;
  readonly bodyHash: string;
  readonly capturedAt: Date;
}

/** 원문 본문을 정규화하고 해시를 붙여 기사 버전을 만든다. */
export function createArticleVersion(input: {
  id: string;
  articleId: string;
  rawBody: string;
  capturedAt: Date;
}): ArticleVersion {
  const body = normalizeBody(input.rawBody);

  return {
    id: input.id,
    articleId: input.articleId,
    body,
    normalizationVersion: NORMALIZATION_VERSION,
    bodyHash: sha256Hex(body),
    capturedAt: input.capturedAt,
  };
}
