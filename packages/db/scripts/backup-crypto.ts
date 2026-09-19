import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * 백업 아티팩트 암호화 형식 NPBK1(이슈 #18 Ruling).
 *   magic "NPBK1"(5바이트) ‖ iv(12바이트, 무작위) ‖ AES-256-GCM 본문 ‖ 인증 태그(16바이트)
 * 키는 BACKUP_ENCRYPTION_KEY = 32바이트를 64자 hex로(`openssl rand -hex 32`). GitHub 환경 시크릿에만 둔다.
 * 외부 도구 없이 Node 24 내장 crypto만 쓴다(런너·개발 Mac 어디에도 age가 없고 openssl enc는 인증 암호가 아니다).
 * 복구 절차: `node packages/db/scripts/backup-decrypt.ts --in <file>.enc --out <file>` → `pg_restore`.
 */
export const BACKUP_FORMAT_MAGIC: Buffer = Buffer.from("NPBK1", "ascii");
export const BACKUP_KEY_VARIABLE = "BACKUP_ENCRYPTION_KEY";

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_HEX_PATTERN = /^[0-9a-fA-F]{64}$/;

export class BackupKeyError extends Error {
  readonly variable: string;

  constructor(reason: string) {
    super(`${BACKUP_KEY_VARIABLE} ${reason}. openssl rand -hex 32 로 만든 64자 hex여야 한다.`);
    this.name = "BackupKeyError";
    this.variable = BACKUP_KEY_VARIABLE;
  }
}

export class BackupFormatError extends Error {
  constructor(reason: string) {
    super(`백업 파일 형식 오류: ${reason}`);
    this.name = "BackupFormatError";
  }
}

export function parseBackupKey(env: Readonly<Record<string, string | undefined>>): Buffer {
  const value = env[BACKUP_KEY_VARIABLE];
  if (value === undefined || value === "") {
    throw new BackupKeyError("이(가) 설정되지 않았다");
  }
  if (!KEY_HEX_PATTERN.test(value)) {
    throw new BackupKeyError("형식이 올바르지 않다");
  }
  return Buffer.from(value, "hex");
}

function assertKey(key: Buffer): void {
  if (key.length !== KEY_BYTES) {
    throw new BackupKeyError(`길이가 ${KEY_BYTES}바이트가 아니다`);
  }
}

export function encryptBackup(plain: Buffer, key: Buffer): Buffer {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([BACKUP_FORMAT_MAGIC, iv, body, cipher.getAuthTag()]);
}

export function decryptBackup(sealed: Buffer, key: Buffer): Buffer {
  assertKey(key);
  const headerBytes = BACKUP_FORMAT_MAGIC.length + IV_BYTES;
  if (sealed.length < headerBytes + TAG_BYTES) {
    throw new BackupFormatError("헤더와 인증 태그를 담기에 짧다");
  }
  if (!sealed.subarray(0, BACKUP_FORMAT_MAGIC.length).equals(BACKUP_FORMAT_MAGIC)) {
    throw new BackupFormatError("magic이 NPBK1이 아니다");
  }
  const iv = sealed.subarray(BACKUP_FORMAT_MAGIC.length, headerBytes);
  const tag = sealed.subarray(sealed.length - TAG_BYTES);
  const body = sealed.subarray(headerBytes, sealed.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    throw new BackupFormatError("인증 실패(키가 다르거나 본문이 손상됨)");
  }
}

export function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** `sha256sum -c` 호환 한 줄: hex, 공백 둘, 파일명, 개행. */
export const SHA256_LINE = (hex: string, fileName: string): string => `${hex}  ${fileName}\n`;

/** 한 번에 메모리로 읽어 암호화하는 상한. 초과하면 스트리밍 구현(후속 티켓)이 필요하다. */
export const MAX_PLAIN_BYTES = 1024 * 1024 * 1024; // 1 GiB

export class BackupSizeError extends Error {
  constructor(bytes: number) {
    super(
      `백업 원문이 ${bytes}바이트로 상한 ${MAX_PLAIN_BYTES}바이트를 넘는다. 스트리밍 암호화 도입 전까지는 처리하지 않는다.`,
    );
    this.name = "BackupSizeError";
  }
}

export function assertPlainSize(bytes: number): void {
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new BackupSizeError(bytes);
  }
  if (bytes > MAX_PLAIN_BYTES) {
    throw new BackupSizeError(bytes);
  }
}
