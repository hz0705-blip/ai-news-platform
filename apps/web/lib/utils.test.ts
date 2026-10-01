import { describe, expect, it } from "vitest";
import { cn } from "./utils.ts";

describe("cn", () => {
  it("토큰 글자 크기 클래스는 글자색 클래스와 충돌하지 않는다", () => {
    expect(cn("text-meta text-muted-foreground")).toBe("text-meta text-muted-foreground");
    expect(cn("text-body text-foreground")).toBe("text-body text-foreground");
  });

  it("글자 크기 클래스끼리는 뒤의 것이 이긴다", () => {
    expect(cn("text-meta text-body")).toBe("text-body");
    expect(cn("text-meta text-sm")).toBe("text-sm");
  });
});
