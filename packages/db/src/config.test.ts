import { describe, expect, it } from "vitest";
import {
  InvalidEnvError,
  MissingEnvError,
  parseMigrationConfig,
  parseRuntimeConfig,
} from "./config.ts";

const RUNTIME_URL = "postgresql://user:secret@pooler.example:6543/postgres";
const MIGRATION_URL = "postgresql://user:secret@db.example:5432/postgres";

describe("parseRuntimeConfig", () => {
  it("DATABASE_URL을 그대로 돌려준다", () => {
    expect(parseRuntimeConfig({ DATABASE_URL: RUNTIME_URL })).toEqual({ url: RUNTIME_URL });
  });

  it("DATABASE_URL이 없으면 변수 이름을 담은 MissingEnvError를 던진다", () => {
    expect(() => parseRuntimeConfig({})).toThrow(MissingEnvError);
    expect(() => parseRuntimeConfig({})).toThrow(/DATABASE_URL/);
  });

  it("빈 문자열도 미설정으로 본다", () => {
    expect(() => parseRuntimeConfig({ DATABASE_URL: "" })).toThrow(MissingEnvError);
  });

  it("DATABASE_MIGRATION_URL만 있으면 대체로 쓰지 않고 실패한다", () => {
    expect(() => parseRuntimeConfig({ DATABASE_MIGRATION_URL: MIGRATION_URL })).toThrow(
      MissingEnvError,
    );
  });

  it("postgres 계열 스킴이 아니면 InvalidEnvError를 던진다", () => {
    expect(() => parseRuntimeConfig({ DATABASE_URL: "mysql://u:p@h/db" })).toThrow(InvalidEnvError);
    expect(() => parseRuntimeConfig({ DATABASE_URL: "not a url" })).toThrow(InvalidEnvError);
  });

  it("오류 객체가 variable 필드에 변수 이름을 담는다", () => {
    try {
      parseRuntimeConfig({});
    } catch (error) {
      expect(error).toBeInstanceOf(MissingEnvError);
      expect((error as MissingEnvError).variable).toBe("DATABASE_URL");
    }
  });
});

describe("parseMigrationConfig", () => {
  it("DATABASE_MIGRATION_URL을 그대로 돌려준다", () => {
    expect(parseMigrationConfig({ DATABASE_MIGRATION_URL: MIGRATION_URL })).toEqual({
      url: MIGRATION_URL,
    });
  });

  it("DATABASE_URL만 있으면 대체로 쓰지 않고 DATABASE_MIGRATION_URL 미설정으로 실패한다", () => {
    expect(() => parseMigrationConfig({ DATABASE_URL: RUNTIME_URL })).toThrow(
      /DATABASE_MIGRATION_URL/,
    );
  });

  it("postgres: 스킴도 받는다", () => {
    expect(parseMigrationConfig({ DATABASE_MIGRATION_URL: "postgres://u:p@h:5432/db" })).toEqual({
      url: "postgres://u:p@h:5432/db",
    });
  });
});
