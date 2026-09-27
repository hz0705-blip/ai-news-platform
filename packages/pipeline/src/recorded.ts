import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ModelClient } from "./types.ts";

/** 기록된 응답을 가진 단계 셋. 파일 이름이 곧 단계 이름이다(`recorded/<stage>.json`). */
export const RECORDED_STAGES = [
  "evidence-extract",
  "claim-generate",
  "gate",
  "contradiction-label",
] as const;

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
  /** 개정판에 기록할 모델 식별자. 실제 모델 응답을 기록한 픽스처는 그 모델 식별자를 준다. 기본 `recorded`. */
  readonly modelId?: string;
}

function recordedPath(slug: string, stage: string): string {
  return fileURLToPath(new URL(`../fixtures/${slug}/recorded/${stage}.json`, import.meta.url));
}

/** `fixtures/<slug>/recorded/<stage>.json`을 읽는다. 파일이 없으면 빈 표다. */
function readRecorded(slug: string, stage: string): RecordedTable {
  const path = recordedPath(slug, stage);
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

  const usage = { tokens: 0, spend: 0 };
  return {
    modelId: options.modelId ?? "recorded",
    async complete({ stage, key }) {
      const overridden = lookup(options.override?.[stage], key);
      if (overridden.found) return { output: overridden.value, usage };
      const recorded = lookup(tables.get(stage), key);
      if (recorded.found) return { output: recorded.value, usage };
      throw new RecordedResponseMissingError(stage, key);
    },
  };
}

/**
 * 기록 모드(#54): 안쪽 클라이언트(실제 모델)의 응답을 기록 형식 그대로
 * `fixtures/<slug>/recorded/<stage>.json`에 쓴다. 빈 표에서 시작해 호출마다 파일을 다시 쓰므로
 * 이전 기록은 덮어쓴다. 기록에는 출력만 들어가고 요청 헤더·키는 들어가지 않는다.
 */
export function createRecordingModelClient(inner: ModelClient, slug: string): ModelClient {
  const tables = new Map<string, Record<string, unknown>>();
  return {
    modelId: inner.modelId,
    async complete(request) {
      const response = await inner.complete(request);
      const table = tables.get(request.stage) ?? {};
      table[request.key] = response.output;
      tables.set(request.stage, table);
      const path = recordedPath(slug, request.stage);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(table, null, 2)}\n`);
      return response;
    },
  };
}
