# Newstrail UI/UX Design Guidelines

This document is the repository-level **Design Source of Truth** for Newstrail. All future UI/UX work — including multiple independent design implementations — follows it. It describes the intended long-term design direction, not the current implementation. Treat the current Newstrail UI as a functional starting point, not a design constraint.

**Precedence.** ① Higher-level constraints involving security, safety, architecture, data integrity, APIs, tests, and repository integrity, and the decisions in `docs/adr/` → ② the acceptance criteria and the fixed values of `docs/spec/v1.md` "화면과 경험" → ③ this document → ④ `docs/ui-skills/` and any other design resource. This document never overrides ①. Where this document and ② disagree, the spec is revised first (approval required, `CLAUDE.md` "승인"); until then the spec wins. Known disagreements are listed in §15. Domain terms are those of `CONTEXT.md`; on-screen labels are Korean and are quoted here as they appear.

## 1. Product Design Identity

- Newstrail should feel like a **credible digital news publication first**, with investigation, verification, and source-analysis capabilities layered naturally into the editorial experience.
- It should not primarily feel like: an AI analysis product, a SaaS dashboard, an analytics dashboard, an admin interface, or a generic AI-generated interface.
- AI functionality supports the news experience; it does not define the product's visual identity. AI involvement the reader must know about (machine translation, generated illustration) is disclosed in plain text, never turned into branding.
- The intended product character is: **credible digital journalism + context + investigation + verification + source transparency.**
- Newstrail communicates **credibility → journalism → context → verification → evidence** before it communicates technology.
- Readers read in Korean; evidence is English source text (ADR-0001). Korean claims and English evidence spans sharing one page is a defining trait of a Newstrail page, and the design carries this bilingual reading naturally.

## 2. Core Product Concepts

The following product concepts remain stable. The current layout and component structure do not need to remain stable.

- **Event-centric stories**: the unit of a page is a story (사건, Story), not an article.
- **Multiple sources associated with one event**: a story is made of articles (기사) from several sources (출처); the number of independent reporting origins (보도 원점) is distinct from the source count.
- **Source verification**: every Korean claim (주장) carries at least one English evidence span (근거) and a link to the original article. There are no claims without evidence.
- **Conflicting-report states**: each claim has one contradiction status (상충 상태) — single source (단일 출처) / multiple sources agree (복수 출처 일치) / conflicting reports (보도 상충) / conflict resolved (상충 해소) / corrected (정정됨). Story status is derived from claim statuses (ADR-0009).
- **Correction states**: a correction the source announced (정정) is shown distinctly from a silent article change (원문 변경).
- **Categories**: stories belong to topics (토픽). The topic is the classification axis of the front page (the glossary term for "category" is topic).
- **Source counts**: stories and lists show the number of sources and reporting origins.
- **Update metadata**: three kinds of update time (story updated / last checked / article published), revisions (개정판), and changes (변화).
- **Relationships between events and sources**: a source's region, ownership type, language, and rights tier (권리 등급) are visible within the story.
- **Existing core user flows**: Today → story → claim → evidence → original link; change tracking (revision strip, changes since last seen); follow and login; search; about and legal pages; the demo-story section.

**Design freedom.** Future UI implementations may substantially redesign: homepage composition, page layout, information hierarchy, content grouping, component structure, typography, spacing, imagery, navigation, sidebar usage, story presentation, source presentation, metadata presentation, information density, visual rhythm, separators, and responsive layout. Do not preserve the current temporary UI merely because it already exists. Structural redesign is encouraged when it creates a stronger editorial experience. Do not unnecessarily modify business logic, data models, APIs, backend behavior, or unrelated product functionality merely to support a visual redesign.

## 3. Editorial Design Principles

- **Reading and understanding come first.** Every page is designed primarily for reading and understanding news. Controls, settings, and aggregates sit where they do not interrupt reading.
- **Structure replaces decoration.** Hierarchy is built from type size, weight, spacing, and rules — not from boxes, shadows, color fills, or gradients.
- Prefer: **strong editorial typography**, **clear information hierarchy**, **deliberate whitespace**, **thin separators**, **restrained borders**, **meaningful imagery**, **readable but relatively high information density**, **clear distinction between primary and secondary stories**, and **subtle status indicators**.
- **Rhythm of the page.** Stories sit on a steady vertical rhythm and a column grid; sections are divided by hairlines (solid or dotted). Whitespace groups related items and separates sections.
- **Verification signals live in the body.** Status badges, source counts, and evidence attach to the story and the claim. They are not pulled out into separate widgets, panels, or scoreboards.
- **Numbers speak as sentences and tables.** Aggregates read as labels and tables ("출처 6곳 · 보도 원점 3"). They are never big-number tiles, KPI cards, or gauges.
- **Color.** The base is neutral like paper and ink (light neutral background with dark text; dark mode is the same principle in a dark register, not an inversion). One action color, used with restraint (links, buttons, current location). Status colors are desaturated and always accompanied by an icon and a text label. No gradients. **No generic purple/blue AI branding.** The source of truth for token values is the spec's token table; current values that violate this principle are listed in §15.
- **Make it Newstrail's own.** Follow reference patterns, but the wordmark, colors, labels, status indicators, and interactions are specific to Newstrail.

## 4. Information Hierarchy

- Every list page has **at least three tiers** of story prominence: **lead** (largest headline + summary + status, sources, time), **secondary** (medium headline + summary, or headline only), and **list** (headline + one metadata line). A page that only tiles equally sized items has no hierarchy.
- The lead of the Today page is the story the reader should know first — the most recently updated story, or one with a conflict or correction. The lead plays the hero's role; there is no separate hero section.
- Reading order on a story page: topic eyebrow → headline → summary → metadata line (story status, source and origin counts, update time, demo marker) → claims (the gist of the story) → evidence → sources → changes. This order is the DOM order and the keyboard order.
- Metadata is smaller and quieter than headlines but keeps a 4.5:1 contrast. The topic is an eyebrow above the headline; source count and time form one line below it.
- Status badges are sized so they never compete with the headline. `보도 상충` (conflicting) and `정정됨` (corrected) are the most visible states; `단일 출처` and `복수 출처 일치` stay quiet.
- Operational status (last update time, next scheduled update, daily limit reached, suspended) has exactly one fixed slot at the top of the front page. Operational status is not a contradiction status and does not share its badge system.
- Demo stories always sit below live stories, in their own section, with their marker. They are never mixed with live stories on Today, Follows, or Search.
- One primary action per page (Follow on the story page). No ads, no promotional sections, no sign-up prompts.

## 5. Typography

- **Korean body first, English evidence alongside.** Only typefaces that cover both Hangul and Latin are used. English evidence spans are marked `lang="en"` and get their own line height.
- **Hierarchy through contrast.** The lead headline is at least twice the body size, and the four levels — headline, section, body, meta — are distinguishable at a glance by size and weight. Two levels of equal size are never distinguished by color alone.
- **Three type roles**: display (headlines), body, and meta/labels. Headlines may use an editorial typeface with a character distinct from the body — including a Korean serif (명조) family that ships with matching Latin. Conditions: self-hosted static files, a defined preload scope and fallback metrics, and the same family on the share (OG) card. Body and UI text are Pretendard. Monospace is never decorative. The relationship to the spec's current single-typeface rule is in §15.
- **Scale.** Root 16px, rem units. The spec's starting sizes (mobile/desktop CSS px: headline 26/32, section 20/24, card title 19/21, body 17/18, meta 14/14) are the floor; the lead headline uses the tier above (the Today masthead headline is 40 or larger). The scale may be tuned by measurement, but the number of tiers does not shrink.
- **Line height**: Korean body 1.75, English 1.65, headlines 1.2–1.4, meta 1.5 or more. **Measure**: on desktop a body line stays within about 35–45 Hangul characters (60–75 for English).
- **Wrapping**: `word-break: keep-all; overflow-wrap: anywhere`. Long mixed strings and URLs never create horizontal scroll. Claim sentences are never truncated to one line with an ellipsis. Controls grow by wrapping, never by fixed height.
- **Numerals**: `tabular-nums`. Identifiers, times, and counts do not jitter.
- **Eyebrows and labels**: topic and section labels may be small, letter-spaced label text. Labels are never distinguished by color alone.
- **Links are underlined.** Headline links must be recognizable as links without hover (underline or an unmistakable headline convention).
- At 200% zoom every tier survives and nothing overlaps.

## 6. Layout and Composition

- **Newspaper page structure**: masthead (service name · primary navigation · update time · operational notice · login) → topic navigation → lead area → secondary columns → list rail → demo section → footer.
- **Desktop is a multi-column grid** (two to three columns, asymmetry allowed) with hairlines between columns. **Mobile is a single column** that preserves the desktop reading order.
- **Separate with rules, whitespace, and type.** Card boxes are a last resort. When used, corners are 4px or less, borders are hairlines, there are no shadows, and boxes are never nested inside boxes. Lists default to rows divided by rules.
- **Sidebars and rails** hold related lists only (recent stories, stories by topic, the demo entry point). No statistics widgets, gauges, or chart tiles.
- **The story page** is one page in document flow. Claims / Sources / Changes are anchored sections (not tabs). On desktop the claim column and the evidence panel form two columns; the evidence panel stays in page flow (no independent scroll region, no modal, no focus trap). At high zoom or narrow widths the layout falls back to the mobile arrangement and keeps selection and expansion state.
- **Dimensions**: container max 76rem; side gutters 16px on mobile, 24–32px on desktop; spacing scale 4/8/12/16/24/32/48. Two columns begin at 48rem and multi-column at 64rem as starting values.
- **Density**: several stories are visible above the fold. Whitespace is generous, but a layout that shows only one story per screen height is too sparse.
- No carousels, no autoplay, no hover-only controls, no sticky promotional bars.

## 7. Image Usage

- **Text first by default.** Every page must be a complete editorial page with no images at all. Image slots are never filled with empty boxes, stock images, placeholders, or gradient fills: when a story has no image, or its image fails to load, the slot collapses entirely.
- **Permitted imagery**: the story's **lead image** — the image of one of its own source articles (ADR-0002, spec "이미지"; the term is `CONTEXT.md` "대표 이미지"), hotlinked from the publisher's URL and never re-hosted, cropped, filtered, or passed through an image optimizer; a credit line `사진 · <source name>` beside it that links to that article; the service's own icon and favicon; data graphics such as the coverage-volume chart (`<figure>` + caption + table alternative); and neutral letter tiles for sources (first letter of the source name, identical style for every source).
- **Forbidden**: source logos, favicons, stock imagery, generated illustrations presented as news imagery, borrowing the name or logo of a real publisher (including for demo pseudo-sources), and article images shown without their credit and original link, re-hosted, or placed on the share card. The rights basis and its removal path are ADR-0002's; design convenience never widens them.
- **Treatment** (Semafor reference): one large image on the lead with the credit line beneath it; small thumbnails on secondary items; the list tier stays text-only. Fixed 3:2 aspect ratio with `object-fit: cover` to prevent layout shift; the lead loads eagerly, everything else lazily. `alt` is empty — the headline carries the meaning.
- Share (OG) cards, search result rows, and demo stories are text-only.

## 8. Event and Source Presentation

- **Story header**: topic eyebrow → headline → one-line summary → metadata line (story status badge · `출처 N곳 · 보도 원점 N` · `사건 갱신 <absolute time KST>` · `마지막 확인` when relevant · demo badge) → Follow and Share. No political leaning, no confidence, no scores (ADR-0004).
- **Claim list**: ordered claim sentences, a status badge beside each, and a `근거 N개 보기` disclosure (`aria-expanded`). Everything starts collapsed on first entry; a claim deep link expands only that claim; several evidence panels may be open at once. The claim sentence and its badge sit outside the collapsible region.
- **Sources beneath each point** (an adaptation of Semafor's "Signals" pattern): each claim shows, in one line, the sources that support it (`근거: Source A, Source B`); expanding reveals the evidence rows.
- **Evidence row**: source name · article publish time · English span (highlighted at server-verified offsets, with start and end marked by means other than color) · link to the original · translation toggle labeled as machine translation for reference. When a span cannot be shown in full, show `근거 발췌를 표시할 수 없음` with the source name and link; never present a cut fragment as full evidence.
- **Conflicting reports**: stack the diverging reports as **equal rows** in one fixed order (publish time, source name as secondary sort, order stated) with the point of difference attached. No A/B exclusive tabs, no team colors, no majority vote, no winner. Silence — something a source did not mention — is never shown as a conflict.
- **Corrections**: the `정정됨` badge with previous and current sentences side by side. A silent difference found on re-fetch is shown separately as `원문 변경`.
- **Sources section** (Ground News' source-grouping pattern adapted to Newstrail's model): one row per source — neutral letter tile + source name · region · ownership type · language · what the rights tier permits to display · article publish time · link to the original. Link-only tier sources show metadata and link only. Do not bring over bias distribution bars, factuality scores, Blindspot, or "My News Bias".
- **Changes section**: claim changes (previous and current side by side, `<ins>`/`<del>` with text alternatives), status changes, and article changes are listed item by item; source additions are collapsed to a count. The **revision strip** is not a chart but an ordered list of revision links (time · counts by change kind · "where I last read" when logged in). The **coverage-volume chart** is a fixed-size line chart with a table of the same data.
- **List items** (Today, Search, Follows): topic eyebrow · headline (links to the story page) · summary · status badge · source count · relative time. Search results also show the matching claims. The Follows list puts "changed since you last read" first.
- **Demo identity**: a neutral dashed-border `데모 사건` badge; the notice `기능 설명을 위해 만든 데모 사건입니다.` once at the head of the section; pseudo-sources marked as fictional; fixture times labeled `데모 기준 시각`.

## 9. Navigation

- **Masthead**: a text-based service wordmark (the symbol matches the favicon and app icon), primary navigation (Today · Follows · Search · About), and the login/account entry at the top right. The current location is marked by weight and underline, not by color alone.
- **Topic navigation** sits at the top of the Today page like a newspaper's section navigation: topic name and story count, a toggling filter (`aria-pressed`) that clears when pressed again, with zero-count topics visible and selectable.
- **Search** is reachable from every page (masthead, or the Today search box that hands the query to `/search?q=`).
- **In-page navigation on the story page** uses document anchors (Claims / Sources / Changes). It is never turned into tabs, steps, or modals.
- **Deep links**: stories, revisions, and claims have stable URLs. Because a shared link is the first entry path, every page carries the masthead.
- **Footer**: About · Privacy Policy · Terms. Destructive actions (delete account, log out) live only inside the account page, separated from ordinary navigation.
- Going back restores scroll, filter, and expansion state. Introducing a mobile bottom tab bar requires revising this document.

## 10. Components and Interaction

- **Minimal component set**: text link (underlined), button (primary: dark fill + white text; secondary: outline), status badge (light background + dark text + icon + text label), demo badge (dashed), separator (solid or dotted hairline), eyebrow label, metadata line, disclosure (`aria-expanded`), evidence highlight (yellow mark + explicit foreground token + visible `근거 구간` label + side rule), table, `<figure>`, static skeleton. A new component is added only when it cannot be built from this set.
- **Shape**: corners 4px or less, no shadows, no gradients or glass effects, no oversized pill controls. Badges are never filled with the action color, so they differ from buttons by shape. Error and destructive styles have their own tokens and never reuse the conflicting-status color.
- **Icons**: one set (lucide), consistent stroke width. A decorative icon beside visible text is `aria-hidden`; an icon-only control has an accessible name. No sparkle, AI, or robot icons; no emoji as icons.
- **Interaction**: click and tap are the defaults; no information or path is reachable by hover alone. Touch targets are 44×44px or larger. Focus is a 2px outline with a surface-color offset. Selection changes only by explicit activation, never by focus movement alone.
- **Motion**: only for state transitions, brief (150–250ms, transform and opacity only). No scroll-driven effects, parallax, entrance animations, or auto-rotation. Under reduced motion there is no motion at all.
- **Page states** (loading, empty, error, limit, suspended) follow the spec's "화면별 상태 원칙". Loading is a static skeleton that keeps the headline and time slots stable.
- **Forms** (search, follow, account deletion): visible labels, errors beside the field via `aria-describedby`, a submitting state. Destructive actions are confirmed with a single confirmation field.
- **Notifications**: global alerts only for substantive change; non-urgent asynchronous results go to a `polite` status region. Toasts are not overused.

## 11. Responsive Design

- **Mobile first.** One column → two columns at 48rem → multi-column at 64rem. The reading order equals the DOM order at every width.
- No horizontal scroll. At 200% zoom and at narrow widths the layout falls back to the mobile arrangement and keeps selection, expansion, and filter state.
- Images and charts have fixed aspect ratios to prevent layout shift. Charts may simplify or fall back to their table on small screens.
- Side rails move below the main content at narrow widths. They are not hidden.
- The story page works inside the KakaoTalk in-app browser. Because the first entry is a shared link, the story page is designed for standalone entry.

## 12. Accessibility

- **Target WCAG 2.2 AA.** Evidence is zero axe violations (WCAG 2.0/2.1/2.2 A and AA tags) and full keyboard completion. "Audit complete" is never claimed.
- **Never convey meaning by color alone**: status, change kind, source, evidence highlight, and current location all use an icon, text, or shape as well. Status text remains even with color removed.
- **Contrast**: body, meta, and badge text at 4.5:1 or more; non-text elements (icons, borders, focus) at 3:1 or more. Dark mode is measured separately.
- **Keyboard**: the order claim → evidence → original link is preserved. Focus is visible, never trapped, and never obscured by fixed elements.
- **Structure**: no skipped heading levels; landmarks (`header`, `nav`, `main`, `footer`); meaningful link text. Relative-time refreshes are not announced repeatedly to assistive technology.
- **Charts** provide an HTML table of the same data inside the `<figure>`, expandable by keyboard. The table preserves every behavior of the revision strip.
- **System settings are respected**: `prefers-color-scheme`, `prefers-reduced-motion`, 200% zoom. If a theme toggle is ever added, the system option is not removed.
- Static checks use Biome's accessibility rules; automated checks are one axe run inside each page's E2E smoke test.

## 13. Reference Usage

- **Semafor** (semafor.com) is the reference for editorial composition, headline hierarchy, typography hierarchy, spacing, information density, image treatment, story prominence, separators, and overall digital-publication character. Its structural patterns may be followed closely when appropriate for Newstrail. In particular: the masthead + section navigation + three-tier (lead, secondary, list) hierarchy; hairline and dotted separators; the eyebrow + headline + dek + credit-line item structure; and the "Signals" convention of naming the sources beneath each point.
- **Ground News** (ground.news) is the reference for event-centric story presentation, grouping multiple sources around one event, source comparison, source metadata, verification-oriented UX, and analysis integrated into the reading experience. Adapt these patterns to Newstrail's own event and source model. Do not copy Ground News-specific product concepts that are irrelevant to Newstrail: left/center/right bias distribution bars, factuality scores, Blindspot, "My News Bias", the AI question box and sparkle icons, subscription prompts (ADR-0004, spec "범위 밖").
- **Principle**: do not deliberately avoid proven reference patterns merely for the sake of originality. The result may strongly resemble useful editorial or structural patterns from the references. However, do not reproduce another product pixel-for-pixel. Adapt branding, colors, labels, status indicators, interactions, content model, and product-specific UI to Newstrail. The objective is not originality for its own sake; it is the strongest possible Newstrail experience built on proven editorial design principles.
- Reference screenshots contain third-party photographs and articles and are not committed to the repository. Look at the two sites directly.
- **Supporting resources** (`docs/ui-skills/`, design datasets such as UI/UX Pro Max) are supporting resources, not the final authority. If their recommendations conflict with this document, this document wins. For example, a hero-centric landing structure, scroll-reveal motion, a "breaking-news red" palette, or card-and-dashboard composition recommended by such a resource is not used.

## 14. Patterns to Avoid

Generic AI/SaaS aesthetics:

- excessive rounded cards, excessive bordered containers, boxes inside boxes
- decorative gradients, glassmorphism, excessive shadows
- oversized pill controls
- decorative AI or sparkle icons, robot icons, emoji as icons
- floating dashboard widgets; dominant dashboard-style statistics (big-number tiles, gauges, KPI cards)
- generic purple/blue AI branding
- oversized SaaS-style hero sections, promotional bars, sign-up pop-ups

Newstrail-specific prohibitions:

- political leaning or bias spectra, confidence or reliability percentages, factuality scores, Blindspot (ADR-0004)
- A/B exclusive tabs, team colors, majority votes, or winners for conflicting reports
- encoding status, change kind, or source by color alone
- source logos, favicons, stock imagery, borrowed publisher names or logos; article images re-hosted, uncredited, or shown without their original link
- hover-only controls, carousels, autoplay, countdowns
- truncated claim sentences, fixed-height controls, horizontal scroll
- lowering opacity, gradients, or inherited muted text on evidence highlights
- modal evidence panels, focus traps, independent scroll regions, forced scroll synchronization
- drawing operational status with contradiction-status badges; reusing the conflicting-status color for error or destructive styles
- mixing demo stories with live stories or dropping the demo marker
- changing business logic, data models, APIs, or backend behavior for the sake of a visual redesign

## 15. Implementation Constraints

- **The redesign stays in the UI.** Business logic, data models, APIs, backend behavior, and unrelated product functionality are not modified merely to support a visual redesign. If a page needs data that does not exist, that data gets its own ticket.
- **Precedence** is the chain in the preamble. A conflict with an ADR is never overwritten silently; it is surfaced as "ADR-000N과 충돌한다. 이유는 …" and work stops (`docs/agents/project.md` "도메인 규칙").
- **The fixed values of the spec's "화면과 경험"** (token table, starting sizes, thresholds, breakpoints, page-composition sentences) are acceptance criteria. Realizing this document's direction requires the spec to be revised on the following points first (approval required). Until then, implementations follow the spec.
  1. Visual direction B "Slate & Plum" — the plum action color (`--primary #581c87`, dark `#d8b4fe`) and the plum accent rule on the OG card — conflicts with §3 "no generic purple/blue AI branding". The spec must decide between moving the action color to an ink-like neutral or keeping plum strictly as a restrained action color that is never used as branding.
  2. The single-typeface rule "모노스페이스 폰트는 쓰지 않는다(Pretendard 하나)" conflicts with the display-typeface allowance in §5.
  3. The fixed Today composition sentences (first story as a large card · desktop two columns · right-hand aggregate section · first 8 and 8 per "more" · search box width · demo-card font sizes · centered 14px footer) conflict with the composition freedom in §4 and §6; in particular the right-hand aggregate section (conflict/correction counts, topic distribution) conflicts with the dashboard-statistics avoidance in §3 and §14.
  4. Fixing the "card" as the unit of story lists conflicts with the row default in §6.
- **Technical stack** (source of truth: `docs/agents/project.md` "스택"): Next.js App Router + React, Tailwind 4, shadcn (`base-nova`, Base UI), lucide, Recharts 3, Pretendard (bundled). Tokens are defined only in `apps/web/styles/tokens.css`; components never use raw color values. Where the composition rules of `docs/ui-skills/shadcn/SKILL.md` (card/tab/sidebar composition, mandatory `Separator`, etc.) conflict with this document, this document wins. Editorial pages are built from meaningful HTML (`article`, `section`, `hr`, `figure`, `time`).
- **Rendering**: server rendering must be deterministic (fixed initial chart size, animation off by default). Fonts define a preload scope and fallback metrics and must not cause layout shift. The share card is a text-only `next/og` template.
- **Tests** (source of truth: `project.md` "테스트"): one E2E smoke test per page (core path + one axe run). Tests are not multiplied per state, viewport, or theme. No tests assert token CSS or configuration files. A redesign PR changes existing E2E expectations (headline size, etc.) together with the spec revision.
- **Terminology**: artifacts (component names, test names, copy) use `CONTEXT.md` terms and avoid its listed synonyms.
- **Tickets**: the brief of every screen ticket (`ui` label) includes the path of this document (requires revising `project.md` "브리프", approval).

## 16. Rules for Updating This Document

- This is a persistent file written as rules in English so that the original design direction is not diluted. It records no history, dates, superseded rules, implementation state, or measured values (those belong in commit messages, git log, and the spec).
- Changes are made only through a PR. The controller edits it; edits outside a PR and the merge itself require user approval (`CLAUDE.md` "승인").
- A revision that weakens §1 Product Design Identity, §13 Reference Usage, or §14 Patterns to Avoid is made only on the user's explicit decision. Other sections may be sharpened by what implementation teaches, but only within the existing direction.
- When a new disagreement with the spec is found, a spec revision is proposed first, and that PR updates the list in §15. Once an item is reflected in the spec it is removed from the list.
- When a new page, component, or state is introduced, its rule is added to the relevant section. Page-specific values (sizes, thresholds, copy) live in the spec's "화면과 경험" and in tickets. There is never a second source of truth for a value.
- When a reference publication is changed or added, §13 states what is referenced and what is not brought over.
- Recommendations from supporting resources (`docs/ui-skills/`, design datasets) are carried into this document only after passing the principle in §13.
