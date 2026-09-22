// @vitest-environment node
import { readFileSync } from "node:fs";
import { formatHex, wcagContrast } from "culori";
import { describe, expect, it } from "vitest";

// 독립 기준: docs/spec/v1.md B 표 + #20 보조 토큰 Ruling (2026-09-22).
const pairs = {
  background: ["#f8fafc/#0f172a", "#0f172a/#f1f5f9"],
  card: ["#ffffff/#0f172a", "#1e293b/#f1f5f9"],
  primary: ["#581c87/#ffffff", "#d8b4fe/#3b0764"],
  muted: ["#f1f5f9/#475569", "#1e293b/#cbd5e1"],
  popover: ["#ffffff/#0f172a", "#1e293b/#f1f5f9"],
  secondary: ["#f1f5f9/#475569", "#1e293b/#cbd5e1"],
  accent: ["#f1f5f9/#475569", "#1e293b/#cbd5e1"],
  "status-single": ["#f3f4f6/#374151", "#374151/#e5e7eb"],
  "status-agree": ["#ccfbf1/#115e59", "#134e4a/#99f6e4"],
  "status-conflicting": ["#fef3c7/#78350f", "#78350f/#fde68a"],
  "status-resolved": ["#dcfce7/#14532d", "#14532d/#bbf7d0"],
  "status-corrected": ["#f3e8ff/#581c87", "#581c87/#e9d5ff"],
  demo: ["#e7e5e4/#44403c", "#44403c/#e7e5e4"],
  "evidence-highlight": ["#fef08a/#422006", "#422006/#fef9c3"],
};

describe.each(["light", "dark"])("%s 렌더링 CSS 토큰", (theme) => {
  it("B 정본값을 보존하고 모든 전경/배경 쌍의 대비가 4.5:1 이상이다", () => {
    const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
    const blocks = [...css.matchAll(/:root\s*\{([^}]+)\}/g)];
    const index = theme === "light" ? 0 : 1;
    const values = Object.fromEntries(
      [...(blocks[index]?.[1] ?? "").matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, key, value]) => [
        key,
        value,
      ]),
    );
    function color(key: string): string {
      const value = values[key];
      expect(value, key).toBeDefined();
      const alias = value?.match(/^var\(--([\w-]+)\)$/)?.[1];
      return alias ? color(alias) : (value ?? "");
    }
    for (const [role, expected] of Object.entries(pairs)) {
      const bg = color(role);
      const fg = color(role === "background" ? "foreground" : `${role}-foreground`);
      expect(`${formatHex(bg)}/${formatHex(fg)}`, role).toBe(expected[index]);
      expect(wcagContrast(bg, fg), role).toBeGreaterThanOrEqual(4.5);
    }
    for (const surface of ["background", "card", "muted"]) {
      expect(wcagContrast(color("ring"), color(surface)), surface).toBeGreaterThanOrEqual(3);
    }
    expect(formatHex(color("border"))).toBe(index === 0 ? "#e2e8f0" : "#334155");
    expect(css).not.toMatch(/--(?:destructive|chart-)/);
  });
});
