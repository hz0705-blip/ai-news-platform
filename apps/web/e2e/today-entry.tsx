/** @jsxImportSource react */
import type { LeadImage, TodayStoryCard } from "@newstrail/db";
import { createRoot } from "react-dom/client";
import { SiteHeader } from "../components/site-header.tsx";
import { TodayScreen } from "../components/today/today-screen.tsx";
import { FIXED_NOW, live } from "./today-data.ts";

declare global {
  interface Window {
    __TODAY_IMAGE__?: LeadImage;
    /** 검사가 JSON으로 넘긴 카드 목록(없으면 today-data의 live). updatedAt은 문자열로 오므로 되살린다. */
    __TODAY_STORIES__?: (Omit<TodayStoryCard, "updatedAt"> & { updatedAt: string })[];
  }
}

const root = document.getElementById("today-fixture");
if (!root) throw new Error("Missing Today fixture root");
const image = window.__TODAY_IMAGE__;
const stories =
  window.__TODAY_STORIES__?.map((story) => ({ ...story, updatedAt: new Date(story.updatedAt) })) ??
  live.stories;
createRoot(root).render(
  <>
    <SiteHeader />
    <TodayScreen
      live={{
        stories: image ? stories.map((story) => ({ ...story, image })) : stories,
        lastUpdated: stories[0]?.updatedAt ?? null,
      }}
      now={FIXED_NOW}
    />
  </>,
);
