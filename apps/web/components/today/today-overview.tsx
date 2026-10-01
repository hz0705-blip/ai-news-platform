/** @jsxImportSource react */
import type { TodayStoryCard } from "@newstrail/db";
import Link from "next/link";
import { StatusBadge } from "../status-badge.tsx";

/** 지면 옆에는 보도가 달라진 사건과 읽을거리만 둔다. */
export function TodayOverview({ stories }: { stories: readonly TodayStoryCard[] }) {
  const related = stories
    .filter((story) => story.status === "보도 상충" || story.status === "정정됨")
    .slice(0, 3);
  if (related.length === 0) return null;
  return (
    <aside className="today-aside" aria-label="발행 사건 안내">
      {related.length > 0 && (
        <section aria-labelledby="today-related-heading">
          <h2 id="today-related-heading" className="today-aside-title">
            상충·정정 살펴보기
          </h2>
          <ul className="today-related-list">
            {related.map((story, index) => (
              <li key={story.id}>
                <span className="today-rail-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <StatusBadge status={story.status} />
                <h3>
                  <Link href={`/story/${story.slug}`}>{story.title}</Link>
                </h3>
                <p className="text-meta text-muted-foreground">출처 {story.sourceCount}곳의 보도</p>
                <Link href={`/story/${story.slug}#claims`} className="today-rail-action">
                  {story.status === "보도 상충" ? "서로 다른 근거 읽기" : "정정된 내용 읽기"}
                  <span aria-hidden="true">↗</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="today-reading-heading" className="today-reading-note">
        <h2 id="today-reading-heading" className="today-aside-title">
          근거까지 읽는 뉴스
        </h2>
        <p className="today-aside-description">
          하나의 사건을 여러 출처로 읽습니다. 어떤 보도가 같고, 어디에서 갈리는지 직접 확인하세요.
        </p>
        <p className="today-reading-route">사건 → 주장 → 근거 → 원문</p>
        <a href="#latest-stories" className="today-rail-link">
          최신 사건 살펴보기 <span aria-hidden="true">↗</span>
        </a>
        <Link href="/about" className="today-rail-link">
          Newstrail의 원칙 <span aria-hidden="true">↗</span>
        </Link>
      </section>
    </aside>
  );
}
