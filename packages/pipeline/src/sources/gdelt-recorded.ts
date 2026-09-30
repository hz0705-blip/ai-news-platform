import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";
import { GDELT_MASTERFILELIST_URL } from "./gdelt.ts";

/**
 * 기록된 GDELT GKG 조각(`fixtures/gdelt/<name>/`). 실제 파일에서 만든다(`scripts/record-gdelt.ts`).
 * 행의 도메인·URL·제목은 직접 쓴 가상 값으로 바꿨다(#143).
 * - `files.txt`: 실제 `masterfilelist.txt`의 그 구간 줄(export·mentions·gkg, 실제 크기·MD5).
 * - `<YYYYMMDDHHMMSS>.gkg.csv`: 그 파일에서 필요한 행만(27열 그대로, 쓰지 않는 열은 비움).
 */
export function recordedGdeltDir(name: string): string {
  return fileURLToPath(new URL(`../../fixtures/gdelt/${name}/`, import.meta.url));
}

export function readRecordedGdeltFileList(name: string): string {
  return readFileSync(`${recordedGdeltDir(name)}files.txt`, "utf8");
}

/** 기록된 GKG 행(파일 시각 → 줄). */
export function readRecordedGkgRows(name: string): Map<string, string[]> {
  const dir = recordedGdeltDir(name);
  const rows = new Map<string, string[]>();
  for (const file of readdirSync(dir).sort()) {
    const m = /^(\d{14})\.gkg\.csv$/.exec(file);
    if (m?.[1] === undefined) continue;
    rows.set(
      m[1],
      readFileSync(`${dir}${file}`, "utf8")
        .split("\n")
        .filter((l) => l !== ""),
    );
  }
  return rows;
}

/** 항목 하나짜리 zip(로컬 헤더 + deflate 데이터 + 중앙 디렉터리). 기록된 행을 실제 파일과 같은 형식으로 내보낸다. */
export function zipSingleEntry(entryName: string, data: Buffer): Buffer {
  const name = Buffer.from(entryName);
  const compressed = deflateRawSync(data);
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + compressed.length, 16);
  return Buffer.concat([local, name, compressed, central, name, end]);
}

/**
 * 기록된 조각을 서빙하는 `fetch`. 테스트 전용이며 네트워크를 타지 않는다.
 * 파일 목록(Range 요청)은 앞에 잘린 줄 하나를 붙인 `files.txt`이고, 그 안의 GKG 줄은 기록된 행으로 만든 zip의 크기·MD5로
 * 바꾼다(행이 기록되지 않은 파일은 빈 zip). `wrongMd5`에 든 파일 시각은 목록의 MD5를 틀리게 둔다.
 */
export function createRecordedGdeltFetch(
  name = "hormuz-proposal",
  options: { readonly wrongMd5?: readonly string[] } = {},
): typeof fetch {
  const dir = recordedGdeltDir(name);
  if (!existsSync(dir)) throw new Error(`기록된 GDELT 조각 없음: ${name}`);
  const rows = readRecordedGkgRows(name);
  const zips = new Map<string, Buffer>();
  const list = readRecordedGdeltFileList(name)
    .split("\n")
    .map((line) => {
      const [, , url] = line.split(" ");
      const ts = /\/(\d{14})\.gkg\.csv\.zip$/.exec(url ?? "")?.[1];
      if (url === undefined || ts === undefined) return line;
      const lines = rows.get(ts) ?? [];
      const zip = zipSingleEntry(`${ts}.gkg.csv`, Buffer.from(lines.map((l) => `${l}\n`).join("")));
      zips.set(ts, zip);
      const md5 = options.wrongMd5?.includes(ts)
        ? "0".repeat(32)
        : createHash("md5").update(zip).digest("hex");
      return `${zip.length} ${md5} ${url}`;
    })
    .join("\n");
  return async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === GDELT_MASTERFILELIST_URL) {
      return new Response(`0000 cut-line\n${list}`, { status: 206 });
    }
    const ts = /\/(\d{14})\.gkg\.csv\.zip$/.exec(url)?.[1];
    const zip = ts === undefined ? undefined : zips.get(ts);
    if (zip === undefined) return new Response("not found", { status: 404 });
    return new Response(new Uint8Array(zip), { status: 200 });
  };
}
