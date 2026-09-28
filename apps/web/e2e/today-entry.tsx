/** @jsxImportSource react */
import type { BatchNotice } from "@newsplatform/domain/batch-status";
import { createRoot } from "react-dom/client";
import { BatchNoticeAlert } from "../components/today/batch-notice.tsx";
import { TodayScreen } from "../components/today/today-screen.tsx";
import { demo, FIXED_NOW, live } from "./today-data.ts";

declare global {
  interface Window {
    __TODAY_NOTICE__?: BatchNotice;
  }
}

const root = document.getElementById("today-fixture");
if (!root) throw new Error("Missing Today fixture root");
const notice = window.__TODAY_NOTICE__;
createRoot(root).render(
  <TodayScreen
    live={live}
    demo={demo}
    now={FIXED_NOW}
    {...(notice ? { operationalNotice: <BatchNoticeAlert notice={notice} /> } : {})}
  />,
);
