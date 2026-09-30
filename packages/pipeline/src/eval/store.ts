import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { DraftFile, DraftSide, SpendEntry } from "./draft.ts";
import type { LocalPacket } from "./packet.ts";
import type { PairDraftFile } from "./pairs.ts";

/**
 * `EVAL_DATA_DIR`(저장소 밖 로컬 디렉터리, 필수)의 파일. 기사 본문·제목·설명·주장 문장은 여기에만 둔다.
 * - `packets/<packetId>.json`, `drafts/<packetId>.<A|B>.json`·`drafts/pairs.<A|B>.json`, `spend.json`(호출별 지출),
 *   `review.json`·`disagreements.json`(대조), `adjudication.json`(판정 진행).
 */
export function evalDataDir(env: Readonly<Record<string, string | undefined>>): string {
  const dir = env.EVAL_DATA_DIR;
  if (dir === undefined || dir === "" || !isAbsolute(dir)) {
    throw new Error(
      "EVAL_DATA_DIR(저장소 밖의 절대경로)이 설정되지 않았다. .env.example을 참고한다.",
    );
  }
  const repoRoot = resolve(import.meta.dirname, "../../../..");
  if (resolve(dir).startsWith(`${repoRoot}/`) || resolve(dir) === repoRoot) {
    throw new Error("EVAL_DATA_DIR은 저장소 밖이어야 한다(기사 본문을 커밋하지 않는다).");
  }
  return dir;
}

/** 저장소에 커밋하는 산출물 디렉터리 `packages/pipeline/eval/`. */
export const REPO_EVAL_DIR = resolve(import.meta.dirname, "../../eval");

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** 임시 파일에 쓴 뒤 이름을 바꿔, 중단돼도 반쯤 쓴 파일이 남지 않게 한다. */
export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

export function createEvalStore(dir: string) {
  const packetPath = (id: string) => join(dir, "packets", `${id}.json`);
  const draftPath = (id: string, side: DraftSide) => join(dir, "drafts", `${id}.${side}.json`);
  const spendPath = join(dir, "spend.json");
  return {
    dir,
    writePacket: (packet: LocalPacket) => writeJson(packetPath(packet.packetId), packet),
    readPackets(): LocalPacket[] {
      const packetsDir = join(dir, "packets");
      if (!existsSync(packetsDir)) return [];
      return readdirSync(packetsDir)
        .filter((name) => name.endsWith(".json"))
        .sort()
        .map((name) => readJson<LocalPacket>(join(packetsDir, name)));
    },
    hasDraft: (id: string, side: DraftSide) => existsSync(draftPath(id, side)),
    readDraft: (id: string, side: DraftSide): DraftFile | undefined =>
      existsSync(draftPath(id, side)) ? readJson<DraftFile>(draftPath(id, side)) : undefined,
    writeDraft: (file: DraftFile) => writeJson(draftPath(file.packetId, file.side), file),
    readPairDraft: (side: DraftSide): PairDraftFile | undefined =>
      existsSync(join(dir, "drafts", `pairs.${side}.json`))
        ? readJson<PairDraftFile>(join(dir, "drafts", `pairs.${side}.json`))
        : undefined,
    writePairDraft: (file: PairDraftFile) =>
      writeJson(join(dir, "drafts", `pairs.${file.side}.json`), file),
    readSpend: (): SpendEntry[] => (existsSync(spendPath) ? readJson<SpendEntry[]>(spendPath) : []),
    appendSpend(entry: SpendEntry) {
      const entries = existsSync(spendPath) ? readJson<SpendEntry[]>(spendPath) : [];
      writeJson(spendPath, [...entries, entry]);
    },
    path: (name: string) => join(dir, name),
  };
}
