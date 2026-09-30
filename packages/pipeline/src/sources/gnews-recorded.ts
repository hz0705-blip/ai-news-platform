import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type GnewsTopicKey, topicKeyOf } from "./gnews.ts";

/**
 * 기록된 GNews 응답 파일 하나(`fixtures/gnews/<topicKey>-page<N>.json`). 실제 응답에서 만든 뒤 기사의
 * 제목·설명·본문·URL·매체를 직접 쓴 가상 텍스트로 바꿨다(#143). `request`에 API 키는 없다
 * (`scripts/record-gnews.ts`가 지운다). `body.articles`는 토픽당 몇 건만 남기고
 * `totalArticles`는 실제 값 그대로라 페이지 상한 판단이 실제와 같다.
 */
export interface RecordedGnewsResponse {
  readonly request: { readonly path: string; readonly params: Readonly<Record<string, string>> };
  readonly status: number;
  readonly body: unknown;
}

export function recordedGnewsPath(topicKey: GnewsTopicKey, page: number): string {
  return fileURLToPath(
    new URL(`../../fixtures/gnews/${topicKey}-page${page}.json`, import.meta.url),
  );
}

/** 기록된 응답에 요청한 토픽·페이지가 없다. 네트워크는 타지 않는다. */
export class RecordedGnewsMissingError extends Error {
  override readonly name = "RecordedGnewsMissingError";

  constructor(topicKey: string, page: number) {
    super(`기록된 GNews 응답 없음: ${topicKey} page ${page}`);
  }
}

/** 요청 URL의 토픽·페이지로 기록된 응답을 돌려주는 `fetch`. 테스트 전용이며 네트워크를 타지 않는다. */
export function createRecordedGnewsFetch(
  override: Partial<Record<string, RecordedGnewsResponse>> = {},
): typeof fetch {
  return async (input) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const topicKey = topicKeyOf(url);
    const page = Number(url.searchParams.get("page") ?? "1");
    if (topicKey === undefined) throw new RecordedGnewsMissingError(url.pathname, page);
    const key = `${topicKey}-page${page}`;
    const recorded = override[key] ?? readRecorded(topicKey, page);
    if (recorded === undefined) throw new RecordedGnewsMissingError(topicKey, page);
    return new Response(JSON.stringify(recorded.body), {
      status: recorded.status,
      headers: { "content-type": "application/json" },
    });
  };
}

function readRecorded(topicKey: GnewsTopicKey, page: number): RecordedGnewsResponse | undefined {
  const path = recordedGnewsPath(topicKey, page);
  if (!existsSync(path)) return undefined;
  const recorded: RecordedGnewsResponse = JSON.parse(readFileSync(path, "utf8"));
  return recorded;
}

/** 기록된 재수집 조회 응답(`fixtures/gnews-recheck/<name>.json`, #86). 모양은 `RecordedGnewsResponse`와 같다. */
export function recordedRecheckPath(name: string): string {
  return fileURLToPath(new URL(`../../fixtures/gnews-recheck/${name}.json`, import.meta.url));
}

/** 기록된 재수집 조회 응답 하나를 읽는다. 없으면 던진다. */
export function loadRecordedRecheck(name: string): RecordedGnewsResponse {
  const path = recordedRecheckPath(name);
  if (!existsSync(path)) throw new Error(`기록된 재수집 응답 없음: ${name}`);
  const recorded: RecordedGnewsResponse = JSON.parse(readFileSync(path, "utf8"));
  return recorded;
}

/** 어떤 요청에도 기록된 응답 하나를 돌려주는 `fetch`(재수집 조회 리플레이). 네트워크는 타지 않는다. */
export function createRecordedRecheckFetch(recorded: RecordedGnewsResponse): typeof fetch {
  return async () =>
    new Response(JSON.stringify(recorded.body), {
      status: recorded.status,
      headers: { "content-type": "application/json" },
    });
}
