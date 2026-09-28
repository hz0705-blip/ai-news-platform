import { describe, expect, it, vi } from "vitest";
import { createShutdown, SHUTDOWN_TIMEOUT_MS } from "./shutdown.ts";

function fakes(stop: () => Promise<void>) {
  const calls: string[] = [];
  const boss = {
    stop: vi.fn(async () => {
      calls.push("stop:start");
      await stop();
      calls.push("stop:done");
    }),
  };
  const sql = { end: vi.fn(async () => void calls.push("end")) };
  const exit = vi.fn((code: number) => void calls.push(`exit:${code}`));
  return { calls, boss, sql, exit, log: () => {} };
}

describe("worker shutdown", () => {
  it("SIGTERM은 진행 중 잡이 끝날 때까지 기다린 뒤 종료 코드 0으로 끝난다", async () => {
    let finishJob = () => {};
    const f = fakes(() => new Promise<void>((resolve) => (finishJob = resolve)));
    const done = createShutdown(f)("SIGTERM");

    await Promise.resolve();
    expect(f.calls).toEqual(["stop:start"]);
    expect(f.sql.end).not.toHaveBeenCalled();
    expect(f.exit).not.toHaveBeenCalled();

    finishJob();
    await done;
    expect(f.calls).toEqual(["stop:start", "stop:done", "end", "exit:0"]);
    expect(f.boss.stop).toHaveBeenCalledWith({
      graceful: true,
      timeout: SHUTDOWN_TIMEOUT_MS,
      close: true,
    });
    expect(SHUTDOWN_TIMEOUT_MS).toBe(95 * 60 * 1000);
  });

  it("종료 중 오류면 종료 코드 1", async () => {
    const f = fakes(() => Promise.reject(new Error("boom")));
    await createShutdown(f)("SIGTERM");
    expect(f.sql.end).not.toHaveBeenCalled();
    expect(f.exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("두 번째 신호는 무시한다", async () => {
    const f = fakes(() => Promise.resolve());
    const shutdown = createShutdown(f);
    await Promise.all([shutdown("SIGTERM"), shutdown("SIGINT")]);
    expect(f.boss.stop).toHaveBeenCalledTimes(1);
    expect(f.exit).toHaveBeenCalledExactlyOnceWith(0);
  });
});
