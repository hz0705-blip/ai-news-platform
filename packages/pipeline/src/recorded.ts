import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ModelClient } from "./types.ts";

/** 기록된 응답을 가진 단계 셋. 파일 이름이 곧 단계 이름이다(`recorded/<stage>.json`). */
const RECORDED_STAGES = ["evidence-extract", "claim-generate", "contradiction-label"] as const;

/** 기록된 응답에 요청한 단계·멱등키가 없다. 배치는 그 사건을 실패로 리포트한다. */
export class RecordedResponseMissingError extends Error {
  override readonly name = "RecordedResponseMissingError";

  constructor(stage: string, key: string) {
    super(`기록된 응답 없음: ${stage} [${key}]`);
  }
}

type RecordedTable = Readonly<Record<string, unknown>>;

export interface RecordedModelClientOptions {
  /** 테스트 전용: 단계·멱등키별로 기록된 응답을 덮어쓴다. */
  readonly override?: Readonly<Record<string, RecordedTable>>;
}

function readTable(path: string): RecordedTable {
  if (!existsSync(path)) return {};
  const table: RecordedTable = JSON.parse(readFileSync(path, "utf8"));
  return table;
}

function lookup(table: RecordedTable | undefined, key: string): { found: boolean; value: unknown } {
  if (table === undefined || !Object.hasOwn(table, key)) return { found: false, value: undefined };
  return { found: true, value: table[key] };
}

/**
 * 데모 사건 픽스처의 기록된 응답으로 답하는 모델 클라이언트(#21 Ruling 4).
 * `fixtures/<slug>/recorded/<stage>.json`을 만들 때 한 번 읽고, 네트워크는 타지 않는다.
 */
export function createRecordedModelClient(
  slug: string,
  options: RecordedModelClientOptions = {},
): ModelClient {
  const dir = fileURLToPath(new URL(`../fixtures/${slug}/recorded/`, import.meta.url));
  const tables = new Map<string, RecordedTable>(
    RECORDED_STAGES.map((stage) => [stage, readTable(`${dir}${stage}.json`)]),
  );

  return {
    async complete(stage, key) {
      const overridden = lookup(options.override?.[stage], key);
      if (overridden.found) return overridden.value;
      const recorded = lookup(tables.get(stage), key);
      if (recorded.found) return recorded.value;
      throw new RecordedResponseMissingError(stage, key);
    },
  };
}
