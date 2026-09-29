/** @jsxImportSource react */
import {
  CHANGE_KIND_NAMES,
  CURRENT_REVISION,
  changeKindCount,
  FIRST_REVISION,
  REVISION_COLUMN,
  REVISION_STRIP_CAPTION,
  REVISION_STRIP_HEADING,
  revisionLabel,
  SHOW_TABLE,
  STORY_UPDATED,
} from "../../app/story/copy.ts";
import { formatAbsolute } from "../../lib/format-time.ts";
import type { RevisionStripItemView } from "../../lib/story-view.ts";
import { CHANGE_KIND_ICONS, KindLabel } from "./change-kind.tsx";

function RevisionLink({ item }: { item: RevisionStripItemView }) {
  return (
    <a href={item.href} aria-current={item.isCurrent ? "page" : undefined}>
      {revisionLabel(item.revisionNumber)}
    </a>
  );
}

function UpdatedTime({ at }: { at: Date }) {
  const time = formatAbsolute(at);
  return <time dateTime={time.dateTime}>{time.text}</time>;
}

/**
 * 개정판 띠: 차트가 아니라 개정판 링크의 순서 목록(발행 순서, 사건 갱신 절대 시각, 변화 종류별 개수, 현재 개정판 표시).
 * 같은 데이터의 표를 `<figure>` 안에서 펼칠 수 있고, 표도 같은 링크를 가진다(스펙 "시각화(1차)").
 */
export function RevisionStrip({ revisions }: { revisions: readonly RevisionStripItemView[] }) {
  // 표 열은 뷰가 정한 종류 순서(`CHANGE_KINDS`)를 따른다. 컴포넌트는 도메인 값을 import하지 않는다(브라우저 번들).
  const kinds = (revisions[0]?.counts ?? []).map((c) => c.kind);
  return (
    <figure aria-labelledby="revision-strip-heading" className="m-0 flex flex-col gap-3">
      <figcaption className="flex flex-col gap-1">
        <h3 id="revision-strip-heading">{REVISION_STRIP_HEADING}</h3>
        <span className="text-meta text-muted-foreground">{REVISION_STRIP_CAPTION}</span>
      </figcaption>
      <ol className="flex flex-col gap-3">
        {revisions.map((item) => {
          const counts = item.counts.filter((c) => c.count > 0);
          return (
            <li
              key={item.id}
              className="flex flex-col gap-1 rounded-md border border-border p-4 data-[current=true]:border-foreground"
              data-current={item.isCurrent}
            >
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <RevisionLink item={item} />
                {item.isCurrent ? <span className="font-semibold">{CURRENT_REVISION}</span> : null}
              </p>
              <p className="text-meta text-muted-foreground">
                <span>{STORY_UPDATED}</span> <UpdatedTime at={item.publishedAt} />
              </p>
              {counts.length === 0 ? (
                item.revisionNumber === 1 ? (
                  <p className="text-meta">{FIRST_REVISION}</p>
                ) : null
              ) : (
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-meta">
                  {counts.map((c) => (
                    <li key={c.kind}>
                      <KindLabel icon={CHANGE_KIND_ICONS[c.kind]}>
                        {changeKindCount(CHANGE_KIND_NAMES[c.kind], c.count)}
                      </KindLabel>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      <details className="flex flex-col gap-2">
        <summary className="cursor-pointer">{SHOW_TABLE}</summary>
        <table className="mt-2 w-full border-collapse text-meta">
          <caption className="sr-only">{REVISION_STRIP_HEADING}</caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="p-2">
                {REVISION_COLUMN}
              </th>
              <th scope="col" className="p-2">
                {STORY_UPDATED}
              </th>
              {kinds.map((kind) => (
                <th key={kind} scope="col" className="p-2">
                  {CHANGE_KIND_NAMES[kind]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {revisions.map((item) => (
              <tr key={item.id} className="border-b border-border">
                <th scope="row" className="p-2 text-left font-normal">
                  <RevisionLink item={item} />
                  {item.isCurrent ? <span className="block">{CURRENT_REVISION}</span> : null}
                </th>
                <td className="p-2">
                  <UpdatedTime at={item.publishedAt} />
                </td>
                {item.counts.map((c) => (
                  <td key={c.kind} className="p-2">
                    {c.count}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
