import type { Metadata } from "next";
import { type ReactElement, Suspense } from "react";
import { SearchScreen } from "../../components/search/search-screen.tsx";
import { SEARCH_TITLE } from "./copy.ts";

export const metadata: Metadata = { title: SEARCH_TITLE };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** 요청 시점 영역(스펙 "렌더링·캐시": 검색은 요청 시점, 캐시 없음). `?q=`만 읽어 화면에 넘긴다. */
async function SearchFromParams({ searchParams }: { searchParams: SearchParams }) {
  const { q } = await searchParams;
  return <SearchScreen initialQuery={typeof q === "string" ? q : ""} />;
}

export default function Page({ searchParams }: { searchParams: SearchParams }): ReactElement {
  return (
    <Suspense fallback={<SearchScreen initialQuery="" />}>
      <SearchFromParams searchParams={searchParams} />
    </Suspense>
  );
}
