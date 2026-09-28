import { afterEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag }));

const { POST } = await import("./route.ts");

function post(body: unknown, authorization?: string): Request {
  return new Request("http://web.test/api/revalidate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization === undefined ? {} : { authorization }),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/revalidate", () => {
  afterEach(() => {
    revalidateTag.mockClear();
    delete process.env.REVALIDATE_SECRET;
  });

  it("시크릿이 맞으면 보낸 태그를 만료한다", async () => {
    process.env.REVALIDATE_SECRET = "s3cret";
    const response = await POST(post({ tags: ["today:ko", "story:s-1:latest"] }, "Bearer s3cret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revalidated: 2 });
    expect(revalidateTag.mock.calls).toEqual([
      ["today:ko", "max"],
      ["story:s-1:latest", "max"],
    ]);
  });

  it("immediate면 stale-while-revalidate 없이 즉시 만료한다(권리 등급 변경)", async () => {
    process.env.REVALIDATE_SECRET = "s3cret";
    const tags = ["story:s-1:latest", "story:s-1:rev:r-1:ko:v1"];
    const response = await POST(post({ tags, immediate: true }, "Bearer s3cret"));
    expect(response.status).toBe(200);
    expect(revalidateTag.mock.calls).toEqual(tags.map((tag) => [tag, { expire: 0 }]));
  });

  it("시크릿이 틀리거나 없으면 거부하고, 설정되지 않은 배포에서는 항상 거부한다", async () => {
    process.env.REVALIDATE_SECRET = "s3cret";
    expect((await POST(post({ tags: ["today:ko"] }, "Bearer wrong"))).status).toBe(401);
    expect((await POST(post({ tags: ["today:ko"] }))).status).toBe(401);
    expect((await POST(post("not json", "Bearer s3cret"))).status).toBe(400);
    expect((await POST(post({ tags: [] }, "Bearer s3cret"))).status).toBe(400);
    delete process.env.REVALIDATE_SECRET;
    expect((await POST(post({ tags: ["today:ko"] }, "Bearer s3cret"))).status).toBe(503);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
