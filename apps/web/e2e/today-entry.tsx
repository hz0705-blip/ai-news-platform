/** @jsxImportSource react */
import type { LeadImage } from "@newstrail/db";
import type { BatchNotice } from "@newstrail/domain/batch-status";
import { createRoot } from "react-dom/client";
import { SiteHeader } from "../components/site-header.tsx";
import { BatchNoticeAlert } from "../components/today/batch-notice.tsx";
import { TodayScreen } from "../components/today/today-screen.tsx";
import { demo, FIXED_NOW, live } from "./today-data.ts";

declare global {
  interface Window {
    __TODAY_NOTICE__?: BatchNotice;
    __TODAY_IMAGE__?: LeadImage;
  }
}

const root = document.getElementById("today-fixture");
if (!root) throw new Error("Missing Today fixture root");
const notice = window.__TODAY_NOTICE__;
const image = window.__TODAY_IMAGE__;
createRoot(root).render(
  <>
    <SiteHeader />
    <TodayScreen
      live={image ? { ...live, stories: live.stories.map((story) => ({ ...story, image })) } : live}
      demo={image ? { ...demo, stories: demo.stories.map((story) => ({ ...story, image })) } : demo}
      now={FIXED_NOW}
      {...(notice ? { operationalNotice: <BatchNoticeAlert notice={notice} /> } : {})}
    />
  </>,
);
