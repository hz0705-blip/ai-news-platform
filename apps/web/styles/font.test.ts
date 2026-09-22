// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("Pretendard 1.3.9의 라이선스와 자체 호스팅 동적 서브셋을 제공한다", () => {
  const root = new URL("../public/fonts/pretendard/", import.meta.url);
  expect(readFileSync(new URL("LICENSE.txt", root), "utf8")).toContain("SIL OPEN FONT LICENSE");
  const css = readFileSync(new URL("pretendard.css", root), "utf8");
  const faces = css.match(/@font-face\s*\{[^}]+\}/g) ?? [];
  expect(faces.length).toBeGreaterThan(1);
  for (const face of faces) {
    expect(face).toMatch(/font-display:\s*swap/);
    expect(face).toContain("unicode-range:");
    const file = face.match(/url\(['"]?([^)'"\s]+\.woff2)/)?.[1];
    expect(file).toBeDefined();
    expect(file).not.toMatch(/^https?:/);
    expect(existsSync(new URL(file ?? "", root))).toBe(true);
  }
});
