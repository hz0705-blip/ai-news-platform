import { deriveBatchNotice, dueSlotKeyOf } from "@newstrail/domain/batch-status";
import { connection } from "next/server";
import { Suspense } from "react";
import { BatchNoticeAlert } from "../components/today/batch-notice.tsx";
import { TodayHeader } from "../components/today/today-header.tsx";
import { TodayScreen } from "../components/today/today-screen.tsx";
import { getDemoTodayData, getDueBatchRun, getTodayData } from "../lib/today-cache.ts";

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
        <main className="today-page" id="main-content" tabIndex={-1}>
          <TodayHeader />
          <div className="today-loading" role="status">
            <p>사건을 불러오고 있습니다.</p>
            <div className="editorial-skeleton" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>
        </main>
      }
    >
      <PublishedToday />
    </Suspense>
  );
}
