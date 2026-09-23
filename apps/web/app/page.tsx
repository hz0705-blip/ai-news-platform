import { connection } from "next/server";
import { Suspense } from "react";
import { TodayScreen } from "../components/today/today-screen.tsx";
import { getDemoTodayData, getTodayData } from "../lib/today-cache.ts";
import { NEXT_UPDATE, SCREEN_TITLE, TODAY_LABEL } from "./copy.ts";

async function PublishedToday() {
  // 자격 없는 빌드에서는 공개 껍데기만 만들고, 요청 시 캐시를 읽는다.
  await connection();
  const [live, demo] = await Promise.all([getTodayData("ko", null), getDemoTodayData("ko", null)]);
  return <TodayScreen live={live} demo={demo} />;
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
        </main>
      }
    >
      <PublishedToday />
    </Suspense>
  );
}
