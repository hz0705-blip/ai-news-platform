/** @jsxImportSource react */
import type { BatchNotice } from "@newstrail/domain/batch-status";
import { CircleAlert, Clock, Gauge, RefreshCw } from "lucide-react";
import {
  BATCH_CAP_REACHED,
  BATCH_DELAYED,
  BATCH_DELAYED_DETAIL,
  BATCH_FAILED,
  BATCH_FAILED_DETAIL,
  BATCH_RUNNING,
  BATCH_RUNNING_DETAIL,
  batchCapReachedDetail,
} from "../../app/copy.ts";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert.tsx";

function contentOf(notice: BatchNotice) {
  switch (notice.kind) {
    case "none":
      return undefined;
    case "running":
      return { Icon: RefreshCw, title: BATCH_RUNNING, detail: BATCH_RUNNING_DETAIL };
    case "cap-reached":
      return {
        Icon: Gauge,
        title: BATCH_CAP_REACHED,
        detail: batchCapReachedDetail(notice.deferred),
      };
    case "failed":
      return { Icon: CircleAlert, title: BATCH_FAILED, detail: BATCH_FAILED_DETAIL };
    case "delayed":
      return { Icon: Clock, title: BATCH_DELAYED, detail: BATCH_DELAYED_DETAIL };
  }
}

/** 오늘 헤더의 배치 상태(#56). 상태마다 아이콘·제목·설명이 달라 색에 기대지 않는다. 정상이면 그리지 않는다. */
export function BatchNoticeAlert({ notice }: { notice: BatchNotice }) {
  const content = contentOf(notice);
  if (content === undefined) return null;
  const { Icon, title, detail } = content;
  return (
    <Alert data-batch-notice={notice.kind}>
      <Icon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{detail}</AlertDescription>
    </Alert>
  );
}
