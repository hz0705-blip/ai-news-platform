/** @jsxImportSource react */
import type { ContradictionStatus } from "@newsplatform/domain";
import { Minus, PencilLine, Plus } from "lucide-react";
import type { ReactNode } from "react";
import {
  CHANGE_CLAIM_ADDED,
  CHANGE_CLAIM_MODIFIED,
  CHANGE_CLAIM_REMOVED,
  CHANGES_HEADING,
  CHANGES_INTRO,
  CURRENT_SENTENCE,
  CURRENT_STATUS,
  claimLabel,
  DELETED_WORDS,
  INSERTED_WORDS,
  NO_CHANGES,
  PREVIOUS_SENTENCE,
  PREVIOUS_STATUS,
  revisionLabel,
  STORY_STATUS,
  sourceAdditionCount,
} from "../../app/story/copy.ts";
import { claimHref } from "../../lib/claim-anchor.ts";
import type { ChangeItemView, StoryView, WordDiffSegment } from "../../lib/story-view.ts";
import { StatusBadge } from "../status-badge.tsx";
import { CHANGE_KIND_ICONS, KindLabel } from "./change-kind.tsx";
import { CoverageChart } from "./coverage-chart.tsx";
import { RevisionStrip } from "./revision-strip.tsx";

function ClaimRef({ order }: { order: number | undefined }) {
  return order === undefined ? null : <a href={claimHref(order)}>{claimLabel(order)}</a>;
}

/** 단어 차이 조각. 바뀐 단어는 `<del>`/`<ins>`로 감싸고 스크린리더용 텍스트 대체를 앞에 둔다. */
function DiffText({
  segments,
  mark,
}: {
  segments: readonly WordDiffSegment[];
  mark: "del" | "ins";
}) {
  const Mark = mark;
  return (
    <>
      {segments.map((segment, index) => (
        // 조각은 문장에서 계산한 불변 순서라 위치가 곧 정체성이다.
        // biome-ignore lint/suspicious/noArrayIndexKey: 순서가 바뀌지 않는 불변 목록
        <span key={index}>
          {index === 0 ? "" : " "}
          {segment.changed ? (
            <Mark
              className={mark === "del" ? "line-through decoration-2" : "underline decoration-2"}
            >
              <span className="sr-only">{mark === "del" ? DELETED_WORDS : INSERTED_WORDS} </span>
              {segment.text}
            </Mark>
          ) : (
            segment.text
          )}
        </span>
      ))}
    </>
  );
}

function Sentence({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="m-0">{children}</dd>
    </>
  );
}

function StatusPair({
  previous,
  current,
}: {
  previous: ContradictionStatus;
  current: ContradictionStatus;
}) {
  return (
    <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1">
      <Sentence term={PREVIOUS_STATUS}>
        <StatusBadge status={previous} />
      </Sentence>
      <Sentence term={CURRENT_STATUS}>
        <StatusBadge status={current} />
      </Sentence>
    </dl>
  );
}

function ChangeItem({ item }: { item: ChangeItemView }) {
  switch (item.type) {
    case "주장 추가":
      return (
        <>
          <p className="flex flex-wrap items-center gap-2">
            <KindLabel icon={Plus}>{CHANGE_CLAIM_ADDED}</KindLabel>
            <ClaimRef order={item.claimOrder} />
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <Sentence term={CURRENT_SENTENCE}>{item.currentText}</Sentence>
          </dl>
        </>
      );
    case "주장 삭제":
      return (
        <>
          <p>
            <KindLabel icon={Minus}>{CHANGE_CLAIM_REMOVED}</KindLabel>
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <Sentence term={PREVIOUS_SENTENCE}>{item.previousText}</Sentence>
          </dl>
        </>
      );
    case "주장 수정":
      return (
        <>
          <p className="flex flex-wrap items-center gap-2">
            <KindLabel icon={PencilLine}>{CHANGE_CLAIM_MODIFIED}</KindLabel>
            <ClaimRef order={item.claimOrder} />
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <Sentence term={PREVIOUS_SENTENCE}>
              <DiffText segments={item.previous} mark="del" />
            </Sentence>
            <Sentence term={CURRENT_SENTENCE}>
              <DiffText segments={item.current} mark="ins" />
            </Sentence>
          </dl>
        </>
      );
    case "상충 상태 변화":
      return (
        <>
          <p className="flex flex-wrap items-center gap-2">
            <KindLabel icon={CHANGE_KIND_ICONS["상충 상태 변화"]}>{item.type}</KindLabel>
            {item.claimOrder === undefined ? (
              <span>{STORY_STATUS}</span>
            ) : (
              <ClaimRef order={item.claimOrder} />
            )}
          </p>
          <StatusPair previous={item.previousStatus} current={item.currentStatus} />
        </>
      );
    case "원문 변경":
      return (
        <p className="flex flex-wrap items-center gap-2">
          <KindLabel icon={CHANGE_KIND_ICONS["원문 변경"]}>{item.type}</KindLabel>
          {item.article === undefined ? null : (
            <>
              <span>{item.article.sourceName}</span>
              <a href={item.article.articleUrl} target="_blank" rel="noopener noreferrer" lang="en">
                {item.article.articleTitle}
              </a>
            </>
          )}
        </p>
      );
  }
}

/**
 * 변화 구획: 이 개정판과 직전 개정판 사이 변화, 개정판 이력(띠), 보도량 추이.
 * 주장 변화·상태 변화·원문 변경은 항목별로, 출처 추가는 접어서 개수만 보인다(스펙 "변화 구획").
 */
export function ChangeSection({ view }: { view: StoryView }) {
  const { changes } = view;
  const empty = changes.items.length === 0 && changes.sourceAdditionCount === 0;
  return (
    <section id="changes" aria-labelledby="changes-heading" className="flex flex-col gap-6">
      <h2 id="changes-heading">{CHANGES_HEADING}</h2>
      {empty ? (
        <p>{NO_CHANGES}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-meta text-muted-foreground">
            {revisionLabel(changes.revisionNumber)} · {CHANGES_INTRO}
          </p>
          <ul className="flex flex-col gap-4">
            {changes.items.map((item, index) => (
              <li
                // 변화는 저장 순서대로 한 번만 온다.
                // biome-ignore lint/suspicious/noArrayIndexKey: 순서가 바뀌지 않는 불변 목록
                key={index}
                className="flex flex-col gap-2 rounded-md border border-border p-4"
              >
                <ChangeItem item={item} />
              </li>
            ))}
            {changes.sourceAdditionCount > 0 ? (
              <li className="rounded-md border border-border p-4">
                <KindLabel icon={CHANGE_KIND_ICONS["출처 추가"]}>
                  {sourceAdditionCount(changes.sourceAdditionCount)}
                </KindLabel>
              </li>
            ) : null}
          </ul>
        </div>
      )}
      {view.revisions.length > 0 ? <RevisionStrip revisions={view.revisions} /> : null}
      {view.coverage === undefined ? null : <CoverageChart coverage={view.coverage} />}
    </section>
  );
}
