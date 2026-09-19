import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { encryptBackup, parseBackupKey, SHA256_LINE, sha256Hex } from "./backup-crypto.ts";

/**
 * 평문 덤프를 NPBK1로 암호화한다(이슈 #18). 실행: pnpm --filter @newsplatform/db backup:encrypt -- --in <file> --out-dir <dir>
 * 산출: <dir>/<name>.enc, <dir>/<name>.enc.sha256(sha256sum -c 형식), <dir>/manifest.json. stdout JSON 한 줄.
 * 로그에 키·연결 정보는 없다. 실패는 stderr JSON + 종료 1.
 */
const USAGE = "usage: backup-encrypt.ts --in <plain-file> --out-dir <dir>";

interface EncryptSummary {
  readonly format: "NPBK1";
  readonly createdAt: string;
  readonly encryptedFile: string;
  readonly sha256: string;
  readonly plainBytes: number;
  readonly encryptedBytes: number;
}

try {
  const { values } = parseArgs({
    options: { in: { type: "string" }, "out-dir": { type: "string" } },
  });
  const input = values.in;
  const outDir = values["out-dir"];
  if (input === undefined || outDir === undefined) {
    throw new Error(USAGE);
  }
  const key = parseBackupKey(process.env);
  const plain = readFileSync(input);
  const sealed = encryptBackup(plain, key);
  const encryptedFile = `${basename(input)}.enc`;
  const sha256 = sha256Hex(sealed);
  const summary: EncryptSummary = {
    format: "NPBK1",
    createdAt: new Date().toISOString(),
    encryptedFile,
    sha256,
    plainBytes: plain.length,
    encryptedBytes: sealed.length,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, encryptedFile), sealed);
  writeFileSync(join(outDir, `${encryptedFile}.sha256`), SHA256_LINE(sha256, encryptedFile));
  writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary));
} catch (error) {
  console.error(JSON.stringify({ script: "backup-encrypt", error: String(error) }));
  process.exitCode = 1;
}
