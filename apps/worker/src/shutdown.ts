/** 진행 중 잡(최대 만료 90분)이 끝날 때까지 기다리는 상한. */
export const SHUTDOWN_TIMEOUT_MS = 95 * 60 * 1000;

export interface ShutdownDeps {
  boss: { stop(options: { graceful: boolean; timeout: number; close: boolean }): Promise<void> };
  sql: { end(): Promise<void> };
  log: (event: Record<string, unknown>) => void;
  exit: (code: number) => void;
}

/**
 * 배치 중 SIGTERM은 잡을 죽이지 않는다(스펙 "배포 흐름"): 진행 중 잡이 끝날 때까지 기다린 뒤 닫고 종료 코드 0으로 끝난다.
 * 닫다가 실패하면 종료 코드 1. 두 번째 신호는 무시한다.
 */
export function createShutdown({ boss, sql, log, exit }: ShutdownDeps) {
  let started = false;
  return async (signal: string): Promise<void> => {
    if (started) return;
    started = true;
    log({ stage: "worker", result: "stopping", signal });
    try {
      await boss.stop({ graceful: true, timeout: SHUTDOWN_TIMEOUT_MS, close: true });
      await sql.end();
    } catch (error) {
      log({
        stage: "worker",
        result: "stop-failed",
        error: error instanceof Error ? error.message : String(error),
      });
      exit(1);
      return;
    }
    log({ stage: "worker", result: "stopped" });
    exit(0);
  };
}
