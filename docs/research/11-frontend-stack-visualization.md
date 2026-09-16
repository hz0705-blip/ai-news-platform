# Frontend foundation and evidence visualisation — issue #11

## 요약

- 기준일은 **2026-09-17**이다. 기존 shadcn/ui + Base UI + Tailwind v4 권고를 유지하며, 색상·화면 디자인은 #12에 맡긴다.[1][3][5]
- **Vitest + Playwright + axe를 확정해도 된다.** Vitest와 Jest 모두 비동기 Server Component 단위 테스트를 지원하지 않으므로 실제 Next.js 경로는 E2E로 검증한다.[48][49]
- 근거 강조는 직접 구현한다. 원문 해시·오프셋 단위·발췌 시작 위치를 검증한 뒤 `<mark>`로 렌더링하고, 잘린 근거를 완전한 근거처럼 표시하지 않는다.[30][31][32]
- 모바일은 접근 가능한 펼침, 데스크톱은 비모달 근거 패널을 사용하되 주장→근거→출처 링크의 키보드 순서를 보존한다.[1][33]
- 지원 하한은 Chromium 111 / Safari·iOS WebKit 16.4 / Firefox 128이다. 이는 라이브러리의 요구 조건이며 카카오톡·네이버 앱 전체의 호환성 인증이 아니다.[7][8][9]
- 현재 두 앱의 엔진 버전은 실기기로 확인하지 못했다. OS·앱·엔진 버전을 함께 기록하는 실기기 검증을 출시 조건으로 남긴다.[10][11][46]
- Pretendard 전체 가변 WOFF2는 이번 다운로드에서 2,057,688바이트였다. 한글 동적 서브셋을 자체 호스팅하고 실제 페이지 전송량을 측정하는 편이 타당하다.[21][24]
- 기사량 차트는 Recharts 3, 개정판 스트립은 네이티브 링크 목록을 권고한다. 두 표현 모두 동일 데이터의 HTML 표를 제공한다.[26][27][28]
- OG 이미지는 한글 TTF/OTF를 명시적으로 넣고 개정판별 URL을 쓴다. 카카오 스크랩은 800×400으로 크롭하며 캐시 삭제 후에도 단말 이미지 캐시가 남을 수 있다.[37][39][40]
- M0에는 Storybook을 넣지 않는다. M1의 상태 픽스처·axe·키보드·200% 확대 검증을 먼저 확보한다.[2][43][52]
- Lighthouse CI는 LCP·CLS·TBT를 검사하고 INP는 실제 상호작용으로 측정한다. 자동 검사 통과만으로 WCAG 2.2 AA 준수를 선언하지 않는다.[42][45][47]

## Scope

**Evidence cut-off and access date: 2026-09-17 (September 2026).** All present-tense external facts below are observations of the cited primary source on this date, not promises about later releases. Historical release dates are identified separately. Recommendations, illustrative code and proposed acceptance checks are engineering judgments grounded in those sources; they are not implemented or measured application results. Findings follow questions **1–8** in the brief. Research priority was testing, evidence offsets, in-app compatibility and accessibility; the full answers are in Findings 8, 5, 1 and 7 respectively.[1][2]

Stack A, Node 24, pnpm, Biome, the five-package boundary, anonymous reading, Rights Tiers and the M0/M1 acceptance criteria are fixed inputs. The current spec and glossary supersede older research where they disagree. This report proposes component and engineering choices only; no palette, new page layout or v2 chart is introduced.[1][2]

Prior work is incorporated rather than repeated: `02-ux.md:168,221,227` supplies the component baseline, `:174` its browser caveat and `:203–206` typography test values; `03-stack.md:84` supplies language/Revision cache separation and `:202` role/label-based E2E selection. This report rechecks their upstream facts and adds implementation boundaries.[3][4]

**Verification limits:** no app implementation, production build, physical KakaoTalk/Naver device session, screen-reader session or share-card publication was run. Public font assets were downloaded to `/dev/null` for byte counts; chart-size evidence is qualified in Findings 4. No credentialed API measurement is necessary for the frontend questions. Device compatibility, page-level bundle sizes, font-induced CLS and production rendering remain acceptance work, not reported passes.[1][2]

## Findings

### 1. shadcn/ui, Base UI, Tailwind v4 and Korean in-app browsers

**Baseline confirmed, 2026-09-17.** The July 2026 shadcn changelog makes Base UI the default for `shadcn init` and new registries; Radix remains supported, with `-b radix` selecting it. Existing Radix projects need not migrate. This is a greenfield repository, so retain the prior Base UI recommendation and pin the CLI and generated components when implementation starts.[3][5]

**Stability is component-specific.** Base UI reached 1.0 on **2025-12-11**; its release index lists **1.8.0 on 2026-09-04**. Accordion, Collapsible, Dialog, Alert Dialog, Popover, Select, Combobox, Tabs, Tooltip and form primitives are documented in the stable library. Drawer became stable in **1.3.0, 2026-03-12**; OTP Field in **1.6.0, 2026-06-18**. Thus the earlier assumption that Drawer is still preview is stale. The 1.8 release still includes focus/accessibility fixes: stable does not mean no regressions.[6]

**Known boundaries:** Base UI is an unstyled primitive library supporting React 17+, not a complete news design system or an accessibility certification. shadcn's Base UI Calendar still uses React DayPicker; its Chart uses Recharts. Do not assume all copied components are Base UI primitives, or convert Radix composition mechanically: inspect the installed component's `render`/composition API and dependencies. For M1, Accordion/Collapsible plus native links/buttons suffice; advanced calendar and combobox work is unnecessary.[6][12][13][14]

**Theme engineering, not theme selection.** Preserve semantic CSS-variable pairs for surfaces/text, focus, borders and charts; expose them through Tailwind's `@theme inline`. shadcn uses OKLCH values and overrides the same tokens under `.dark`. Feed the system colour preference into the theme mechanism before first paint; test both modes. Define an evidence-highlight foreground/background pair without choosing its colours here. A visually uniform OKLCH ramp is not a contrast test.[15][42]

**tweakcn is optional authoring tooling.** Its repository is Apache-2.0, and its code panel exposes Tailwind v3/v4 and colour-format export; selecting v4 can select OKLCH. It can export a starting CSS token file for #12. Do not install the editor in the shipped application or treat its output as a WCAG pass.[16]

#### Concrete engine floors and what is actually known

| Layer, checked 2026-09-17 | Documented engine support | Consequence |
|---|---|---|
| Tailwind v4 | Chrome **111**, Safari **16.4**, Firefox **128**; newer optional utilities can require newer features.[7] | Avoid unsupported optional utilities; transpiling JavaScript cannot supply missing CSS behaviour.[7] |
| Base UI 1.8.0 | Versioned `.browserslistrc` snapshot bottoms out at Chrome/Android Chrome **111**, Firefox **113**, Safari/iOS Safari **16.4**; policy is Baseline Widely Available at the last major release.[8][12] | Baseline support is not a KakaoTalk/Naver device certification.[8][10][11] |
| Next.js 16 | Chrome/Edge **111**, Firefox **111**, Safari **16.4**.[9] | Combined proposed floor: Chromium **111**, Safari/WebKit capability equivalent to **16.4**, Firefox **128**.[7][8][9] |
| KakaoTalk on Android | Kakao's own support explanation describes Chromium-based OS WebView; Chrome documents WebView's Chromium engine and separate app environment.[10][55] | Record installed WebView provider/full version and the actual in-app UA. Chromium **110** is below the floor; **111** is a boundary test, not a guarantee.[7][8][55] |
| KakaoTalk and Naver on iOS | Kakao describes OS-dependent WebView; Naver publishes an iOS UA with `AppleWebKit/605.1.15` and its app token.[10][11] | Test iOS **16.4** as the lower candidate and the owner's current iOS. The UA token **605.1.15** is not a reliable Safari feature version.[11][56] |
| Naver on Android | No September 2026 first-party app-release-to-Chromium-version matrix was verified in this research; the login guide is not such a matrix.[11] | Measure the actual in-app engine. Do not substitute desktop Whale's version or assume the system WebView version is necessarily the embedded engine.[11][55] |

**Answer to the compatibility question: conditional approval, not a blanket yes.** No current physical-device engine versions were observed here, so there is no honest basis to label “KakaoTalk September 2026 = Chromium N” or “Naver September 2026 = Chromium N.” The concrete numbers above are support boundaries. Require a recorded app/OS/engine matrix and the M1 flow on both apps before advertising support. If an essential device is below the floor, choosing Radix or Tailwind v3 alone does not fix Next.js 16's own minimum; the owner must choose a reduced reading fallback, an update/external-browser path where that engine is supported, or a separately scoped legacy-support effort.[7][9][10][11]

**Real-device gate proposal:** on Android record manufacturer/model, OS, KakaoTalk/Naver app version, UA and engine/provider version where inspectable; on iOS record model, OS, app version and UA. Test the oldest supported boundary device and a current device, light/dark, Korean IME, evidence opening, source navigation/back, zoom and later OAuth handoff. Probe `CSS.supports('color', 'oklch(60% 0.1 200)')` and `CSS.supports('color', 'color-mix(in oklab, white, black)')` for diagnostics, then inspect the actual compiled page; feature probes do not certify all CSS/JS. Playwright UA emulation changes reported environment, not the engine or app shell.[7][46][55]

### 2. Next.js 16 rendering and Revision-aware caching

**Choose one caching model explicitly.** Next.js 16 documents opt-in `cacheComponents: true`; `use cache` caches async function/component results, with `cacheLife` and `cacheTag`. Request-specific work belongs outside shared cached scopes and under Suspense where appropriate. For this greenfield application, recommend Cache Components with explicit public data caches; do not mix its semantics with copied route-level `revalidate`/`dynamic` recipes from the previous model.[17][18][20]

| Page | Proposed rendering and cache unit | Client boundary |
|---|---|---|
| Today | Prerendered shell and cached public briefing keyed by language, Topic/filter and publication batch. Invalidate after either daily publication; show the actual successful publication timestamp, including delayed/quota states.[1][17][19] | Topic/filter controls only when interaction needs state; ordinary navigation remains links.[1][17] |
| Story | Server-render published Claim/Evidence DTO for `(storyId, revisionId, language, displayPolicyVersion)`. Cache the mutable latest-Revision lookup separately. Resolve the Revision once for Claims, charts and metadata to avoid mixing revisions.[2][4][18] | Evidence selection/disclosure, MT request control and selected Revision interaction. Initial excerpt slicing/mark markup can run on the server; it does not inherently require hydration.[30][32] |
| Follow | Request-time authenticated data; scope queries to the verified account, keep follows and Last Seen Revision out of shared public output. A public shell may be cached.[2][17][18] | Follow/unfollow controls and account-state transitions; retain server authorization.[2][17] |
| Search | Request-time results for validated query/filters and current corpus; stream the result region. Avoid indefinitely caching arbitrary search queries. Any later bounded cache must also include language and corpus/publication revision.[1][4][17] | Input/submit and pending feedback; preserve a URL-addressable query and browser back behaviour.[1][17] |
| About | Static/server-rendered content, redeployed or invalidated when policy content changes.[1][17] | No client bundle required solely for article text.[17] |

**Tags are invalidation groups, not cache keys.** `use cache` includes serializable arguments in its key; pass language and Revision explicitly. Distinguish immutable Revision content from mutable pointers and delivery permissions. Never serialize full licensed Article bodies into client props or the RSC payload merely to compute a highlight; send only permitted excerpts and their validated local spans.[1][18][30]

**Publication proposal:** commit the new Revision before notifying an authenticated web Route Handler to invalidate `today:<language>` and `story:<id>:latest`. `revalidateTag(tag, 'max')` serves stale content while refreshing on a later request; it is not a push update to open tabs. Use it only where bounded staleness is acceptable. The old one-argument call is deprecated. `updateTag` is for Server Actions; an external worker/webhook needing immediate expiry uses `revalidateTag(tag, { expire: 0 })` in the web process.[19]

**Rights/correction exception:** the spec requires immediate Rights Tier downgrades. Immutable content does not imply immutable display authorization. Proposal: recheck the current display policy at delivery, invalidate every affected historical/latest DTO and CDN representation, and include a policy version in newly constructed keys. A policy-version key alone leaves old URLs/cached HTML readable. Use immediate expiry for corrections/withdrawals rather than ordinary stale-while-revalidate; validate this across replicas/CDN once hosting is decided.[2][4][19]

Stream slow independent sections behind stable-height fallbacks; do not move already focused controls when evidence arrives. Public HTML/metadata, permitted evidence and chart tables should remain server-rendered. Initial highlights need no client search library; interactive selection state is the small client island. Cross-replica cache storage and invalidation are deployment acceptance questions, not settled by the API syntax.[17][18][30][33]

### 3. Korean typography and font delivery

The previously proposed **Pretendard + system fallbacks**, **17–18 px**, Korean **1.7–1.8** line height and `keep-all` experiment remain test inputs, not newly established usability facts. Pretendard supports variable and dynamic-subset distributions under SIL OFL; **Pretendard Std targets Latin**, so it is not a replacement for the Korean family.[3][21]

| Option | Verified capability / proposed trade-off as of 2026-09-17 |
|---|---|
| Pretendard Korean variable subsets | Retain as the baseline; distribution includes `unicode-range` subsets and variable weights. Self-host the pinned CSS/font assets with licence notices.[21][24] |
| Noto Sans KR | Noto CJK provides Korean-specific families, static and variable formats. Viable alternative when its coverage/metrics suit the content; this research did not establish a page-level speed advantage over Pretendard.[22] |
| System fonts | No downloaded webfont bytes when using only installed fonts, but rendering/metrics depend on the platform. Keep `system-ui`, `Apple SD Gothic Neo`, `Malgun Gothic`, `sans-serif` fallbacks and verify layout on actual devices.[3][23] |

**Measured asset bytes, 2026-09-17:** HTTP GET of the author's **v1.3.9** WOFF2 assets, using `curl -L --fail -o /dev/null -w '%{http_code} %{size_download}'`, returned HTTP 200: full `PretendardVariable.woff2` **2,057,688 B**; subset **90: 20,852 B**; subset **91: 37,996 B**. These are downloaded asset bytes, not LCP, a Korean page's total font transfer or proof that only two subsets suffice. The CSS has separate Unicode ranges; page text determines additional downloads. No cross-family speed percentage is claimed.[24]

**Loading recommendation:** self-host the complete upstream dynamic-subset CSS plus its referenced WOFF2 chunks, retain the ranges and `font-display: swap`, and avoid preloading every chunk. `next/font/local` is valid for one local full font or deliberately constructed subset, with fallback/preload controls, but it does not automatically turn an arbitrary full Korean file into the upstream multi-range distribution. Keep a single family for Korean Claims and English Evidence initially. Compare cold-cache page bytes and CLS on representative Story text before choosing preload/fallback metric overrides.[21][23][25]

Use `lang="ko"` for Claims and `lang="en"` for original excerpts; MT is a separate labelled Korean rendering with a different cache entry. Test `word-break: keep-all; overflow-wrap: anywhere` on Korean prose and normal English wrapping, including long names/URLs at 200% text size. Keep the prior measure candidates (English 60–72 `ch`, Korean 32–40 `em`) as experiments; `ch` is not a Hangul character count. Korean line breaking admits character- and word-based practices, so no universal keep-all mandate follows.[1][3][57][58]

### 4. Accessible charts: full comparison

The brief requires Article volume over time and a Revision strip, with table alternatives. The library decision should cover the volume chart; a Revision strip is primarily navigation among discrete published Revisions and need not incur a chart dependency. All options still require a meaningful summary and equivalent data/actions outside pointer-only graphics.[1][2][28]

**Release/compatibility snapshot, 2026-09-17:** publisher registry metadata lists Recharts **3.10.1 (2026-07-25, MIT)**, visx **4.0.0 (2026-06-11, MIT)**, Observable Plot **0.6.17 (2025-02-14, ISC)**, D3 **7.9.0 (2024-03-12, ISC)**, Nivo Line **0.99.0 (2025-05-23, MIT)** and Chart.js **4.5.1 (2025-10-13, MIT)**. visx v4 explicitly supports React 18/19; the old React-19-incompatibility objection is obsolete. These release facts do not establish application-level compatibility without a pinned build.[74][75]

| Library | SSR / Next.js 16 integration | Accessibility responsibility | CSS-variable theming / solo-dev cost |
|---|---|---|---|
| **Recharts 3** | React/SVG with deterministic dimensions. `ResponsiveContainer` defaults to nonpositive initial dimensions and can omit the chart from initial server HTML; supply explicit dimensions or a deliberate `initialDimension`, stable IDs and disabled initial animation.[27] | v3 enables `accessibilityLayer` by default: Tab enters the chart, Left/Right visits points, and the default tooltip announces updates. Its application role and custom tooltip changes still need AT testing; preserve the table.[26] | SVG fill/stroke can use semantic CSS variables; custom tooltip/axes must use the same tokens. Least custom chart behaviour to own for this case, in this report's judgment.[14][26] |
| **visx** | Modular React/SVG primitives can generate deterministic server markup; parent measurement and interactive tooltips require client behaviour. Use only selected packages, not a whole visualisation toolkit.[75] | A toolkit for building charts, not a finished keyboard/screen-reader interaction contract; the app owns that work.[75] | Direct SVG props fit CSS tokens. More code/control, including accessibility, than this one volume chart needs.[75] |
| **Observable Plot** | Official server example supplies a DOM `document` such as JSDOM and serializes SVG; not native React chart JSX. Server-only generation can avoid shipping Plot to the client.[76] | Supports plot/mark `ariaLabel`, `ariaDescription` and decorative `ariaHidden`; these are not a complete keyboard point-navigation system.[77] | `currentColor`, styles and classes fit static charts; adding React interaction requires extra integration.[78] |
| **D3 direct** | Pure scales/shapes can feed React-owned SVG on the server. DOM-mutating selection/axis/transition code needs an isolated boundary instead of competing with React.[79] | Author keyboard navigation, focus and descriptions yourself; a table-first static chart is simpler than a custom interactive chart.[28][79] | Maximum control through SVG/CSS, but more ownership of axes, formatting and interaction. Import specific modules.[79] |
| **Nivo Line** | SVG/HTML implementations support SSR; canvas variants differ. Fixed dimensions are needed for deterministic SSR; responsive parents must have a usable height.[80] | Line exposes ARIA and `isFocusable`/`pointAriaLabel`; enable and verify these rather than assuming accessible defaults.[81] | Theme object plus separate colour props. SVG values may use CSS tokens; colour transformations/canvas need concrete values. More machinery than needed for the two v1 representations.[82] |
| **Chart.js** | Browser canvas; Node image generation requires a canvas implementation such as node-canvas/skia-canvas. A server PNG is not an interactive or semantically structured chart.[83] | Canvas content is not inherently available to screen readers; author ARIA/fallback HTML and any keyboard access.[84] | Resolve CSS variables to concrete canvas colours and redraw on theme changes; selective controller/element registration reduces shipped code.[85] |

#### Size evidence: what the numbers do and do not show

**No comparable production-route bundle was measured.** The repository has no installed chart fixture/build harness, and this task authorizes only the research Markdown file. The following are actual publisher-registry `dist.unpackedSize` values read on 2026-09-17: they include distributed files such as types/maps/build variants and **exclude transitive dependencies**. They are not browser transfer, gzip size or a valid cross-library size ranking.[2][74]

| Exact package | Registry unpacked bytes | Production route gzip delta |
|---|---:|---|
| `recharts@3.10.1` | 7,452,998 | Not measured.[74] |
| `@visx/shape@4.0.0` | 226,827 | Not measured.[74] |
| `@visx/scale@4.0.0` | 139,031 | Not measured.[74] |
| `@visx/axis@4.0.0` | 56,155 | Not measured.[74] |
| `@observablehq/plot@0.6.17` | 1,526,486 | Not measured.[74] |
| `d3@7.9.0` | 871,285 | Not measured.[74] |
| `@nivo/line@0.99.0` | 371,442 | Not measured.[74] |
| `chart.js@4.5.1` | 6,178,899 | Not measured.[74] |

Reproduction: fetch `https://registry.npmjs.org/<package>` and read `dist-tags.latest`, `time[version]`, `versions[version].license` and `versions[version].dist.unpackedSize`; exact-version URLs in [74] reproduce size/licence metadata. No third-party bundle-estimator figures are substituted for a Next production build.[74]

The Chart.js maintainer's worked Parcel example reports **265.48 KB → 208.66 KB**, plus a 932-byte secondary chunk, after selective registration. Those are that example's build outputs, not this application's gzip cost. D3/Plot used exclusively to generate static server SVG can contribute **zero chart-library JavaScript to the browser by construction**, but the SVG/HTML still costs bytes; this is an architectural inference, not a measured fixture.[76][79][85][86]

**Decision:** refute the visx-first prior for this solo-developer scope on engineering cost, while leaving its bundle advantage **unproven**. Prefer Recharts 3 for the volume chart, with fixed initial geometry, no animation by default and an HTML table. Use a native ordered list of Revision links, timestamps and textual Change markers for the Revision strip. If the production chart payload breaks the measured page budget, a static server-generated SVG is a credible next choice; do not switch libraries based on unpacked package sizes.[1][26][27][28][75]

**Table-fallback pattern proposal:** use one server-produced data array for graphic and table. A `<figure>` has a short factual `<figcaption>` and a visible “View data table” disclosure/link. The table is real HTML, server-rendered even if a client chart fails, with `<caption>`, `<thead>`, column `<th scope="col">` and date/Revision row headers. If disclosure hides it, reveal it with a native keyboard-operable control; do not provide it only as an image or hover tooltip.[28][33]

For **volume**, columns are bucket start/end in an explicitly named timezone and Article count. Show zero for a known empty bucket; use a labelled unavailable value for missing data. State counting semantics: distinct Article IDs assigned to this Story, binned by the chosen published/collected timestamp. For **Revisions**, columns are Revision identifier, timestamp, the four permitted Change types/counts, and an ordinary link to that Revision/Changes section; `aria-current` identifies the current destination where appropriate. The table must retain every action exposed by the strip. These are proposed domain-preserving representations, not new product features.[1][2][28]

Do not create dozens of unexplained Tab stops on static bars. A static SVG can have a title/description and table reference; interactive data must also be reachable via keyboard controls or the table. Honour reduced motion by disabling chart animation and smooth scrolling. Verify contrast and meaning in both themes without encoding Change types solely by colour.[28][42][46]

### 5. Evidence highlighting and textual Changes

#### Read-only rendering, not an annotation editor

Recommend a small owned renderer for **validated offsets → escaped React text nodes → `<mark>`**. The Microsoft annotation project was archived **2024-02-16**; `react-text-annotate` is an interactive selection tool and its repository does not establish present Next.js 16 compatibility. The pre-scan's exact “last npm publication around 2020” was not independently confirmed, so do not repeat it as fact. Neither editor is needed to display prevalidated Evidence.[29][32][59]

`<mark>` expresses relevant text, but screen readers do not ordinarily announce its presence. The UI must identify the supporting range beyond colour alone: e.g. a short explanation plus visually hidden “Evidence begins/ends” text around the marked segment. Keep the quotation itself intact and give the containing excerpt `lang="en"`. The markers explain selection, not model certainty.[32][42]

#### Proposed offset contract for M1

**Proposal, not an existing schema:** keep `articleSnapshotId`/canonical-text hash, `normalizationVersion`, `offsetUnit`, half-open `start/end`, exact selected text and Claim/Evidence IDs. Choose **UTF-16 code units** for the internal TypeScript contract so `String.slice` has explicit semantics; validate integer bounds and boundaries. W3C TextPositionSelector counts Unicode code points, so an exported/imported W3C selector needs conversion. Never call a code-unit contract a W3C character selector without that conversion.[2][30][31]

Canonicalization must precede span extraction and be identical during validation/rendering: HTML entity decoding, whitespace/newline handling and Unicode normalization cannot change afterward. Bind Evidence to the exact Article snapshot used by that Story Revision. Reject stale hashes or a mismatch between the selected slice and stored exact text. Do not relocate a repeated quotation with `indexOf`, or use fuzzy matching to make the deterministic span gate pass.[2][30][31]

The server produces a permitted **contiguous** 1–2-sentence excerpt window `[excerptStart, excerptEnd)` in the same offset space. For a stored Evidence range `[start, end)`, local offsets are `start - excerptStart` and `end - excerptStart` **only if the entire range is contained**. Put ellipsis indicators outside the indexed excerpt; they are presentation, not canonical text.[1][30][31]

The following illustrative pure function makes the arithmetic and failure states reviewable. It is not repository implementation or a claim that tests were run; hash/normalization validation and Unicode boundary checks must happen before it is called.[30][31]

```ts
type Span = { start: number; end: number };
type Window = { start: number; end: number; text: string };
type Result =
  | { kind: "complete"; before: string; evidence: string; after: string }
  | { kind: "outside" | "partial" | "invalid" };

function splitEvidence(window: Window, span: Span, exact: string): Result {
  const valid = [window.start, window.end, span.start, span.end]
    .every(Number.isSafeInteger);
  if (!valid || window.start < 0 || span.start < 0 ||
      window.end < window.start || span.end <= span.start ||
      window.text.length !== window.end - window.start) {
    return { kind: "invalid" };
  }
  if (span.end <= window.start || span.start >= window.end) {
    return { kind: "outside" };
  }
  if (span.start < window.start || span.end > window.end) {
    return { kind: "partial" };
  }
  const a = span.start - window.start;
  const b = span.end - window.start;
  if (window.text.slice(a, b) !== exact) return { kind: "invalid" };
  return {
    kind: "complete",
    before: window.text.slice(0, a),
    evidence: window.text.slice(a, b),
    after: window.text.slice(b),
  };
}
```

**Worked arithmetic:** canonical range `[120,148)` inside excerpt `[100,180)` becomes `[20,48)`. If the excerpt is shortened to `[130,180)`, the range is partial; `Math.max(0, start-excerptStart)` would conceal the missing prefix. Proposal: regenerate an allowed sentence window containing the complete span; if the Rights Tier or excerpt limit prevents that, show an explicit unavailable/truncated-evidence state plus Source name/link, and never represent the clipped fragment as complete support. Do not send the omitted Article body to the browser.[1][30][31]

For **discontinuous excerpts**, represent each segment with its own canonical interval and map independently; do not treat concatenated segments plus ellipses as one continuous window. For multiple/overlapping spans in one excerpt, sort all local boundaries and render disjoint text segments with the corresponding Evidence IDs; keep Claim-to-Evidence associations separately instead of nesting overlapping marks. MT never reuses English offsets; it is a separately cached labelled text result.[1][30]

**Proposed meaningful tests:** start/end boundaries; empty/reversed/noninteger offsets; entirely outside/partially intersecting windows; repeated exact phrases; emoji before a span; decomposed accents; CRLF/entity normalization; overlapping spans; changed snapshot hash; Rights Tier downgrade; and multiple Evidence items for one Claim. Assert selected text and associations, not a component's private state. These cases test the offset contract and the spec's deterministic gate.[2][30][31]

#### Claim → excerpt → Source: responsive interaction semantics

| Context | Proposed behaviour and accessibility contract |
|---|---|
| Mobile accordion | Each Claim has a named Evidence button with count, stable `id`, `aria-expanded` and `aria-controls`. Enter/Space toggles it. Put multiple Evidence entries in a list, each with Source name, original-language excerpt and descriptive original-Article link. Keep focus on the trigger when merely expanding; the next Tab reaches relevant controls/links.[1][33] |
| Desktop evidence panel | A labelled **nonmodal** section/aside, not `role="dialog"`, with no focus trap. Selection can retain trigger focus; an explicit “Go to evidence” action moves focus to the panel heading (`tabIndex={-1}`), and “Return to Claim” restores it. A concise polite status identifies the selected Claim rather than re-announcing the whole excerpt. These are project interaction proposals.[33][42] |
| Responsive transition | Preserve the same Claim/Evidence IDs and selection state. Prefer one logical accessible tree; if separate responsive renderings are unavoidable, hide the inactive tree fully, give IDs unique values and repair focus before unmounting. Do not leave duplicate visible-to-AT links or CSS visual order that contradicts keyboard order.[33][42] |
| One Claim, several Sources | Label entries individually; retain Source links even when no highlight can be safely rendered. Never make hovering the only route to Evidence; avoid nested buttons/links inside a clickable Claim container.[1][33][42] |
| Streaming/loading/error | Stable control names, `aria-busy` on the loading region, one status announcement on completion, explicit retry on error. A failed MT request leaves the English original usable. An unavailable Evidence state must not silently attach another Article's span.[1][2][42] |

Avoid a generic quotation's `aria-label` replacing the actual text. If hidden boundary markers are used, test verbosity in VoiceOver and TalkBack; keep the full original readable in sequence. The source link should identify the Source/Article and any new-window behaviour. Initial `<mark>` rendering belongs on the server; client state only changes the selected Claim, disclosure or requested translation.[1][32][33]

#### jsdiff for the Changes section

**Recommend `diff` (jsdiff, BSD-3-Clause), computed server-side**, to generate presentation tokens for an already determined Claim Change. `diffWords` accepts `Intl.Segmenter`; a Korean word segmenter is preferable to assuming Latin regex tokenization works for Korean. Native segmentation can vary across runtimes, so compute on the pinned server runtime and serialize tokens, or pin a segmenter polyfill. Use `diffWordsWithSpace` where exact whitespace differences matter.[34]

Render tokens with owned semantic `<ins>`/`<del>` styling and explicit “Previous”/“Current” text alternatives, rather than relying on colours or screen readers announcing the tags. `react-diff-viewer-continued` is MIT and offers a larger code-diff UI with Emotion styling; that is avoidable scope for short Korean Claims. A word diff must never decide whether a semantic Change exists: the glossary/spec excludes meaning-preserving rephrasing from Changes.[2][34][35]

### 6. OG cards: Korean fonts and scrapers

**ImageResponse facts, checked 2026-09-17:** `next/og` converts JSX through Satori/Resvg into PNG. It supports a CSS subset, not normal browser layout; `display: grid` is unsupported. Its documented bundled-asset limit is **500 KB**, including fonts, images, JSX and CSS. TTF/OTF/WOFF are supported; WOFF2 is not. This is a generation bundle constraint, not the output PNG file-size limit.[37][38]

**Korean font proposal:** load a pinned Korean-capable **static TTF/OTF** as an `ArrayBuffer` and pass an explicit font name, weight and style in `ImageResponse` options. Browser `next/font` CSS and Pretendard Std do not provide Korean glyph data to Satori. Use a complete appropriately licensed font fetched from a controlled origin at generation time, or a properly generated subset covering every character in that card; cache the font buffer and generated PNG. Do not embed the 2 MB browser WOFF2. Verify rare Hangul, punctuation and Latin names in the generated bitmap; include a safe fallback card for font/data failure.[21][24][37][38]

Proposed image identity: `(storyId, revisionId, language, cardTemplateVersion, fontVersion)` in the URL/cache key, with a stable Story URL and metadata identifying the selected published Revision. Pre-generate at publication when practical to reduce scraper cold-start work. A new Revision gets a new image URL; existing chat messages need not update automatically.[4][37][40]

| Platform | Verified requirements and proposed handling |
|---|---|
| KakaoTalk URL preview | First-party FAQ requires accessible **200 HTML**, OG tags in the returned source, permitted ports **80/443**, and accessible JPG/JPEG/PNG. A different `og:url` can cause that URL to be scraped. Scraper UA includes `facebookexternalhit/1.1; kakaotalk-scrap/1.0`. Return metadata without client execution and keep canonical/shared URLs consistent.[39] |
| Kakao image sizing/cache | Official staff guidance says optimized/cropped to **800×400, 2:1**; it does **not** say every larger input is rejected. Proposal: generate **1200×600 PNG** for the common card and test the crop. Use the current **Sharing Debugger** at `https://developers.kakao.com/tool/debugger/sharing`; the tool requires login. Device image caches can outlive server cache clearing, so change the image URL with the Revision.[39][40] |
| X/Twitter | Next.js supports `twitter.card: 'summary_large_image'`, title/description/image/alt metadata. Emit these alongside OG. The old X large-image specification URL redirected to the general developer overview during this research; therefore historical **5 MB / 300×157 / 4096×4096** limits are **not September-2026-verified requirements here**. Proposal: reuse a compact 1200×600 PNG, target under 1 MB as a project budget, and inspect an actual X preview before release.[36][60] |
| Slack | `Slackbot-LinkExpanding` reads oEmbed, Twitter Card and OG tags using partial/Range requests and fetches referenced media; official robot guidance describes roughly **30-minute** URL caching. Put metadata early in HTML and allow image fetches. Classic unfurling needs no custom Slack app; no current universal pixel/file-size ceiling was verified from these docs.[41][61] |

**Next.js streaming metadata trap:** `htmlLimitedBots` causes blocking metadata for matching UAs. In inspected **Next.js v16.3.5** source, `facebookexternalhit`, `Twitterbot` and `Slackbot` are present, so Kakao's documented combined UA already matches. Verify the pinned version's actual initial response with all three UAs. A custom regex replaces the default list; do not add only `kakaotalk` and accidentally remove other bots. The alternative `/.*/` disables metadata streaming globally and has a latency trade-off.[39][62][63]

**Proposed verification, not performed:** fetch canonical Story HTML with scraper UAs; check initial head tags, absolute HTTPS image URL, MIME/200 response and no auth/WAF challenge; open the PNG to inspect Korean glyphs; then inspect actual Kakao/X/Slack previews. Cache-clearing tools do not replace verifying that the metadata and image refer to the same Revision.[37][39][40][41]

### 7. Accessibility tooling, Lighthouse and in-app acceptance

#### axe-core in Playwright

Add `@axe-core/playwright` as a web-app dev dependency beside `@playwright/test`. The current Playwright guide uses `AxeBuilder`; axe's API lists **`wcag22aa`** alongside earlier A/AA tags. Scan the rendered state after interactions; hidden Evidence panels cannot be validated by scanning only the initial collapsed page. Automated findings must be supplemented by keyboard and assistive-technology assessment.[43][44]

Illustrative M1 test fragment (English accessible names are placeholders for the app's Korean labels). The page/fixture route and controls below are proposed test contracts, not existing implementation.[2][33][43][44]

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('Claim evidence remains accessible when opened', async ({ page }) => {
  await page.goto('/demo/stories/conflicting-reports');
  await page.getByRole('button', { name: 'Evidence for Claim 1' }).click();
  await expect(page.getByRole('link', { name: 'Read original Article' }))
    .toBeVisible();
  const report = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(report.violations).toEqual([]);
});
```

**Proposed gate:** no violations from the chosen A/AA rules, with every `incomplete` finding reviewed and recorded; no blanket exclusions or disabling contrast checks to make CI pass. Repeat on light/dark and narrow/wide states, open dialogs/disclosures and the loading/empty/error/quota states. Keep keyboard walkthrough separate: Tab/Shift+Tab, Enter/Space, Escape only where the widget defines it, visible/unobscured focus, source navigation and return to Claim. An axe pass is evidence, not a WCAG conformance certificate.[2][42][43][44]

**Static checking:** `eslint-plugin-jsx-a11y` checks JSX patterns and supplies configurable component mappings; it does not inspect final layout or runtime states. This repository already chose **Biome**. Enable/review Biome's equivalent accessibility rules first; its rule-source table maps many jsx-a11y rules. Do not add a second whole-project linter automatically. If a concrete missing rule justifies a narrowly scoped ESLint pass, record it as an implementation proposal. Next.js 16 removed `next lint`; lint must be an explicit command.[2][50][51][64]

#### Reduced motion, zoom and environment matrix

Use Playwright `colorScheme` and `reducedMotion` emulation for repeatable theme/motion assertions. With reduced motion, assert that disclosure content is usable immediately, chart animation is disabled and focus navigation does not depend on a transition. Do not infer compliance from the media query being present.[42][46]

Manually test actual browser **200% page zoom** and text-only enlargement where available, preserving all Evidence text, controls and Source links. Also test **320 CSS-pixel reflow** (the separate 400%-zoom equivalent at a 1280-pixel initial viewport). Increasing `deviceScaleFactor`, taking a higher-density screenshot or applying a transform is not the same test. Narrow Playwright viewports are useful regression coverage but do not replace browser zoom or OS text-size behaviour.[46][65][66]

Minimum proposed release matrix: desktop Chromium + Firefox + WebKit automated core flow, desktop keyboard/200% zoom, iOS VoiceOver + KakaoTalk/Naver manual reading flow, and Android TalkBack + KakaoTalk/Naver manual reading flow. Use one recorded oldest-supported and one current device configuration per mobile OS where obtainable. Playwright WebKit is not the actual iOS app's WebView. Report any missing device cell as unverified instead of substituting a spoofed UA result.[10][11][46][55]

#### Lighthouse CI budgets versus field Web Vitals

Google's current good-experience thresholds are **LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1 at the 75th percentile**, evaluated separately for mobile/desktop. Ordinary Lighthouse navigation has no user interaction and cannot establish INP. TBT is a useful lab responsiveness budget, not a renamed INP or a field guarantee.[45][47]

| Check | Proposed initial gate, 2026-09-17 | Evidence interpretation |
|---|---|---|
| Lighthouse CI | Production build; deterministic Demo Story, Today and Search fixtures; three runs under a pinned Chrome/runner/mobile profile. Median LCP **≤2500 ms**, CLS **≤0.1**, TBT **≤200 ms**.[45][47][67] | Project budgets; these are not measured repository scores.[2][67] |
| Category scores | Performance **≥0.90** initially advisory; accessibility **1.00** for applicable automated audits, with manual checks tracked separately.[43][47][67] | Category score does not replace metric budgets or certify AA.[42][43][47] |
| INP | Instrument actual interactions/field sessions with `web-vitals`; target p75 **≤200 ms** for supported users. Exercise evidence toggles, Revision selection and Korean search.[1][45] | No “INP passed” from LHCI alone; report sample count and segment, especially with low portfolio traffic.[45] |

Example LHCI assertion values are `largest-contentful-paint: ['error', {maxNumericValue: 2500, aggregationMethod: 'median'}]`, `cumulative-layout-shift: ['error', {maxNumericValue: 0.1, aggregationMethod: 'median'}]`, and `total-blocking-time: ['error', {maxNumericValue: 200, aggregationMethod: 'median'}]`. Pin runner conditions and inspect failures; do not repeatedly rerun until one lucky score passes.[67]

### 8. Testing stack: Vitest, Jest, Playwright and component states

**Confirm the spec's Vitest + Playwright + axe choice.** Next.js's Vitest and Jest guides, both dated **2026-08-25**, explicitly defer async Server Components to E2E tests. Jest is not a solution to that limitation. Both can test synchronous Server/Client Components; a successful unit render does not validate Next.js caching, routing or server boundaries.[2][48][49]

| Question | Vitest | Jest | Decision for this repository |
|---|---|---|---|
| Framework integration | Official Next guide uses React plugin, jsdom and TS-path support.[48] | `next/jest` supplies Next compiler transforms and style/image/font mocks.[49] | Vitest is compatible; keep it unless an actual required transform fails.[48][49] |
| Async RSC, streaming, cache invalidation | Not supported as ordinary component unit tests.[48] | Same limitation.[49] | Production Next server + Playwright.[53] |
| TypeScript/package tests | Separate Vitest configuration, Node environment for pure/server logic and jsdom for DOM rendering.[48][54] | Available, with its own transform/configuration.[49] | One Vitest runner across the five packages, per-package environments.[2][54] |
| Next dev/build uses Turbopack | Vitest has its own Vite-based test pipeline.[54] | Jest uses its configured transform.[49] | Different test bundler is not a Next incompatibility; preserve production-build E2E coverage.[53][64] |

**M0 minimum proposal:** pin the chosen Vitest/Vite/React test packages in the pnpm lockfile; run a real small domain-contract test with `vitest run`, plus TypeScript and Biome. The current Vitest guide requires **Node ≥22.12 and Vite ≥6.4**; project Node 24 clears that Node floor. Check package peer dependencies when pinning; this report is documentation compatibility research, not an installation/build verification. Never use “no tests” as the M0 passing result.[2][54]

**M1 test allocation proposal:** Vitest covers offset normalization/mapping, domain rules and observable mapper/replay boundaries; Testing Library covers disclosure labels and state transitions in synchronous components. Playwright runs against a production build with Demo Stories in the database, exercising anonymous Claim→English Evidence→Source navigation, status labels, narrow/wide layouts, axe and keyboard. Use role/label locators as already recommended, and stored fixtures rather than paid live model calls.[2][4][43][48][53]

#### Is Storybook worth it now?

**Defer it from M0/M1.** Storybook's currently recommended Next framework is `@storybook/nextjs-vite` (documented requirements Next ≥14.1, Vite ≥5), with a Vitest addon and accessibility tests. Its RSC support remains labelled experimental, and its font integration does not reproduce all Next font-loading/fallback options. It can be valuable for a growing reusable component catalogue, but it is not proof of the actual Next page's loading/caching/font behaviour.[52][68]

For a solo developer and four required state families, start with typed fixture data feeding the real Story/Today views and a development/test-only state gallery, excluded from public production routing. Test the same fixtures via Playwright. This avoids maintaining a second rendering harness before the core Story flow works; revisit Storybook when several reusable widgets need independent interaction documentation or #12's design iteration makes the gallery cumbersome. Vitest Browser Mode is another option for isolated DOM components, but adding it alongside existing E2E is not necessary for M1.[1][2][52][54]

| State fixture | Proposed user-observable assertion |
|---|---|
| Loading | Stable placeholder size, meaningful status, busy region eventually resolves, no focus loss; reduced-motion mode has no required shimmer/animation.[42][43][46] |
| Empty | Explicit no-results/no-followed-Stories text and useful next action; no fake zero-valued evidence/chart data.[1][2] |
| Error | Named retry/back action, English evidence remains readable if MT alone fails, loading is not permanent.[1][2] |
| Quota reached | Last successful publication time and next scheduled processing time remain visible; existing reading works. Do not model the pipeline's daily spending cap as a reader paywall or a transient HTTP error.[1][2] |

**Budget visual regression:** use Playwright `toHaveScreenshot` for a small set of those deterministic views with fixed clock/data, installed Korean fonts, identical OS/browser build and viewport, and animations disabled. Wait for fonts and loaded content; mask only genuinely irrelevant dynamic fields. Review baseline changes rather than autoaccepting them. Screenshots catch appearance changes, while role/keyboard/axe assertions catch different failures. Local/CI screenshots need no paid visual-regression service, though CI storage/runtime still costs resources.[46][69]

## Options & trade-offs

All judgments below are recommendations dated **2026-09-17**, retaining the fixed Stack A and prior greenfield baseline.[1][3]

| Component foundation | Relevant verified capability | Solo-developer trade-off / recommendation |
|---|---|---|
| **shadcn + Base UI + Tailwind v4** | Default new-project base; editable component code; unstyled accessible primitives.[5][12] | **Keep.** Own a small set of wrappers and validate in-app behaviour; no need to design a full system now.[1][5] |
| React Aria Components | Adobe supplies accessible, internationalised components and interaction behaviours.[70] | Strong alternative if complex internationalised selection/date widgets dominate; that scope does not justify switching this baseline.[1][70] |
| Ark UI | Headless components across React and other frameworks, with state-machine-based behaviour.[71] | Worth consideration for complex cross-framework widget reuse; adds no demonstrated advantage for this React-only reading flow.[1][71] |
| Park UI | Components built on Ark UI and **Panda CSS**.[72] | Adds a different styling system to the existing Tailwind choice; not the lowest-maintenance baseline here.[3][72] |
| Mantine | Broad component suite with documented Next App Router integration, provider/styles and client component boundaries.[73] | Good for a component-heavy application accepting its theming system; less reason to adopt it for a small bespoke evidence reader.[1][73] |
| shadcn + Radix | Still supported; no compulsory migration.[5] | Keep if already established elsewhere; not a compatibility shortcut for unsupported CSS/Next engines.[7][9] |

| Engineering decision | Preferred option | Alternative and cost |
|---|---|---|
| Evidence rendering | Owned offset renderer, native semantics, Base UI disclosure.[30][32][33] | Annotation editor increases scope without proving stored-span correctness.[29][59] |
| Claim text diff | Server-side jsdiff tokens; reuse app CSS variables.[34] | Full diff viewer brings code-review UI and Emotion styling.[35] |
| Component states | Real-page fixture gallery + Playwright initially.[2][69] | Storybook adds isolation/catalogue value once its maintenance pays off.[52][68] |
| Web font | Self-host Pretendard dynamic subsets.[21][24] | Full `next/font/local` is simpler but downloads a large full asset; CDN introduces another origin; system-only has no font download but differing platform metrics.[23][25] |
| Legacy in-app support | Verify the combined floor on real devices.[7][8][9] | Broader support requires explicit engineering scope; selecting a different primitive alone does not lower the whole stack's floor.[7][9] |

## Recommendation

**Proposals for Claude's implementation tickets, 2026-09-17:** preserve the baseline and spend M0/M1 effort on the observable Claim→Evidence→Source contract. These are proposals only; this research does not change the spec or architecture records.[1][2]

1. **M0:** retain Vitest, Node 24, pnpm and Biome; establish a real nonempty test run. Keep Storybook and chart work off the critical path.[2][48][54]
2. **M1:** make the snapshot/normalization/offset unit explicit before writing UI; return only allowed excerpts. Implement the complete/partial/outside/invalid states, a keyboard-operable disclosure/panel and an original-Article link. Verify the same published Revision throughout the page.[2][18][30][33]
3. **M1 acceptance:** production-build Playwright core flow, axe A/AA including WCAG 2.2 tags, keyboard walkthrough, light/dark, reduced motion, 200% enlargement and real KakaoTalk/Naver device records. Mark untested cells explicitly.[2][43][44][46][65]
4. **Rendering and sharing:** public per-Revision caches, private account data, immediate rights/correction invalidation, Korean-font OG generation and Revision-versioned image URLs. Verify scraper HTML separately from normal-browser streaming.[2][18][19][37][39][63]
5. **When charts enter scope:** Recharts 3 for volume with deterministic SSR dimensions and an HTML data table; ordinary list links plus an equivalent table for Revisions. Prefer this over constructing two custom visx widgets solely because visx is modular.[26][27][28]
6. **Before release:** measure the actual production route bundles, font transfers and Web Vitals under pinned conditions. Treat all numerical budgets here as starting acceptance targets until real measurements exist.[24][45][47][67]

## Open questions for the interview

1. **What should readers below the verified engine floor receive?** Options: (A) supported-engine reading experience plus update guidance; (B) deliberately maintained simplified server-rendered reading fallback; (C) a separately scoped legacy-browser support effort. Which trade-off fits the intended Korean audience?[7][9][10][11]
2. **Which Article timestamp should the volume chart describe?** Options: (A) publisher publication time; (B) ingestion time; (C) publication time with an explicitly labelled ingestion-time fallback when absent. These represent different meanings of volume, so the chart must disclose the chosen basis.[1][2]
3. **When an entire supporting span cannot fit the permitted excerpt, what should the reader see?** Options: (A) a clear limitation plus original-Article link; (B) a manually curated permitted excerpt before the Claim is displayed; (C) omission of that Claim until complete permitted Evidence can be shown. Do not relax the Rights Tier or claim a partial quote proves complete support.[1][2][30]

## Sources

All sources were accessed **2026-09-17**. Local links are repository authority/prior-work inputs; external links are primary maintainers, standards bodies or platform documentation. Unavailable/redirecting official endpoints are identified rather than treated as successfully verified specifications.[1][2]

1. Repository brief, issue #11 — [briefs/11-frontend-stack-visualization.md](briefs/11-frontend-stack-visualization.md). Accessed 2026-09-17; the user's 2026-09-17 focus note sets research priority and excludes design work.
2. Repository authority — [AGENTS.md](../../AGENTS.md), [project.md](../agents/project.md), [CONTEXT.md](../../CONTEXT.md), [v1.md](../spec/v1.md), especially testing and M0/M1. Accessed 2026-09-17.
3. Prior UX research — [02-ux.md](02-ux.md), lines 168, 174, 203–206, 221, 227. Accessed 2026-09-17; earlier research dated 2026-09-15.
4. Prior stack research — [03-stack.md](03-stack.md), lines 84 and 202. Accessed 2026-09-17; earlier research dated 2026-09-15.
5. shadcn, July 2026 default-base announcement — https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default — accessed 2026-09-17.
6. Base UI release history and stable component catalogue — https://base-ui.com/react/overview/releases — accessed 2026-09-17; latest listed 1.8.0, 2026-09-04.
7. Tailwind browser compatibility — https://tailwindcss.com/docs/compatibility — accessed 2026-09-17.
8. Base UI 1.8.0 browser snapshot — https://raw.githubusercontent.com/mui/base-ui/v1.8.0/.browserslistrc — accessed 2026-09-17.
9. Next.js supported browsers — https://nextjs.org/docs/architecture/supported-browsers — updated 2026-07-28; accessed 2026-09-17.
10. Kakao staff explanation of in-app WebView dependence — https://devtalk.kakao.com/t/topic/129344 — historical support response (2023); accessed 2026-09-17; not a 2026 app-version matrix.
11. Naver login guide, in-app UA example — https://developers.naver.com/docs/login/devguide/devguide.md — accessed 2026-09-17; not an engine support guarantee.
12. Base UI scope, browser policy and React support — https://base-ui.com/react/overview/about ; composition — https://base-ui.com/react/handbook/composition — accessed 2026-09-17.
13. shadcn Base Calendar — https://ui.shadcn.com/docs/components/base/calendar — accessed 2026-09-17.
14. shadcn Base Chart — https://ui.shadcn.com/docs/components/base/chart — accessed 2026-09-17.
15. shadcn theme variables/dark tokens — https://ui.shadcn.com/docs/theming — accessed 2026-09-17.
16. tweakcn repository/licence — https://github.com/jnsahaj/tweakcn ; export UI source — https://raw.githubusercontent.com/jnsahaj/tweakcn/main/components/editor/code-panel.tsx — accessed 2026-09-17.
17. Next.js Cache Components/caching guide — https://nextjs.org/docs/app/getting-started/caching — updated 2026-08-25; accessed 2026-09-17.
18. Next.js `use cache` — https://nextjs.org/docs/app/api-reference/directives/use-cache — accessed 2026-09-17.
19. Next.js `revalidateTag` — https://nextjs.org/docs/app/api-reference/functions/revalidateTag — accessed 2026-09-17.
20. Next.js Cache Components configuration — https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents — accessed 2026-09-17.
21. Pretendard author repository — https://github.com/orioncactus/pretendard — accessed 2026-09-17.
22. Noto CJK author repository — https://github.com/notofonts/noto-cjk — accessed 2026-09-17.
23. Google font performance guidance — https://web.dev/articles/font-best-practices — accessed 2026-09-17.
24. Measured Pretendard v1.3.9 assets: full — https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2 ; subset 90 — https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/packages/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.90.woff2 ; subset 91 — https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/packages/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.91.woff2 ; range CSS — https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/packages/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css — accessed/measured 2026-09-17.
25. Next.js font API — https://nextjs.org/docs/app/api-reference/components/font — accessed 2026-09-17.
26. Recharts accessibility source — https://github.com/recharts/recharts/blob/main/storybook/stories/API/Accessibility.mdx — accessed 2026-09-17.
27. Recharts ResponsiveContainer source — https://github.com/recharts/recharts/blob/main/src/component/ResponsiveContainer.tsx — accessed 2026-09-17.
28. W3C WAI complex images and tabular alternatives — https://www.w3.org/WAI/tutorials/images/complex/ — accessed 2026-09-17.
29. Microsoft archived annotation project — https://github.com/microsoft/react-text-annotator — archived 2024-02-16; accessed 2026-09-17.
30. W3C Web Annotation Data Model, position/quote selectors — https://www.w3.org/TR/annotation-model/ — Recommendation 2017-02-23; accessed 2026-09-17.
31. JavaScript String and UTF-16 indexing — https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String — accessed 2026-09-17.
32. HTML mark element and assistive-technology behaviour — https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/mark — accessed 2026-09-17.
33. W3C APG accordion pattern — https://www.w3.org/WAI/ARIA/apg/patterns/accordion/ — accessed 2026-09-17.
34. jsdiff API/licence — https://github.com/kpdecker/jsdiff — accessed 2026-09-17.
35. react-diff-viewer-continued API, Emotion and MIT licence — https://github.com/Aeolun/react-diff-viewer-continued — accessed 2026-09-17.
36. Next.js metadata API, Twitter/Open Graph fields — https://nextjs.org/docs/app/api-reference/functions/generate-metadata — accessed 2026-09-17.
37. Next.js ImageResponse — https://nextjs.org/docs/app/api-reference/functions/image-response — updated 2026-08-25; accessed 2026-09-17.
38. Satori supported fonts/layout — https://github.com/vercel/satori — accessed 2026-09-17.
39. Kakao staff scraper FAQ — https://devtalk.kakao.com/t/scrap-url/116202 ; 2024-09-11 size clarification — https://devtalk.kakao.com/t/og-image-og/139618 — accessed 2026-09-17.
40. Kakao cache FAQ — https://devtalk.kakao.com/t/topic/33298 ; current linked debugger — https://developers.kakao.com/tool/debugger/sharing — accessed 2026-09-17; debugger redirected to login and was not operated.
41. Slack robot/metadata/cache documentation — https://api.slack.com/robots — accessed 2026-09-17.
42. W3C WCAG 2.2 — https://www.w3.org/TR/WCAG22/ — accessed 2026-09-17.
43. Playwright axe integration — https://playwright.dev/docs/accessibility-testing — accessed 2026-09-17.
44. axe-core tag/API reference — https://github.com/dequelabs/axe-core/blob/develop/doc/API.md — accessed 2026-09-17.
45. Google Web Vitals thresholds and field/lab distinction — https://web.dev/articles/vitals — accessed 2026-09-17.
46. Playwright environment emulation — https://playwright.dev/docs/emulation — accessed 2026-09-17.
47. Lighthouse performance score/metrics — https://developer.chrome.com/docs/lighthouse/performance/performance-scoring — accessed 2026-09-17.
48. Next.js Vitest guide — https://nextjs.org/docs/app/guides/testing/vitest — updated 2026-08-25; accessed 2026-09-17.
49. Next.js Jest guide — https://nextjs.org/docs/app/guides/testing/jest — updated 2026-08-25; accessed 2026-09-17.
50. JSX accessibility linter — https://github.com/jsx-eslint/eslint-plugin-jsx-a11y — accessed 2026-09-17.
51. Biome rule-source mappings — https://biomejs.dev/linter/rules-sources/ — accessed 2026-09-17.
52. Storybook Next.js/Vite integration — https://storybook.js.org/docs/get-started/frameworks/nextjs-vite — accessed 2026-09-17.
53. Next.js Playwright guide — https://nextjs.org/docs/app/guides/testing/playwright — accessed 2026-09-17.
54. Vitest getting started, runtime requirements/configuration — https://vitest.dev/guide/ — accessed 2026-09-17.
55. Google Android WebView engine documentation — https://developer.chrome.com/docs/webview — accessed 2026-09-17.
56. WebKit Safari/iOS 16.4 release — https://webkit.org/blog/13966/webkit-features-in-safari-16-4/ — published 2023-03-27; accessed 2026-09-17.
57. W3C CSS Text Level 3, word-break — https://www.w3.org/TR/css-text-3/#word-break-property — accessed 2026-09-17.
58. W3C Korean layout requirements — https://www.w3.org/TR/klreq/ — accessed 2026-09-17.
59. react-text-annotate repository — https://github.com/mcamac/react-text-annotate — accessed 2026-09-17; exact last npm release date not verified.
60. X legacy large-image card endpoint — https://developer.x.com/en/docs/x-for-websites/cards/overview/summary-card-with-large-image — attempted 2026-09-17; redirected to https://docs.x.com/overview, so historical limits remain unverified.
61. Slack classic/app unfurling — https://docs.slack.dev/messaging/unfurling-links-in-messages/ — accessed 2026-09-17.
62. Next.js HTML-limited bots configuration — https://nextjs.org/docs/app/api-reference/config/next-config-js/htmlLimitedBots — accessed 2026-09-17.
63. Next.js v16.3.5 default bot regex — https://raw.githubusercontent.com/vercel/next.js/v16.3.5/packages/next/src/shared/lib/router/utils/html-bots.ts — accessed 2026-09-17.
64. Next.js 16 upgrade specifics — https://nextjs.org/docs/app/guides/upgrading/version-16 — accessed 2026-09-17.
65. W3C Resize Text — https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html — accessed 2026-09-17.
66. W3C Reflow — https://www.w3.org/WAI/WCAG22/Understanding/reflow.html — accessed 2026-09-17.
67. Lighthouse CI assertions/configuration — https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md — accessed 2026-09-17.
68. Storybook accessibility tests — https://storybook.js.org/docs/writing-tests/accessibility-testing — accessed 2026-09-17.
69. Playwright visual comparisons — https://playwright.dev/docs/test-snapshots — accessed 2026-09-17.
70. Adobe React Aria Components — https://react-aria.adobe.com/ — accessed 2026-09-17.
71. Ark UI — https://ark-ui.com/ — accessed 2026-09-17.
72. Park UI — https://park-ui.com/ — accessed 2026-09-17.
73. Mantine Next.js integration — https://mantine.dev/guides/next/ — accessed 2026-09-17.
74. Publisher npm registry metadata, accessed/measured 2026-09-17: https://registry.npmjs.org/recharts/3.10.1 ; https://registry.npmjs.org/@visx%2fshape/4.0.0 ; https://registry.npmjs.org/@visx%2fscale/4.0.0 ; https://registry.npmjs.org/@visx%2faxis/4.0.0 ; https://registry.npmjs.org/@observablehq%2fplot/0.6.17 ; https://registry.npmjs.org/d3/7.9.0 ; https://registry.npmjs.org/@nivo%2fline/0.99.0 ; https://registry.npmjs.org/chart.js/4.5.1 . Publication dates were read from the corresponding unversioned package endpoint's `time` map.
75. visx scope — https://visx.airbnb.tech/ ; React 18/19 support — https://github.com/airbnb/visx/releases/tag/v4.0.0 — release 2026-06-11; accessed 2026-09-17.
76. Observable Plot server rendering — https://observablehq.github.io/plot/getting-started — accessed 2026-09-17.
77. Observable Plot accessibility — https://observablehq.github.io/plot/features/accessibility — accessed 2026-09-17.
78. Observable Plot document/style options — https://observablehq.github.io/plot/features/plots — accessed 2026-09-17.
79. D3 React integration and modular usage — https://d3js.org/getting-started — accessed 2026-09-17.
80. Nivo rendering/SSR FAQ — https://nivo.rocks/faq/ — accessed 2026-09-17.
81. Nivo Line accessibility source — https://github.com/plouc/nivo/blob/master/packages/line/src/Line.tsx — accessed 2026-09-17.
82. Nivo theming — https://nivo.rocks/guides/theming/ — accessed 2026-09-17.
83. Chart.js Node rendering — https://www.chartjs.org/docs/latest/getting-started/using-from-node-js.html — accessed 2026-09-17.
84. Chart.js accessibility/fallback content — https://www.chartjs.org/docs/latest/general/accessibility.html — accessed 2026-09-17.
85. Chart.js selective registration — https://www.chartjs.org/docs/latest/getting-started/integration — accessed 2026-09-17.
86. Chart.js maintainer bundle example — https://www.chartjs.org/docs/latest/getting-started/usage.html — accessed 2026-09-17; historical example, not a September 2026 project benchmark.
