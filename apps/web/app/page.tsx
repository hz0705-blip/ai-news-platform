import { deriveBatchNotice, dueSlotKeyOf } from "@newsplatform/domain/batch-status";
import { connection } from "next/server";
import { Suspense } from "react";
import { BatchNoticeAlert } from "../components/today/batch-notice.tsx";
import { TodayScreen } from "../components/today/today-screen.tsx";
import { getDemoTodayData, getDueBatchRun, getTodayData } from "../lib/today-cache.ts";
import { ABOUT_LINK, NEXT_UPDATE, SCREEN_TITLE, SEARCH_LINK, TODAY_LABEL } from "./copy.ts";

async function PublishedToday() {
  // 자격 없는 빌드에서는 공개 껍데기만 만들고, 요청 시 캐시를 읽는다.
  await connection();
  // 발행 배치 키 = 약속 시각(06:00·18:00)이 지난 가장 최근 슬롯. 요청 시각에서 정한다.
  const now = new Date();
  const dueSlotKey = dueSlotKeyOf(now);
  const [live, demo, dueRun] = await Promise.all([
    getTodayData("ko", dueSlotKey),
    getDemoTodayData("ko", null),
    getDueBatchRun("ko", dueSlotKey),
  ]);
  const notice = deriveBatchNotice(dueRun, { dueSlotKey, now });
  return (
    <TodayScreen live={live} demo={demo} operationalNotice={<BatchNoticeAlert notice={notice} />} />
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex max-w-[76rem] flex-col gap-3 px-4 py-12 lg:px-6">
          <p className="text-meta text-muted-foreground">{TODAY_LABEL}</p>
          <h1>{SCREEN_TITLE}</h1>
          <div aria-hidden="true" className="min-h-6" />
          <p className="text-meta text-muted-foreground">{NEXT_UPDATE}</p>
          <p>
            <a href="/search" className="underline">
              {SEARCH_LINK}
            </a>
          </p>
          <p>
            <a href="/about" className="underline">
              {ABOUT_LINK}
            </a>
          </p>
        </main>
      }
    >
      <PublishedToday />
    </Suspense>
  );
}
