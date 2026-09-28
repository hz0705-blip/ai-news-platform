import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * 기록된 GDELT 응답 파일 하나(`fixtures/gdelt/<name>.json`). 실제 응답에서 만든다(`scripts/record-gdelt.ts`).
 * 조회 키는 `request.query`(요청 URL의 `query` 파라미터)다. `body.articles`는 앞 `KEEP`건만 남긴다.
 */
export interface RecordedGdeltResponse {
  readonly request: {
    readonly query: string;
    readonly startdatetime: string;
    readonly enddatetime: string;
  };
  readonly status: number;
  readonly body: unknown;
}

export function recordedGdeltDir(): string {
  return fileURLToPath(new URL("../../fixtures/gdelt/", import.meta.url));
}

export function recordedGdeltPath(name: string): string {
  return `${recordedGdeltDir()}${name}.json`;
}

export function readRecordedGdelt(name: string): RecordedGdeltResponse | undefined {
  const path = recordedGdeltPath(name);
  if (!existsSync(path)) return undefined;
  const recorded: RecordedGdeltResponse = JSON.parse(readFileSync(path, "utf8"));
  return recorded;
}

/** 기록된 응답에 요청한 쿼리가 없다. 네트워크는 타지 않는다. */
export class RecordedGdeltMissingError extends Error {
  override readonly name = "RecordedGdeltMissingError";

  constructor(query: string) {
    super(`기록된 GDELT 응답 없음: ${query}`);
  }
}

/** 요청 URL의 `query`로 기록된 응답을 돌려주는 `fetch`. 테스트 전용이며 네트워크를 타지 않는다. */
export function createRecordedGdeltFetch(
  override: Partial<Record<string, RecordedGdeltResponse>> = {},
): typeof fetch {
  const byQuery = new Map<string, RecordedGdeltResponse>();
  const dir = recordedGdeltDir();
  if (existsSync(dir)) {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      const recorded = readRecordedGdelt(file.slice(0, -".json".length));
      if (recorded !== undefined) byQuery.set(recorded.request.query, recorded);
    }
  }
  for (const recorded of Object.values(override)) {
    if (recorded !== undefined) byQuery.set(recorded.request.query, recorded);
  }
  return async (input) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const query = url.searchParams.get("query") ?? "";
    const recorded = byQuery.get(query);
    if (recorded === undefined) throw new RecordedGdeltMissingError(query);
    return new Response(JSON.stringify(recorded.body), {
      status: recorded.status,
      headers: { "content-type": "application/json" },
    });
  };
}
