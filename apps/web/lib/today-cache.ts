import { loadDueBatchRun, loadPublishedToday, type TodayData } from "@newstrail/db";
import type { DueBatchRun } from "@newstrail/domain/batch-status";
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

/**
 * 오늘 화면 배치 상태의 원장 행(#56). 키는 라이브 목록과 같은 발행 배치 키(기한 슬롯)라 06:00·18:00을 넘으면
 * 새 항목을 읽고, 같은 슬롯 안의 변화(진행 중 → 완료·실패)는 워커가 배치 종료 때 `today:<언어>`를 만료해 반영한다.
 * 리스 만료 판정은 요청 시각으로 캐시 밖에서 한다.
 */
export async function getDueBatchRun(
  language: "ko",
  publishBatchKey: string,
): Promise<DueBatchRun | undefined> {
  "use cache";
  cacheTag(`today:${language}`);
  return loadDueBatchRun(getRuntimeDb().db, { dueSlotKey: publishBatchKey });
}
