import type { Metadata } from "next";
import { DEMO_NOTICE, DEMO_STORIES, SCREEN_TITLE } from "../app/copy.ts";
import type { StoryView } from "./story-view.ts";

/**
 * 공유 카드(OG, 스펙 "화면과 경험")의 URL과 메타데이터. 이미지 URL은 사건·개정판·언어·템플릿 버전·폰트 버전을 담아
 * 개정판마다 바뀐다. 템플릿(`og-image.tsx`)을 바꾸면 템플릿 버전을, 폰트 파일을 바꾸면 폰트 버전을 올린다 —
 * 불변 캐시된 옛 이미지가 새 URL로 대체된다.
 */
export const OG_TEMPLATE_VERSION = 1;
/** `assets/fonts`의 Pretendard 릴리스 버전. */
export const OG_FONT_VERSION = "1.3.9";
export const OG_LANGUAGE = "ko";
export const OG_SIZE = { width: 1200, height: 600 } as const;

/** 마지막 경로 조각: `ko-t1-f1.3.9.png`. */
const CARD_SEGMENT = `${OG_LANGUAGE}-t${OG_TEMPLATE_VERSION}-f${OG_FONT_VERSION}.png`;

/** 경로 조각이 이 앱이 만드는 카드 언어(`ko-…png`)인지. 버전이 옛 값이어도 지금 템플릿으로 그린다. */
export const isCardSegment = (segment: string): boolean =>
  segment.startsWith(`${OG_LANGUAGE}-`) && segment.endsWith(".png");

export const storyOgImagePath = (slug: string, revisionId: string): string =>
  `/og/story/${encodeURIComponent(slug)}/${encodeURIComponent(revisionId)}/${CARD_SEGMENT}`;

/** 사이트 기본 카드이자 안전 카드(사건 없음·데이터·폰트 실패). */
export const SITE_OG_IMAGE_PATH = `/og/site/${CARD_SEGMENT}`;

/** Next는 동적 세그먼트를 인코딩된 채 넘긴다(개정판 식별자에는 `:`가 들어간다). 잘못된 인코딩이면 `undefined`. */
export function decodeSegment(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

/** 카드에 그리는 값. 요약 한 줄은 첫 주장(오늘 화면 카드의 요약과 같다). */
export interface OgStoryCard {
  readonly title: string;
  readonly summary: string;
  readonly status: StoryView["header"]["status"];
  readonly updatedAt: Date;
  readonly isDemo: boolean;
}

export const toOgStoryCard = (view: StoryView): OgStoryCard => ({
  title: view.header.title,
  summary: view.claims[0]?.text ?? "",
  status: view.header.status,
  updatedAt: view.header.updatedAt,
  isDemo: view.header.isDemo,
});

const image = (url: string, alt: string) => ({ url, ...OG_SIZE, alt });

/** 오늘·소개·검색이 쓰는 사이트 기본 카드. */
export const SITE_METADATA: Metadata = {
  title: SCREEN_TITLE,
  openGraph: {
    type: "website",
    siteName: SCREEN_TITLE,
    locale: "ko_KR",
    title: SCREEN_TITLE,
    images: [image(SITE_OG_IMAGE_PATH, SCREEN_TITLE)],
  },
  twitter: { card: "summary_large_image", title: SCREEN_TITLE, images: [SITE_OG_IMAGE_PATH] },
};

/** 사건·개정판 페이지 메타데이터. 데모 사건은 제목·요약에 데모 표기를 유지한다(스펙 "데모 정체성"). */
export function storyMetadata(view: StoryView): Metadata {
  const card = toOgStoryCard(view);
  const title = card.isDemo ? `[${DEMO_STORIES}] ${card.title}` : card.title;
  const description = card.isDemo ? `${DEMO_NOTICE} ${card.summary}` : card.summary;
  const url = storyOgImagePath(view.slug, view.revisionId);
  return {
    title,
    description,
    openGraph: {
      type: "article",
      siteName: SCREEN_TITLE,
      locale: "ko_KR",
      title,
      description,
      images: [image(url, title)],
    },
    twitter: { card: "summary_large_image", title, description, images: [url] },
  };
}
