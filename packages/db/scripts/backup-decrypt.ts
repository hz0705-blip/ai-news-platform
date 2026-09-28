import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { decryptBackupFile, parseBackupKey, sha256File } from "./backup-crypto.ts";

/**
 * NPBK1 파일을 복호화한다(이슈 #18, 복구 절차의 첫 단계). 실행: pnpm --filter @newsplatform/db backup:decrypt -- --in <file>.enc --out <file>
 * 옆에 <file>.enc.sha256이 있으면 복호화 전에 대조한다(불일치는 종료 1). 없으면 checksum: skipped.
 * 파일은 스트림으로 처리하고, 평문은 태그 검증이 끝난 뒤에만 --out 경로에 놓인다(이슈 #31).
 */
const USAGE = "usage: backup-decrypt.ts --in <file.enc> --out <plain-file>";

interface DecryptSummary {
  readonly plainFile: string;
  readonly plainBytes: number;
  readonly checksum: "verified" | "skipped";
}

try {
  const { values } = parseArgs({ options: { in: { type: "string" }, out: { type: "string" } } });
  const input = values.in;
  const output = values.out;
  if (input === undefined || output === undefined) {
    throw new Error(USAGE);
  }
  const key = parseBackupKey(process.env);
  let checksum: DecryptSummary["checksum"] = "skipped";
  const checksumPath = `${input}.sha256`;
  if (existsSync(checksumPath)) {
    const expected = readFileSync(checksumPath, "utf8").trim().split(/\s+/)[0];
    const actual = await sha256File(input);
    if (expected !== actual) {
      throw new Error("체크섬 불일치: .sha256의 값과 파일의 SHA-256이 다르다");
    }
    checksum = "verified";
  }
  const { plainBytes } = await decryptBackupFile(input, output, key);
  const summary: DecryptSummary = { plainFile: output, plainBytes, checksum };
  console.log(JSON.stringify(summary));
} catch (error) {
  console.error(JSON.stringify({ script: "backup-decrypt", error: String(error) }));
  process.exitCode = 1;
}
