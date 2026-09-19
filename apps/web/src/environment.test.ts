import { describe, expect, it } from "vitest";

describe("web 테스트 환경", () => {
  it("jsdom 환경이라 document가 있다", () => {
    expect(typeof document).toBe("object");
    expect(document.documentElement.tagName).toBe("HTML");
  });
});
