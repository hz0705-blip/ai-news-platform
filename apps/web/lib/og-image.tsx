/** @jsxImportSource react */
import { readFile } from "node:fs/promises";
import { ImageResponse } from "next/og";
import type { ReactElement, ReactNode } from "react";
import { DEMO_STORIES, DEMO_TIME, SCREEN_TITLE, SERVICE_NAME, STORY_UPDATED } from "../app/copy.ts";
import { formatAbsolute } from "./format-time.ts";
import { OG_SIZE, type OgStoryCard } from "./share-card.ts";

/**
 * 공유 카드 PNG(스펙 "화면과 경험" 공유 카드). 1200×600, 모든 글자와 강조선은 가운데 800×400 안전 영역 안에 둔다
 * (카카오 2:1 크롭). 지면과 같은 종이·잉크 팔레트와 정적 한글 제목 폰트를 쓴다.
 */
export const OG_SAFE_AREA = { x: 200, y: 100, width: 800, height: 400 } as const;

// ImageResponse는 CSS 변수를 읽지 못하므로 tokens.css의 라이트 팔레트를 대응시킨다.
const COLOR = { background: "#f5f2e9", text: "#252720", muted: "#626459", accent: "#292d24" };
const FONT_FAMILY = "Pretendard";

type Fonts = NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"];

// 경로는 리터럴로 둔다 — 번들러(Turbopack)가 `new URL(리터럴, import.meta.url)`만 자산으로 내보내고 추적한다.
const REGULAR = new URL("../assets/fonts/Pretendard-Regular.otf", import.meta.url);
const BOLD = new URL("../assets/fonts/Pretendard-Bold.otf", import.meta.url);
const DISPLAY = new URL("../assets/fonts/NanumMyeongjo-Bold.ttf", import.meta.url);

let fontsPromise: Promise<Fonts> | undefined;

/** Pretendard Regular·Bold. 프로세스당 한 번 읽고, 실패하면 다음 요청이 다시 읽는다. */
export function loadOgFonts(): Promise<Fonts> {
  fontsPromise ??= Promise.all([readFile(REGULAR), readFile(BOLD), readFile(DISPLAY)]).then(
    ([regular, bold, display]) => [
      { name: FONT_FAMILY, data: regular, weight: 400, style: "normal" },
      { name: FONT_FAMILY, data: bold, weight: 700, style: "normal" },
      { name: "Nanum Myeongjo", data: display, weight: 700, style: "normal" },
    ],
  );
  fontsPromise.catch(() => {
    fontsPromise = undefined;
  });
  return fontsPromise;
}

const clamp = (lines: number) =>
  ({ display: "block", lineClamp: lines, overflow: "hidden", wordBreak: "keep-all" }) as const;

function Frame({ children }: { children?: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        backgroundColor: COLOR.background,
        paddingTop: OG_SAFE_AREA.y,
        paddingLeft: OG_SAFE_AREA.x,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: OG_SAFE_AREA.width,
          height: OG_SAFE_AREA.height,
          overflow: "hidden",
          borderTop: `3px solid ${COLOR.accent}`,
          paddingTop: 16,
          fontFamily: FONT_FAMILY,
          color: COLOR.text,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function StoryCard({ card }: { card: OgStoryCard }) {
  const time = formatAbsolute(card.updatedAt).text;
  return (
    <Frame>
      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 24 }}>
        {card.isDemo ? (
          <div
            style={{
              display: "flex",
              border: `2px dashed ${COLOR.text}`,
              borderRadius: 0,
              padding: "2px 12px",
              fontWeight: 700,
            }}
          >
            {DEMO_STORIES}
          </div>
        ) : null}
        <div style={{ display: "flex", fontWeight: 700 }}>{card.status}</div>
        <div style={{ display: "flex", marginLeft: "auto", fontWeight: 700, color: COLOR.accent }}>
          {SERVICE_NAME}
        </div>
      </div>
      <div
        style={{
          ...clamp(3),
          marginTop: 20,
          fontSize: 50,
          fontFamily: "Nanum Myeongjo",
          fontWeight: 700,
          lineHeight: 1.3,
          flexShrink: 0,
        }}
      >
        {card.title}
      </div>
      <div style={{ ...clamp(2), marginTop: 16, fontSize: 26, lineHeight: 1.45 }}>
        {card.summary}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: "auto",
          justifyContent: "space-between",
          fontSize: 20,
          color: COLOR.muted,
        }}
      >
        <span>{`${card.isDemo ? DEMO_TIME : STORY_UPDATED} ${time}`}</span>
        <span>{SCREEN_TITLE}</span>
      </div>
    </Frame>
  );
}

/** 안전 카드: 서비스 이름과 부제만. 폰트가 없으면 두부를 내지 않도록 글자 없이 배경·강조선만 그린다. */
function SafeCard({ withText }: { withText: boolean }) {
  return (
    <Frame>
      {withText ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            marginTop: "auto",
            marginBottom: "auto",
            fontWeight: 700,
          }}
        >
          <div style={{ display: "flex", fontSize: 32, color: COLOR.accent }}>{SERVICE_NAME}</div>
          <div style={{ display: "flex", fontSize: 56, fontFamily: "Nanum Myeongjo" }}>
            {SCREEN_TITLE}
          </div>
        </div>
      ) : null}
    </Frame>
  );
}

/** 사이트 카드에는 사건 데이터가 없고 URL이 템플릿·폰트 버전마다 바뀌므로 불변 캐시로 둔다. */
const IMMUTABLE = "public, immutable, no-transform, max-age=31536000";
/**
 * 사건 카드와 안전 카드. 사건 카드에는 주장·상태가 그려지고 정정·철회는 과거 개정판 표현까지 즉시 무효화해야 하므로
 * (스펙 "렌더링·캐시") 서버가 되돌릴 수 없는 브라우저·메신저·CDN 캐시는 5분으로 둔다. 긴 캐시는 사건 태그가 붙은
 * `use cache` 데이터(`story-cache.ts`)에만 있고 재검증 라우트가 지운다. 안전 카드는 원인이 풀리면 바뀌어야 한다.
 */
const SHORT = "public, no-transform, max-age=300";

async function png(element: ReactElement, fonts: Fonts | undefined): Promise<ArrayBuffer> {
  // 본문을 끝까지 읽어야 렌더 실패를 여기서 잡을 수 있다(스트림 중간 실패는 200 뒤에 난다).
  return new ImageResponse(element, { ...OG_SIZE, ...(fonts ? { fonts } : {}) }).arrayBuffer();
}

const respond = (body: ArrayBuffer, cacheControl: string) =>
  new Response(body, { headers: { "content-type": "image/png", "cache-control": cacheControl } });

/**
 * 카드 응답. 항상 200 PNG다. 사건 카드와 안전 카드(사건 없음 `undefined`·렌더 실패)는 짧은 캐시로,
 * 사이트 기본 카드(`site`)는 불변 캐시로 낸다. `site`는 사이트 기본 카드다.
 */
export async function ogCardResponse(
  card: OgStoryCard | "site" | undefined,
  fonts: Fonts | undefined,
): Promise<Response> {
  if (card !== undefined && card !== "site" && fonts !== undefined) {
    try {
      return respond(await png(<StoryCard card={card} />, fonts), SHORT);
    } catch {
      // 안전 카드로 내려간다.
    }
  }
  if (fonts !== undefined) {
    try {
      return respond(await png(<SafeCard withText />, fonts), card === "site" ? IMMUTABLE : SHORT);
    } catch {
      // 글자 없는 안전 카드로 내려간다.
    }
  }
  return respond(await png(<SafeCard withText={false} />, undefined), SHORT);
}
