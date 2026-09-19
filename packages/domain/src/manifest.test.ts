import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const MANIFEST_URL = new URL("../package.json", import.meta.url);

async function readManifest(): Promise<Record<string, unknown>> {
  const text = await readFile(MANIFEST_URL, "utf8");
  return JSON.parse(text) as Record<string, unknown>;
}

describe("@newsplatform/domain manifest", () => {
  it("런타임 의존성 키가 하나도 없다(순수 TS, 외부 의존성 0)", async () => {
    const manifest = await readManifest();
    expect(manifest).not.toHaveProperty("dependencies");
    expect(manifest).not.toHaveProperty("peerDependencies");
    expect(manifest).not.toHaveProperty("optionalDependencies");
  });

  it("이름이 @newsplatform/domain 이다", async () => {
    const manifest = await readManifest();
    expect(manifest.name).toBe("@newsplatform/domain");
  });
});
