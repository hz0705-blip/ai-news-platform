import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BACKUP_FORMAT_MAGIC,
  BACKUP_KEY_VARIABLE,
  BackupFormatError,
  BackupKeyError,
  decryptBackup,
  decryptBackupFile,
  encryptBackup,
  encryptBackupFile,
  parseBackupKey,
  SHA256_LINE,
  sha256File,
  sha256Hex,
} from "./backup-crypto.ts";

const KEY_HEX = `${"0".repeat(63)}1`;
const KEY = Buffer.from(KEY_HEX, "hex");

describe("parseBackupKey", () => {
  it("64자 hex를 32바이트 Buffer로 돌려준다", () => {
    const key = parseBackupKey({ [BACKUP_KEY_VARIABLE]: KEY_HEX });
    expect(key.length).toBe(32);
    expect(key.equals(KEY)).toBe(true);
  });

  it("대문자 hex도 받는다", () => {
    expect(parseBackupKey({ [BACKUP_KEY_VARIABLE]: "A".repeat(64) }).length).toBe(32);
  });

  it("미설정·빈 문자열이면 변수 이름을 담은 BackupKeyError를 던진다", () => {
    expect(() => parseBackupKey({})).toThrow(BackupKeyError);
    expect(() => parseBackupKey({ [BACKUP_KEY_VARIABLE]: "" })).toThrow(/BACKUP_ENCRYPTION_KEY/);
  });

  it("길이가 64가 아니거나 hex가 아니면 BackupKeyError를 던진다", () => {
    expect(() => parseBackupKey({ [BACKUP_KEY_VARIABLE]: "abcd" })).toThrow(BackupKeyError);
    expect(() => parseBackupKey({ [BACKUP_KEY_VARIABLE]: "z".repeat(64) })).toThrow(BackupKeyError);
  });

  it("오류 메시지에 키 값을 넣지 않는다", () => {
    try {
      parseBackupKey({ [BACKUP_KEY_VARIABLE]: "deadbeef" });
    } catch (error) {
      expect((error as Error).message).not.toContain("deadbeef");
    }
  });
});

describe("encryptBackup / decryptBackup", () => {
  it("암호화 후 복호화하면 원문이 돌아온다", () => {
    const plain = randomBytes(1000);
    expect(decryptBackup(encryptBackup(plain, KEY), KEY).equals(plain)).toBe(true);
  });

  it("빈 입력도 왕복한다", () => {
    expect(decryptBackup(encryptBackup(Buffer.alloc(0), KEY), KEY).length).toBe(0);
  });

  it("출력은 magic(5)+iv(12)+본문+tag(16) 길이이고 magic으로 시작한다", () => {
    const sealed = encryptBackup(Buffer.alloc(100), KEY);
    expect(sealed.length).toBe(5 + 12 + 100 + 16);
    expect(sealed.subarray(0, 5).equals(BACKUP_FORMAT_MAGIC)).toBe(true);
  });

  it("같은 원문을 두 번 암호화하면 iv가 달라 출력이 다르다", () => {
    const plain = Buffer.from("same");
    expect(encryptBackup(plain, KEY).equals(encryptBackup(plain, KEY))).toBe(false);
  });

  it("다른 키로 복호화하면 BackupFormatError", () => {
    const sealed = encryptBackup(Buffer.from("secret"), KEY);
    expect(() => decryptBackup(sealed, randomBytes(32))).toThrow(BackupFormatError);
  });

  it("본문 1바이트가 바뀌면 BackupFormatError(인증 실패)", () => {
    const sealed = Buffer.from(encryptBackup(Buffer.from("secret"), KEY));
    const index = 5 + 12;
    sealed[index] = (sealed[index] ?? 0) ^ 0xff;
    expect(() => decryptBackup(sealed, KEY)).toThrow(BackupFormatError);
  });

  it("magic이 다르면 BackupFormatError", () => {
    const sealed = Buffer.from(encryptBackup(Buffer.from("x"), KEY));
    sealed[0] = 0x00;
    expect(() => decryptBackup(sealed, KEY)).toThrow(BackupFormatError);
  });

  it("헤더+tag보다 짧으면 BackupFormatError", () => {
    expect(() => decryptBackup(Buffer.alloc(10), KEY)).toThrow(BackupFormatError);
  });

  it("키 길이가 32가 아니면 암호화·복호화 모두 BackupKeyError", () => {
    expect(() => encryptBackup(Buffer.from("x"), Buffer.alloc(16))).toThrow(BackupKeyError);
    expect(() => decryptBackup(Buffer.alloc(40), Buffer.alloc(16))).toThrow(BackupKeyError);
  });
});

describe("sha256Hex / SHA256_LINE", () => {
  it("빈 입력의 SHA-256은 알려진 값이다", () => {
    expect(sha256Hex(Buffer.alloc(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("sha256sum -c 형식(hex, 공백 둘, 파일명, 개행)을 만든다", () => {
    expect(SHA256_LINE("ab".repeat(32), "a.enc")).toBe(`${"ab".repeat(32)}  a.enc\n`);
  });
});

describe("encryptBackupFile / decryptBackupFile (스트리밍)", () => {
  function tempDir(): string {
    return mkdtempSync(join(tmpdir(), "backup-stream-"));
  }

  async function roundTrip(plain: Buffer): Promise<{ dir: string; sealedPath: string }> {
    const dir = tempDir();
    const plainPath = join(dir, "plain");
    const sealedPath = join(dir, "plain.enc");
    writeFileSync(plainPath, plain);
    const result = await encryptBackupFile(plainPath, sealedPath, KEY);
    const sealed = readFileSync(sealedPath);
    expect(result.plainBytes).toBe(plain.length);
    expect(result.encryptedBytes).toBe(sealed.length);
    expect(sealed.length).toBe(5 + 12 + plain.length + 16);
    expect(result.sha256).toBe(sha256Hex(sealed));
    const restoredPath = join(dir, "restored");
    const restored = await decryptBackupFile(sealedPath, restoredPath, KEY);
    expect(restored.plainBytes).toBe(plain.length);
    expect(readFileSync(restoredPath).equals(plain)).toBe(true);
    return { dir, sealedPath };
  }

  it("여러 청크(highWaterMark 64 KiB보다 큰 5 MiB) 입력을 왕복 복원한다", async () => {
    await roundTrip(randomBytes(5 * 1024 * 1024 + 7));
  });

  it("빈 파일도 왕복한다", async () => {
    await roundTrip(Buffer.alloc(0));
  });

  it("스트리밍 암호화 산출물을 decryptBackup이 복원한다", async () => {
    const plain = randomBytes(200 * 1024);
    const { sealedPath } = await roundTrip(plain);
    expect(decryptBackup(readFileSync(sealedPath), KEY).equals(plain)).toBe(true);
  });

  it("encryptBackup 산출물을 스트리밍 복호화가 복원한다", async () => {
    const dir = tempDir();
    const plain = randomBytes(200 * 1024);
    const sealedPath = join(dir, "buf.enc");
    writeFileSync(sealedPath, encryptBackup(plain, KEY));
    const out = join(dir, "out");
    await decryptBackupFile(sealedPath, out, KEY);
    expect(readFileSync(out).equals(plain)).toBe(true);
  });

  async function expectFormatError(sealed: Buffer): Promise<void> {
    const dir = tempDir();
    const sealedPath = join(dir, "bad.enc");
    writeFileSync(sealedPath, sealed);
    const out = join(dir, "out");
    await expect(decryptBackupFile(sealedPath, out, KEY)).rejects.toThrow(BackupFormatError);
    expect(existsSync(out)).toBe(false);
    expect(readdirSync(dir)).toEqual(["bad.enc"]);
  }

  it("태그가 변조되면 실패하고 출력·임시 파일이 남지 않는다", async () => {
    const sealed = Buffer.from(encryptBackup(randomBytes(100 * 1024), KEY));
    const index = sealed.length - 1;
    sealed[index] = (sealed[index] ?? 0) ^ 0xff;
    await expectFormatError(sealed);
  });

  it("본문 1바이트 변조 시 실패한다", async () => {
    const sealed = Buffer.from(encryptBackup(randomBytes(100 * 1024), KEY));
    const index = 5 + 12 + 1000;
    sealed[index] = (sealed[index] ?? 0) ^ 0xff;
    await expectFormatError(sealed);
  });

  it("33바이트 미만 파일은 형식 오류", async () => {
    await expectFormatError(encryptBackup(Buffer.alloc(0), KEY).subarray(0, 32));
    await expectFormatError(Buffer.alloc(0));
  });

  it("magic 불일치는 형식 오류", async () => {
    const sealed = Buffer.from(encryptBackup(Buffer.from("x"), KEY));
    sealed[0] = 0x00;
    await expectFormatError(sealed);
  });

  it("다른 키로 복호화하면 형식 오류", async () => {
    const dir = tempDir();
    const sealedPath = join(dir, "k.enc");
    writeFileSync(sealedPath, encryptBackup(Buffer.from("secret"), KEY));
    await expect(decryptBackupFile(sealedPath, join(dir, "out"), randomBytes(32))).rejects.toThrow(
      BackupFormatError,
    );
  });

  it("sha256File은 파일 전체의 SHA-256을 돌려준다", async () => {
    const dir = tempDir();
    const data = randomBytes(300 * 1024);
    const path = join(dir, "data");
    writeFileSync(path, data);
    expect(await sha256File(path)).toBe(sha256Hex(data));
  });
});
