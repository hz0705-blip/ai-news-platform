import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "./backup-crypto.ts";

const ENCRYPT = fileURLToPath(new URL("./backup-encrypt.ts", import.meta.url));
const DECRYPT = fileURLToPath(new URL("./backup-decrypt.ts", import.meta.url));
const KEY_HEX = "ab".repeat(32);

function run(script: string, args: string[], env: Record<string, string>) {
  const result = spawnSync(process.execPath, [script, ...args], {
    env: { PATH: process.env.PATH ?? "", ...env },
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "backup-cli-"));
  const plain = join(dir, "newsplatform.dump");
  writeFileSync(plain, Buffer.from("PGDMP fake custom-format dump 0123456789"));
  return { dir, plain };
}

describe("backup-encrypt", () => {
  it(".enc·.sha256·manifest.json을 쓰고 JSON 한 줄을 출력한다", () => {
    const { dir, plain } = setup();
    const out = join(dir, "out");
    const r = run(ENCRYPT, ["--in", plain, "--out-dir", out], { BACKUP_ENCRYPTION_KEY: KEY_HEX });
    expect(r.status, r.stderr).toBe(0);
    const summary = JSON.parse(r.stdout.trim());
    const enc = readFileSync(join(out, "newsplatform.dump.enc"));
    expect(summary.format).toBe("NPBK1");
    expect(summary.encryptedFile).toBe("newsplatform.dump.enc");
    expect(summary.plainBytes).toBe(40);
    expect(summary.encryptedBytes).toBe(enc.length);
    expect(summary.sha256).toBe(sha256Hex(enc));
    expect(readFileSync(join(out, "newsplatform.dump.enc.sha256"), "utf8")).toBe(
      `${sha256Hex(enc)}  newsplatform.dump.enc\n`,
    );
    const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
    expect(manifest.sha256).toBe(summary.sha256);
    expect(typeof manifest.createdAt).toBe("string");
  });

  it("키가 없으면 종료 코드 1과 stderr JSON, 출력 파일 없음", () => {
    const { dir, plain } = setup();
    const r = run(ENCRYPT, ["--in", plain, "--out-dir", join(dir, "out")], {});
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stderr.trim()).error).toMatch(/BACKUP_ENCRYPTION_KEY/);
    expect(r.stderr).not.toContain(KEY_HEX);
  });

  it("--in 파일이 없으면 종료 코드 1", () => {
    const { dir } = setup();
    const r = run(ENCRYPT, ["--in", join(dir, "nope"), "--out-dir", dir], {
      BACKUP_ENCRYPTION_KEY: KEY_HEX,
    });
    expect(r.status).toBe(1);
  });

  it("인자가 빠지면 종료 코드 1과 사용법", () => {
    const r = run(ENCRYPT, [], { BACKUP_ENCRYPTION_KEY: KEY_HEX });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("--in");
  });
});

describe("backup-decrypt", () => {
  it("암호화 산출물을 원문으로 되돌리고 체크섬을 검증한다", () => {
    const { dir, plain } = setup();
    const out = join(dir, "out");
    run(ENCRYPT, ["--in", plain, "--out-dir", out], { BACKUP_ENCRYPTION_KEY: KEY_HEX });
    const restored = join(dir, "restored.dump");
    const r = run(DECRYPT, ["--in", join(out, "newsplatform.dump.enc"), "--out", restored], {
      BACKUP_ENCRYPTION_KEY: KEY_HEX,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout.trim())).toEqual({
      plainFile: restored,
      plainBytes: 40,
      checksum: "verified",
    });
    expect(readFileSync(restored).equals(readFileSync(plain))).toBe(true);
  });

  it(".sha256이 없으면 checksum: skipped로 복호화한다", () => {
    const { dir, plain } = setup();
    const out = join(dir, "out");
    run(ENCRYPT, ["--in", plain, "--out-dir", out], { BACKUP_ENCRYPTION_KEY: KEY_HEX });
    const moved = join(dir, "moved.enc");
    writeFileSync(moved, readFileSync(join(out, "newsplatform.dump.enc")));
    const r = run(DECRYPT, ["--in", moved, "--out", join(dir, "r.dump")], {
      BACKUP_ENCRYPTION_KEY: KEY_HEX,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout.trim()).checksum).toBe("skipped");
  });

  it("체크섬이 다르면 복호화 전에 종료 코드 1", () => {
    const { dir, plain } = setup();
    const out = join(dir, "out");
    run(ENCRYPT, ["--in", plain, "--out-dir", out], { BACKUP_ENCRYPTION_KEY: KEY_HEX });
    writeFileSync(
      join(out, "newsplatform.dump.enc.sha256"),
      `${"0".repeat(64)}  newsplatform.dump.enc\n`,
    );
    const r = run(DECRYPT, ["--in", join(out, "newsplatform.dump.enc"), "--out", join(dir, "r")], {
      BACKUP_ENCRYPTION_KEY: KEY_HEX,
    });
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stderr.trim()).error).toMatch(/체크섬/);
  });

  it("다른 키면 종료 코드 1", () => {
    const { dir, plain } = setup();
    const out = join(dir, "out");
    run(ENCRYPT, ["--in", plain, "--out-dir", out], { BACKUP_ENCRYPTION_KEY: KEY_HEX });
    const r = run(DECRYPT, ["--in", join(out, "newsplatform.dump.enc"), "--out", join(dir, "r")], {
      BACKUP_ENCRYPTION_KEY: "cd".repeat(32),
    });
    expect(r.status).toBe(1);
  });
});
