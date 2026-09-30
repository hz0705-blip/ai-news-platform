import { describe, expect, it } from "vitest";
import { createOfflineEmbeddingClient, createOfflineModelClient } from "./offline.ts";
import type { LocalPacket } from "./packet.ts";
import { arrivalSlot, runArrivalStream, splitArrivalStream } from "./stream.ts";
import { fakeArticle, fakeSources } from "./testing.ts";

const packet = (packetId: string, times: readonly string[]): LocalPacket => ({
  packetId,
  storyId: `story-${packetId}`,
  topic: "기술·AI",
  sizeClass: "기사 2~4개",
  storyArticleCount: times.length,
  articles: times.map((at, i) => ({
    ...fakeArticle(
      `${packetId}-${i + 1}`,
      `The fictional mayor of Lanternville opened pier ${i + 1}. Officials said 40 boats joined the parade.`,
      at,
    ),
    key: `a${i + 1}`,
  })),
});

describe("도착 스트림", () => {
  it("도착 스트림은 05·17시 KST 슬롯으로 나뉜다", () => {
    // 05시 KST = 20:00Z(전날), 17시 KST = 08:00Z.
    expect(arrivalSlot(new Date("2026-09-27T19:59:00Z")).toISOString()).toBe(
      "2026-09-27T20:00:00.000Z",
    );
    expect(arrivalSlot(new Date("2026-09-27T20:00:00Z")).toISOString()).toBe(
      "2026-09-27T20:00:00.000Z",
    );
    expect(arrivalSlot(new Date("2026-09-27T20:00:01Z")).toISOString()).toBe(
      "2026-09-28T08:00:00.000Z",
    );
    const slots = splitArrivalStream([
      packet("dev-01", ["2026-09-28T01:00:00.000Z", "2026-09-28T09:00:00.000Z"]),
      packet("dev-02", ["2026-09-27T21:00:00.000Z"]),
    ]);
    expect(slots.map((s) => s.slotAt.toISOString())).toEqual([
      "2026-09-28T08:00:00.000Z",
      "2026-09-28T20:00:00.000Z",
    ]);
    // 여러 사건이 한 슬롯에 섞이고 슬롯 안은 발행 순이다.
    expect(slots[0]?.articles.map((a) => a.article.articleId)).toEqual(["dev-02-1", "dev-01-1"]);
    expect(slots[1]?.articles.map((a) => a.article.articleId)).toEqual(["dev-01-2"]);
  });

  it("사건 상태를 슬롯 사이로 잇고 예산 상한에서 멈춘다", async () => {
    const packets = [packet("dev-01", ["2026-09-28T01:00:00.000Z", "2026-09-28T09:00:00.000Z"])];
    const result = await runArrivalStream(packets, fakeSources(packets), {
      modelClient: createOfflineModelClient("gpt-5-mini-2025-08-07"),
      embeddingClient: createOfflineEmbeddingClient(),
      remainingUsd: () => 10,
      onSpend: () => {},
    });
    expect(result.assignments["dev-01-2"]).toBe(result.assignments["dev-01-1"]);
    expect(result.slots.map((s) => s.revisions.map((r) => r.revisionNumber))).toEqual([[1], [2]]);
    expect(result.unprocessed.stories).toEqual([]);

    const capped = await runArrivalStream(packets, fakeSources(packets), {
      modelClient: createOfflineModelClient("gpt-5-mini-2025-08-07"),
      embeddingClient: createOfflineEmbeddingClient(),
      remainingUsd: () => 0,
      onSpend: () => {},
      reservation: () => 0.01,
    });
    expect(capped.stoppedByBudget).toBe(true);
    expect(capped.slots).toHaveLength(1);
    expect(capped.unprocessed.articles).toEqual(["dev-01-2"]);
    expect(capped.unprocessed.stories).toEqual([
      { storyId: capped.assignments["dev-01-1"], reason: "예산 상한" },
    ]);
  });
});
