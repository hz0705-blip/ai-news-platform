import { createHash } from "node:crypto";

/** 기사 버전 본문·근거 구간 원문 해시. 소문자 hex 64자 (#21 Ruling 2). */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
