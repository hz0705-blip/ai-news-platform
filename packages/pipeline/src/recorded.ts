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

/** `fixtures/<slug>/recorded/<stage>.json`을 읽는다. 파일이 없으면 빈 표다. */
function readRecorded(slug: string, stage: string): RecordedTable {
  const path = fileURLToPath(
    new URL(`../fixtures/${slug}/recorded/${stage}.json`, import.meta.url),
  );
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
 * slug 여러 개를 받으면 단계별로 표를 합친다. 같은 단계에 같은 멱등키가 두 번 나오면 던진다.
 */
export function createRecordedModelClient(
  slugs: string | readonly string[],
  options: RecordedModelClientOptions = {},
): ModelClient {
  const list = typeof slugs === "string" ? [slugs] : slugs;
  const tables = new Map<string, RecordedTable>();
  for (const stage of RECORDED_STAGES) {
    const merged: Record<string, unknown> = {};
    for (const slug of list) {
      for (const [key, value] of Object.entries(readRecorded(slug, stage))) {
        if (Object.hasOwn(merged, key)) {
          throw new Error(`기록된 응답 키 충돌: ${stage} [${key}] (${slug})`);
        }
        merged[key] = value;
      }
    }
    tables.set(stage, merged);
  }

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
