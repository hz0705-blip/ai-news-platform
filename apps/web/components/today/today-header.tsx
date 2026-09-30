/** @jsxImportSource react */
import { Clock3, Globe2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ABOUT_LINK,
  FOLLOWS_LINK,
  LAST_UPDATED,
  NEVER_PUBLISHED,
  NEXT_UPDATE,
  SCREEN_TITLE,
  SEARCH_LINK,
  SERVICE_NAME,
  TODAY_LABEL,
} from "../../app/copy.ts";
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
      <div className="today-masthead">
        <div className="today-brand">
          <Globe2 size={28} strokeWidth={1.5} aria-hidden="true" />
          <div>
            <span className="today-brand-title">{SERVICE_NAME}</span>
            <span className="today-brand-description">해외 뉴스를, 근거와 함께.</span>
          </div>
        </div>
        <nav aria-label="오늘 화면 탐색" className="today-navigation">
          <Link href="/" aria-current="page">
            {TODAY_LABEL}
          </Link>
          <Link href="/follows">{FOLLOWS_LINK}</Link>
          <Link href="/search">{SEARCH_LINK}</Link>
          <Link href="/about">{ABOUT_LINK}</Link>
        </nav>
      </div>
      <div className="today-intro">
        <div>
          <p className="today-eyebrow">THE WORLD, IN CONTEXT</p>
          <h1 className="today-title">{SCREEN_TITLE}</h1>
          <p className="today-subtitle">무슨 일이 있었는지부터, 그 근거가 무엇인지까지.</p>
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
