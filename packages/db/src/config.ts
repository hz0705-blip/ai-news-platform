/**
 * 연결 설정 파서. 환경변수 객체에서 URL 하나씩만 읽는 순수 함수.
 * 런타임은 DATABASE_URL, 마이그레이션은 DATABASE_MIGRATION_URL. 서로의 변수를 읽지 않는다
 * (docs/spec/v1.md "배포와 운영" 연결·시크릿, 이슈 #16).
 */
export type EnvSource = Readonly<Record<string, string | undefined>>;

export interface RuntimeConfig {
  readonly url: string;
}

export interface MigrationConfig {
  readonly url: string;
}

export class MissingEnvError extends Error {
  readonly variable: string;

  constructor(variable: string) {
    super(`${variable}이(가) 설정되지 않았다. .env.example을 참고해 ${variable}을(를) 설정한다.`);
    this.name = "MissingEnvError";
    this.variable = variable;
  }
}

export class InvalidEnvError extends Error {
  readonly variable: string;

  constructor(variable: string, reason: string) {
    super(`${variable} 값이 올바르지 않다: ${reason}`);
    this.name = "InvalidEnvError";
    this.variable = variable;
  }
}

const POSTGRES_PROTOCOLS: ReadonlySet<string> = new Set(["postgres:", "postgresql:"]);

function readPostgresUrl(env: EnvSource, variable: string): string {
  const value = env[variable];
  if (value === undefined || value === "") {
    throw new MissingEnvError(variable);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new InvalidEnvError(variable, "URL 형식이 아니다");
  }
  if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) {
    throw new InvalidEnvError(
      variable,
      `postgres:// 또는 postgresql:// 스킴이어야 한다 (${parsed.protocol})`,
    );
  }
  return value;
}

export function parseRuntimeConfig(env: EnvSource): RuntimeConfig {
  return { url: readPostgresUrl(env, "DATABASE_URL") };
}

export function parseMigrationConfig(env: EnvSource): MigrationConfig {
  return { url: readPostgresUrl(env, "DATABASE_MIGRATION_URL") };
}
