import { describe, expect, it } from "vitest";

describe("worker 테스트 환경", () => {
  it("node 환경이라 document가 없다", () => {
    expect("document" in globalThis).toBe(false);
  });

  it("Node 24 LTS에서 돈다(devEngines.runtime)", () => {
    expect(process.versions.node.split(".")[0]).toBe("24");
  });
});
