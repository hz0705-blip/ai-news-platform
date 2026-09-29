import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./return-path.ts";

describe("safeReturnPath — 로그인 뒤 돌아갈 주소", () => {
  it.each([
    "/",
    "/story/demo-1-agreement",
    "/story/demo-1-agreement/revision/story-demo-1%3Arev-1",
  ])("같은 출처 허용 경로 %s는 그대로 통과한다", (path) => {
    expect(safeReturnPath(path)).toBe(path);
  });

  it.each([
    "//evil.com",
    "//evil.com/story/x",
    "/\\evil.com",
    "\\\\evil.com",
    "/story/x\\..\\..\\evil",
  ])("프로토콜 상대·역슬래시 %s는 거부한다", (path) => {
    expect(safeReturnPath(path)).toBe("/");
  });

  it.each([
    "/%2F%2Fevil.com",
    "/%2f%2fevil.com",
    "/story/%2F%2Fevil.com",
    "/story/x/revision/%2F%2Fevil.com",
    "/story/x/revision/%5C%5Cevil.com",
    "/story/x/revision/%2E%2E",
    "/story/x/revision/%0Aset-cookie",
  ])("디코딩하면 경로를 벗어나는 인코딩 우회 %s는 거부한다", (path) => {
    expect(safeReturnPath(path)).toBe("/");
  });

  it.each([
    "https://evil.com/story/x",
    "http://127.0.0.1:3100/story/x",
    "javascript:alert(1)",
    "evil.com",
  ])("외부 호스트·절대 URL %s는 거부한다", (path) => {
    expect(safeReturnPath(path)).toBe("/");
  });

  it.each([
    "/admin",
    "/auth/callback",
    "/story/x?next=//evil.com",
    "/story/x#claim-1",
    "/story/X-Upper",
    "",
  ])("허용 목록 밖 경로·질의·해시 %s는 fallback으로 바꾼다", (path) => {
    expect(safeReturnPath(path, "/story/fallback")).toBe("/story/fallback");
  });

  it("값이 없으면 fallback이다", () => {
    expect(safeReturnPath(null)).toBe("/");
    expect(safeReturnPath(undefined, "/story/a")).toBe("/story/a");
  });
});
