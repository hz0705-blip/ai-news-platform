import {
  createCipheriv,
  createDecipheriv,
  createHash,
  type DecipherGCM,
  randomBytes,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";

/**
 * 백업 아티팩트 암호화 형식 NPBK1(이슈 #18 Ruling).
 *   magic "NPBK1"(5바이트) ‖ iv(12바이트, 무작위) ‖ AES-256-GCM 본문 ‖ 인증 태그(16바이트)
 * 키는 BACKUP_ENCRYPTION_KEY = 32바이트를 64자 hex로(`openssl rand -hex 32`). GitHub 환경 시크릿에만 둔다.
 * 외부 도구 없이 Node 24 내장 crypto만 쓴다(런너·개발 Mac 어디에도 age가 없고 openssl enc는 인증 암호가 아니다).
 * 파일은 스트림으로 처리해 크기 상한이 없다(이슈 #31). `encryptBackup`/`decryptBackup`은 같은 형식의 버퍼 버전(테스트·호환용).
 * 복구 절차: `node packages/db/scripts/backup-decrypt.ts --in <file>.enc --out <file>` → `pg_restore`.
 */
export const BACKUP_FORMAT_MAGIC: Buffer = Buffer.from("NPBK1", "ascii");
export const BACKUP_KEY_VARIABLE = "BACKUP_ENCRYPTION_KEY";

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = BACKUP_FORMAT_MAGIC.length + IV_BYTES;
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

function parseHeader(header: Buffer): Buffer {
  if (!header.subarray(0, BACKUP_FORMAT_MAGIC.length).equals(BACKUP_FORMAT_MAGIC)) {
    throw new BackupFormatError("magic이 NPBK1이 아니다");
  }
  return header.subarray(BACKUP_FORMAT_MAGIC.length, HEADER_BYTES);
}

const AUTH_FAILED = "인증 실패(키가 다르거나 본문이 손상됨)";
const TOO_SHORT = "헤더와 인증 태그를 담기에 짧다";

export function encryptBackup(plain: Buffer, key: Buffer): Buffer {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([BACKUP_FORMAT_MAGIC, iv, body, cipher.getAuthTag()]);
}

export function decryptBackup(sealed: Buffer, key: Buffer): Buffer {
  assertKey(key);
  if (sealed.length < HEADER_BYTES + TAG_BYTES) {
    throw new BackupFormatError(TOO_SHORT);
  }
  const iv = parseHeader(sealed);
  const tag = sealed.subarray(sealed.length - TAG_BYTES);
  const body = sealed.subarray(HEADER_BYTES, sealed.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    throw new BackupFormatError(AUTH_FAILED);
  }
}

export interface EncryptFileResult {
  readonly plainBytes: number;
  readonly encryptedBytes: number;
  /** 암호문 파일 전체(헤더·태그 포함)의 SHA-256 hex. 쓰는 동안 계산한다. */
  readonly sha256: string;
}

/** 평문 파일을 스트림으로 읽어 NPBK1 파일로 쓴다. 전체를 메모리에 올리지 않는다. */
export async function encryptBackupFile(
  inputPath: string,
  outputPath: string,
  key: Buffer,
): Promise<EncryptFileResult> {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const hash = createHash("sha256");
  let plainBytes = 0;
  let encryptedBytes = 0;
  const emit = (chunk: Buffer): Buffer => {
    hash.update(chunk);
    encryptedBytes += chunk.length;
    return chunk;
  };
  async function* seal(source: AsyncIterable<Buffer>): AsyncGenerator<Buffer> {
    yield emit(Buffer.concat([BACKUP_FORMAT_MAGIC, iv]));
    for await (const chunk of source) {
      plainBytes += chunk.length;
      yield emit(cipher.update(chunk));
    }
    const last = cipher.final();
    if (last.length > 0) {
      yield emit(last);
    }
    yield emit(cipher.getAuthTag());
  }
  await pipeline(createReadStream(inputPath), seal, createWriteStream(outputPath));
  return { plainBytes, encryptedBytes, sha256: hash.digest("hex") };
}

export interface DecryptFileResult {
  readonly plainBytes: number;
}

/**
 * NPBK1 파일을 스트림으로 복호화한다. 태그는 파일 끝 16바이트이므로 마지막 16바이트를 붙잡아 두며 앞부분만 흘려보낸다.
 * 평문은 같은 디렉터리의 임시 파일에 쓰고 태그 검증이 끝난 뒤 rename한다. 실패하면 임시 파일을 지우고 던진다.
 */
export async function decryptBackupFile(
  inputPath: string,
  outputPath: string,
  key: Buffer,
): Promise<DecryptFileResult> {
  assertKey(key);
  let plainBytes = 0;
  async function* open(source: AsyncIterable<Buffer>): AsyncGenerator<Buffer> {
    let decipher: DecipherGCM | undefined;
    let pending: Buffer = Buffer.alloc(0);
    for await (const chunk of source) {
      pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
      if (decipher === undefined) {
        if (pending.length < HEADER_BYTES) {
          continue;
        }
        decipher = createDecipheriv("aes-256-gcm", key, parseHeader(pending));
        pending = pending.subarray(HEADER_BYTES);
      }
      if (pending.length > TAG_BYTES) {
        const body = pending.subarray(0, pending.length - TAG_BYTES);
        pending = Buffer.from(pending.subarray(pending.length - TAG_BYTES));
        const plain = decipher.update(body);
        plainBytes += plain.length;
        yield plain;
      }
    }
    if (decipher === undefined || pending.length < TAG_BYTES) {
      throw new BackupFormatError(TOO_SHORT);
    }
    decipher.setAuthTag(pending);
    let last: Buffer;
    try {
      last = decipher.final();
    } catch {
      throw new BackupFormatError(AUTH_FAILED);
    }
    plainBytes += last.length;
    yield last;
  }
  const tempPath = join(
    dirname(outputPath),
    `.${basename(outputPath)}.${randomBytes(4).toString("hex")}.tmp`,
  );
  try {
    await pipeline(createReadStream(inputPath), open, createWriteStream(tempPath));
    await rename(tempPath, outputPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
  return { plainBytes };
}

export function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** 파일 전체의 SHA-256 hex를 스트림으로 계산한다. */
export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

/** `sha256sum -c` 호환 한 줄: hex, 공백 둘, 파일명, 개행. */
export const SHA256_LINE = (hex: string, fileName: string): string => `${hex}  ${fileName}\n`;
