/** @jsxImportSource react */
import { createRoot } from "react-dom/client";
import { StoryPage } from "../components/story/story-page.tsx";
import type { StoryView } from "../lib/story-view.ts";

declare global {
  interface Window {
    __STORY_VIEW__?: unknown;
  }
}

/** JSON으로 건너온 뷰의 ISO 문자열을 Date로 되살린다(뷰에서 Date인 필드는 publishedAt·updatedAt뿐). */
function reviveDates(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reviveDates);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        (key === "publishedAt" || key === "updatedAt") && typeof item === "string"
          ? new Date(item)
          : reviveDates(item),
      ]),
    );
  }
  return value;
}

const root = document.getElementById("story-fixture");
if (!root) throw new Error("Missing Story fixture root");
const view = reviveDates(window.__STORY_VIEW__) as StoryView;
if (!view || !Array.isArray(view.claims)) throw new Error("Missing Story fixture view");
createRoot(root).render(<StoryPage view={view} />);
