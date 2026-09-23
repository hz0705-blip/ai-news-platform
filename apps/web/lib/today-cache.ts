import { loadPublishedToday, type TodayData } from "@newsplatform/db";
import { cacheTag } from "next/cache";
import { getRuntimeDb } from "./db.ts";

/**
 * 인자가 공개 캐시 키다. M1의 publishBatchKey는 null, M2a부터 의도한 KST 슬롯 키다.
 * 태그는 무효화 그룹이며 TTL은 기존 Next.js 기본값을 따른다(Ruling 25-3).
 */
export async function getTodayData(
  language: "ko",
  publishBatchKey: string | null,
): Promise<TodayData> {
  "use cache";
  void publishBatchKey;
  cacheTag(`today:${language}`);
  return loadPublishedToday(getRuntimeDb().db, { isDemo: false });
}

/** 데모는 라이브와 함수·캐시·무효화 태그를 분리한다. */
export async function getDemoTodayData(
  language: "ko",
  publishBatchKey: string | null,
): Promise<TodayData> {
  "use cache";
  void publishBatchKey;
  cacheTag(`today:${language}:demo`);
  return loadPublishedToday(getRuntimeDb().db, { isDemo: true });
}
