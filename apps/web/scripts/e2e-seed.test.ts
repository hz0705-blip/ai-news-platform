// @vitest-environment node
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

/** PostgreSQL 없이 StartupMessage만 받고 종료한다. 쿼리·실제 DB 연결은 없다. */
async function probe(query: string) {
  const databases: string[] = [];
  const listener = createServer((socket) => {
    socket.once("data", (data) => {
      const fields = data.subarray(8).toString().split("\0");
      databases.push(fields[fields.indexOf("database") + 1] ?? "");
      socket.destroy();
      child.kill("SIGTERM");
    });
  });
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address();
  if (address === null || typeof address === "string") throw new Error("Missing local listener");
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL("../e2e/seed.ts", import.meta.url))],
    {
      env: {
        NODE_ENV: "test",
        PATH: process.env.PATH,
        DATABASE_E2E_URL: `postgresql://test:test@127.0.0.1:${address.port}/newsplatform_test${query}`,
      },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const timeout = setTimeout(() => child.kill("SIGTERM"), 3_000);
  try {
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once("exit", resolve);
      child.once("error", reject);
    });
    return { databases, stderr, exitCode };
  } finally {
    clearTimeout(timeout);
    await new Promise<void>((resolve) => listener.close(() => resolve()));
  }
}

it("E2E seed rejects database override before connecting", async () => {
  const result = await probe("?database=production&connect_timeout=1");
  expect(result.databases).toEqual([]);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("without query options");
});

it("E2E seed accepts the plain local test URL and keeps its database target", async () => {
  const result = await probe("");
  expect(result.databases).toEqual(["newsplatform_test"]);
});
