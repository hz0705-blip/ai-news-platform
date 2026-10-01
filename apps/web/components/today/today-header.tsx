/** @jsxImportSource react */
import { Clock3 } from "lucide-react";
import type { ReactNode } from "react";
import { LAST_UPDATED, NEVER_PUBLISHED, NEXT_UPDATE } from "../../app/copy.ts";
import { formatAbsolute } from "../../lib/format-time.ts";

// 로딩 중에도 같은 머리글을 사용해 제목·탐색 위치를 유지한다.
export function TodayHeader({
  lastUpdated,
  operationalNotice,
}: {
  lastUpdated?: Date | null;
  operationalNotice?: ReactNode;
}) {
  const updated = lastUpdated ? formatAbsolute(lastUpdated) : null;
  return (
    <header className="today-header">
      <div className="today-intro">
        <div>
          <h1 className="today-title">오늘의 지면</h1>
        </div>
        <div className="today-edition">
          <p className="today-updated">
            <Clock3 size={16} aria-hidden="true" />
            <span>
              {updated ? (
                <>
                  {LAST_UPDATED} <time dateTime={updated.dateTime}>{updated.text}</time>
                </>
              ) : lastUpdated === undefined ? (
                "마지막 갱신 확인 중"
              ) : (
                NEVER_PUBLISHED
              )}
            </span>
          </p>
          <p className="today-schedule">{NEXT_UPDATE}</p>
        </div>
      </div>
      {operationalNotice}
    </header>
  );
}
