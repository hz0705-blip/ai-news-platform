/** @jsxImportSource react */
import type { LeadImage } from "@newstrail/db";
import { createRoot } from "react-dom/client";
import { SiteHeader } from "../components/site-header.tsx";
import { TodayScreen } from "../components/today/today-screen.tsx";
import { FIXED_NOW, live } from "./today-data.ts";

declare global {
  interface Window {
    __TODAY_IMAGE__?: LeadImage;
  }
}

const root = document.getElementById("today-fixture");
if (!root) throw new Error("Missing Today fixture root");
const image = window.__TODAY_IMAGE__;
createRoot(root).render(
  <>
    <SiteHeader />
    <TodayScreen
      live={image ? { ...live, stories: live.stories.map((story) => ({ ...story, image })) } : live}
      now={FIXED_NOW}
    />
  </>,
);
