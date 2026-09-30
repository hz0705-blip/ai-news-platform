// @vitest-environment node
import { inflateSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OG_SAFE_AREA } from "../../../../../../lib/og-image.tsx";
import type { StoryView } from "../../../../../../lib/story-view.ts";

const getLatestRevisionPointer = vi.fn();
const getStoryRevisionView = vi.fn();
vi.mock("../../../../../../lib/story-cache.ts", () => ({
  getLatestRevisionPointer,
  getStoryRevisionView,
}));

const { GET } = await import("./route.ts");

/** 8비트 RGB(A) 비인터레이스 PNG(resvg 출력)를 픽셀로 푼다. */
function decodePng(buffer: Buffer) {
  expect(buffer.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect(data[8]).toBe(8);
      channels = data[9] === 6 ? 4 : 3;
    } else if (type === "IDAT") idat.push(data);
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[y * (stride + 1) + 1 + x] ?? 0;
      const a = x >= channels ? (pixels[y * stride + x - channels] ?? 0) : 0;
      const b = y > 0 ? (pixels[(y - 1) * stride + x] ?? 0) : 0;
      const c = x >= channels && y > 0 ? (pixels[(y - 1) * stride + x - channels] ?? 0) : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = b;
      else if (filter === 3) predictor = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[y * stride + x] = (value + predictor) & 0xff;
    }
  }
  const at = (x: number, y: number) => {
    const i = y * stride + x * channels;
    return [pixels[i] ?? 0, pixels[i + 1] ?? 0, pixels[i + 2] ?? 0] as const;
  };
  return { width, height, at };
}

const BACKGROUND = [0xf8, 0xfa, 0xfc];

function view(overrides: { title?: string; summary?: string; isDemo?: boolean } = {}): StoryView {
  return {
    slug: "demo-1-agreement",
    revisionId: "rev:1",
    header: {
      title: overrides.title ?? "유럽연합, 새 기후 목표에 합의",
      topics: [],
      isDemo: overrides.isDemo ?? true,
      status: "보도 상충",
      sourceCount: 3,
      updatedAt: new Date("2026-09-17T00:30:00Z"),
      statusCounts: [],
    },
    claims: [
      {
        id: "c1",
        order: 1,
        text: overrides.summary ?? "회원국 정상들이 2040년 감축 목표에 합의했다.",
        status: "보도 상충",
        isComparison: false,
        evidence: [],
      },
    ],
    sources: [],
    changes: { revisionNumber: 1, items: [], sourceAdditionCount: 0 },
    revisions: [],
    coverage: undefined,
  };
}

async function request(slug = "demo-1-agreement", revisionId = "rev%3A1") {
  const response = await GET(new Request("http://web.test/og"), {
    params: Promise.resolve({ slug, revisionId, card: "ko-t2-f1.3.9.png" }),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { response, bytes, png: decodePng(bytes) };
}

describe("GET /og/story/[slug]/[revisionId]/[card]", () => {
  afterEach(() => {
    getLatestRevisionPointer.mockReset();
    getStoryRevisionView.mockReset();
  });

  it("og image responds 200 png 1200x600", async () => {
    getLatestRevisionPointer.mockResolvedValue({ storyId: "s-1", revisionId: "rev:2" });
    getStoryRevisionView.mockResolvedValue(view());
    const { response, png } = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect([png.width, png.height]).toEqual([1200, 600]);
    // URL의 개정판(디코딩한 값)을 읽는다 — 포인터의 최신 개정판이 아니다.
    expect(getStoryRevisionView).toHaveBeenCalledWith("s-1", "rev:1", "ko", 1, "demo-1-agreement");
  });

  it("story card is only briefly cached outside the server", async () => {
    getLatestRevisionPointer.mockResolvedValue({ storyId: "s-1", revisionId: "rev:1" });
    getStoryRevisionView.mockResolvedValue(view());
    const { response } = await request();
    const cacheControl = response.headers.get("cache-control") ?? "";
    expect(cacheControl).not.toContain("immutable");
    expect(Number(/max-age=(\d+)/.exec(cacheControl)?.[1])).toBeLessThanOrEqual(300);
    expect(cacheControl).not.toContain("s-maxage");
  });

  it("after the story tag is revalidated the next request renders the new data", async () => {
    // 긴 캐시는 사건 태그가 붙은 `use cache` 함수에만 있다. 무효화 뒤 그 함수가 새 값을 돌려주면 카드도 새로 그려진다.
    getLatestRevisionPointer.mockResolvedValue({ storyId: "s-1", revisionId: "rev:1" });
    getStoryRevisionView.mockResolvedValue(view());
    const before = (await request()).bytes;
    getStoryRevisionView.mockResolvedValue(
      view({ summary: "정정된 주장: 합의는 아직 이뤄지지 않았다." }),
    );
    const after = (await request()).bytes;
    expect(after.equals(before)).toBe(false);
    expect(getStoryRevisionView).toHaveBeenCalledTimes(2);
  });

  it("unknown story returns safe card", async () => {
    getLatestRevisionPointer.mockResolvedValue(undefined);
    const { response, png } = await request("no-such-story");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).not.toContain("immutable");
    expect([png.width, png.height]).toEqual([1200, 600]);
  });

  it("data failure returns safe card", async () => {
    getLatestRevisionPointer.mockRejectedValue(new Error("db down"));
    const { response } = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).not.toContain("immutable");
  });

  it("all text stays inside the 800x400 safe area", async () => {
    getLatestRevisionPointer.mockResolvedValue({ storyId: "s-1", revisionId: "rev:1" });
    getStoryRevisionView.mockResolvedValue(
      view({
        title: "아주 긴 제목이 템플릿의 줄 제한을 넘어 계속 이어지는 경우에도 ".repeat(6),
        summary: "요약 한 줄이 두 줄을 넘길 만큼 길게 이어지는 경우에도 ".repeat(6),
      }),
    );
    const { png } = await request();
    const { x, y, width, height } = OG_SAFE_AREA;
    let inside = 0;
    for (let py = 0; py < png.height; py += 1) {
      for (let px = 0; px < png.width; px += 1) {
        const within = px >= x && px < x + width && py >= y && py < y + height;
        const pixel = png.at(px, py);
        if (within) {
          if (pixel[0] < 0x40 && pixel[1] < 0x40) inside += 1;
        } else if (pixel.some((v, i) => v !== BACKGROUND[i])) {
          throw new Error(`안전 영역 밖에 그려진 픽셀 (${px}, ${py}): ${pixel.join(",")}`);
        }
      }
    }
    // 안전 영역 안에는 글자(진한 픽셀)가 있다.
    expect(inside).toBeGreaterThan(5_000);
  });
});
