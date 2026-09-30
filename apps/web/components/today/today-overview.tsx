/** @jsxImportSource react */
import type { TodayStoryCard } from "@newstrail/db";
import { TOPICS } from "@newstrail/domain/topic";
import { ArrowUpRight, BookOpen, Layers3 } from "lucide-react";
import Link from "next/link";
import { storyCount } from "../../app/copy.ts";

/** 필터·더 보기 전의 발행 목록 집계. 호출부는 라이브 목록만 전달한다. */
export function TodayOverview({ stories }: { stories: readonly TodayStoryCard[] }) {
  const conflicting = stories.filter((story) => story.status === "보도 상충").length;
  const corrected = stories.filter((story) => story.status === "정정됨").length;
  return (
    <aside className="today-aside" aria-label="발행 사건 분석">
      <section className="today-insight" aria-labelledby="today-overview-heading">
        <p className="today-insight-eyebrow">
          <Layers3 size={18} aria-hidden="true" /> 발행 목록 집계
        </p>
        <h2 id="today-overview-heading" className="today-insight-title">
          발행 사건 현황
        </h2>
        <p className="today-insight-description">
          서로 다른 보도와 정정된 내용을, 원문 근거와 함께 살펴보세요.
        </p>
        <dl className="today-statistics">
          <div className="today-statistic">
            <dt>보도 상충</dt>
            <dd>{conflicting}건</dd>
          </div>
          <div className="today-statistic">
            <dt>정정됨</dt>
            <dd>{corrected}건</dd>
          </div>
        </dl>
        <p className="today-insight-scope">전체 발행 사건 {stories.length}건 · 데모 제외</p>
        {stories.length === 0 && (
          <p className="today-insight-description">사건이 발행되면 현황을 보여드립니다.</p>
        )}
      </section>
      <section className="today-coverage" aria-labelledby="today-coverage-heading">
        <h2 id="today-coverage-heading" className="today-aside-title">
          토픽별 사건 분포
        </h2>
        <p className="today-aside-description">전체 발행 목록 기준 · 데모 제외</p>
        <ul className="today-coverage-list">
          {TOPICS.map((topic) => {
            const count = stories.filter((story) => story.topics.includes(topic)).length;
            return (
              <li key={topic} className="today-coverage-item">
                <div className="today-coverage-label">
                  <span>{topic}</span>
                  <strong>{storyCount(count)}</strong>
                </div>
                <span className="today-coverage-track" aria-hidden="true">
                  <span
                    className="today-coverage-bar"
                    style={{
                      width: `${stories.length === 0 ? 0 : (count / stories.length) * 100}%`,
                    }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
        <p className="today-aside-description">
          막대는 전체 사건 중 해당 토픽의 비율입니다. 여러 토픽에 속한 사건은 각 토픽에 포함됩니다.
        </p>
      </section>
      <section className="today-reading-note" aria-labelledby="today-reading-heading">
        <BookOpen size={24} aria-hidden="true" />
        <h2 id="today-reading-heading" className="today-aside-title">
          요약에서 근거까지
        </h2>
        <p className="today-aside-description">
          사건을 열고 주장을 선택하면, 그 문장을 뒷받침하는 원문 구간을 확인할 수 있습니다.
        </p>
        <Link href="/about" className="today-reading-link">
          읽는 방법 <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </section>
    </aside>
  );
}
