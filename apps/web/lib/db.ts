import { createRuntimeDb, type RuntimeDb } from "@newsplatform/db";

let runtimeDb: RuntimeDb | undefined;

/**
 * 프로세스(모듈 스코프)당 한 번만 만드는 런타임 연결(packages/db runtime.ts).
 * 첫 호출 때 만든다 — DATABASE_URL이 없는 빌드(CI checks 잡)도 모듈을 읽을 수 있어야 한다.
 * 요청마다 새 연결을 만들지 않는다.
 */
export function getRuntimeDb(): RuntimeDb {
  runtimeDb ??= createRuntimeDb(process.env);
  return runtimeDb;
}
