import { createMigrationDb } from "@newsplatform/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDemoStory } from "./load-demo-story.ts";

const url = process.env.DATABASE_MIGRATION_URL;
const maybe = url === undefined ? describe.skip : describe;
// Vitest는 테스트가 전부 건너뛰어진 파일의 console 출력을 보고하지 않으므로 stderr에 직접 쓴다.
if (url === undefined) process.stderr.write("DATABASE_MIGRATION_URL 없음 — 실 DB 테스트 건너뜀\n");

maybe("데모 사건 적재", () => {
  // 빈 테이블에서 시작하고 끝나면 비운다. 잠금으로 packages/db의 실 DB 테스트와 겹치지 않는다.
  let cleanup: () => Promise<void> = async () => undefined;
  beforeAll(async () => {
    ({ cleanup } = await createMigrationDb(url as string));
  });
  afterAll(async () => {
    await cleanup();
  });

  it("두 번 실행해도 개정판은 하나이고 데모 표식이 있다", async () => {
    const first = await loadDemoStory({ url: url as string, slug: "demo-1-agreement" });
    const second = await loadDemoStory({ url: url as string, slug: "demo-1-agreement" });
    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(second.revisionCount).toBe(1);
    expect(second.storyIsDemo).toBe(true);
  });
});
