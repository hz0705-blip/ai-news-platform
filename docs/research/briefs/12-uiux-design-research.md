# Research: UI/UX design reference — how comparable products design news reading, evidence, and change; open-source references; a concrete visual direction for a designer-less solo dev

**Deliverable path:** `docs/research/12-uiux-design-research.md`

The owner has no design background. This brief must produce material the owner can *choose from* in an interview: annotated references, named patterns, and 2–3 concrete visual directions — not abstract advice.

## Questions to answer

1. **Product teardown (10–14 products).** For each, describe with screenshots/links (product pages, press kits, app-store listings, Mobbin/Page Flows-style galleries if accessible): layout of the home/briefing screen, story page structure, how sources are shown, how citations/evidence are shown, how updates/changes over time are shown, typography, colour, image use, dark mode. Candidates: Ground News, Particle, Perplexity Discover, Kagi News, Apple News, Google News, Artifact (archived), NewsBreak, Yahoo Japan News (トピックス), SmartNews, Naver News/네이버 뉴스 AI 브리핑, Daum News, Newneek (뉴닉), UPPITY, Toss 피드, Feedly. Add 2–3 evidence-heavy non-news products for citation UI: Perplexity, NotebookLM, Elicit, Consensus. Add 2–3 change/diff UIs: Wikipedia diff, GitHub PR files view, Notion page history, NewsDiffs.
2. **Pattern catalogue.** Extract named UI patterns with pros/cons and at least one reference each: story card; source pill/avatar row; "N sources" disclosure; claim + evidence pairing (inline footnote, side panel, hover card, accordion); contradiction display (two-column, tabbed, "A says / B says" rows); status badges (single source / conflicting / corrected); revision timeline/strip; "what changed" diff summary; last-updated indicator; demo/fixture badge; empty/quota-reached/live-paused states.
3. **Images.** Do we show article images at all? Rights implications (GNews warns third-party image copyright), layout impact, alternatives (typographic cards, generated abstract thumbnails, publisher favicons/logos and their trademark limits, OG image from publisher). Recommend a policy and show how text-first news products look without images.
4. **Colour and typography direction for a trust-first Korean news product.** Survey palettes used by the products above and by trust-oriented brands; propose 2–3 concrete directions each with: primary/neutral/semantic palette in OKLCH or hex (light + dark), one Korean font + one Latin/mono pairing, type scale for mobile and desktop, spacing scale, radius/shadow style. Show how contradiction status colours and evidence highlight colours meet WCAG contrast in both modes. Avoid politically coded red/blue for source distinctions.
5. **Information architecture and layout proposals.** For our five screens (오늘 / 사건 / 팔로우 / 검색 / 소개) and the Story page sections (주장 / 출처 / 변화), propose low-fidelity wireframes (ASCII or Mermaid) for mobile and desktop, including the desktop two-column evidence view and the mobile accordion. Mark where each catalogued pattern is used.
6. **Open-source references.** Repos we can read for UI structure (not necessarily adopt): open-source news readers/aggregators (e.g. Miniflux, FreshRSS UIs, Yattee-style readers, Omnivore archive, Readeck), open-source citation/evidence UIs, shadcn-based dashboards/templates with strong typography, Korean open-source UI kits or design systems (e.g. Toss TDS docs, Kakao/Naver public design guidelines, KRDS 공공 디자인 시스템). Note licences. *Candidates to verify (Claude pre-scan 2026-09-16):* [kagisearch/kite-public](https://github.com/kagisearch/kite-public) — Kagi News front end, code MIT / data CC BY-NC, Svelte; closest existing structure to our Story page (story cards, sources, perspectives, timeline). [Laeyoung/Ko-KagiNews](https://github.com/Laeyoung/Ko-KagiNews) — unofficial Korean fork, useful for Korean typography and `keep-all` handling in practice. [Morphic](https://github.com/miurla/morphic) (Apache-2.0, Next.js) and Vane (formerly Perplexica, MIT) — sentence-level citation UIs. [HANUI](https://github.com/hanui-o/hanui) and [krds-react](https://github.com/KRDS-community/krds-react) — KRDS implementations (MIT, small; Radix-based, read for tokens/type scale only). Miniflux is Apache-2.0; Readeck is AGPL (read, never copy).
7. **Design workflow for a non-designer.** A concrete, tool-specific path to a coherent visual system without a designer: token-first approach (shadcn theme generator, Radix colours, tweakcn), reference boards, using Figma community files or skipping Figma entirely and iterating in code, AI design tools' strengths/limits in 2026. Recommend a workflow and a review checklist (hierarchy, consistency, contrast, density, states).
8. **Korean reading UX specifics**: reading patterns on mobile in Korea (portal habits, in-app browser share), preferred information density, date/time formats (상대 시각 vs 절대 시각 관행), honorific/tone norms for machine-written summaries, line length and `keep-all` behaviour in practice.

## Project context (decided 2026-09-16, supersedes the context in briefs 01–05)

**ai-news-platform** — a product-grade portfolio web app for **Korean readers** that clusters **English-language international news** into *Stories*, writes a **Korean summary as a list of Claims**, links every Claim to **English Evidence spans** in the original articles, and tracks **what changed since the reader last saw the Story**. Solo developer; Codex implements, Claude plans/reviews. Hiring targets: full-stack + applied-AI roles, Korea first with an English README as a secondary path.

Fixed decisions you must not re-open (glossary in `CONTEXT.md`):

- **Scope v1**: international news only. Domestic Korean sources are excluded for rights reasons; the Source model carries a *Rights Tier* so they can be added later.
- **Core features**: (1) contradiction comparison — Claims with Evidence, per-Claim/Story *Contradiction Status* (single source / multiple agree / conflicting / resolved / corrected); (2) change tracking — a Story is a sequence of *Revisions*, a *Change* is the diff between two Revisions (claim change, status change, article change, source added). Account-based "since you last saw" (Last Seen Revision).
- **No political bias labels.** Trust comes from inspectable evidence, not scores.
- **Sources**: English Wikinews (CC-BY, full processing), **GNews Essential** (paid, full content; display limited to 1–2 sentence excerpts with source name + link), GDELT (metadata/links only), plus designed *Demo Stories* (fixtures) in a separate, badged section.
- **Topics (4)**: Korea in foreign press; international politics/diplomacy/security; world economy/finance; tech/AI.
- **Cadence & budget**: batch pipeline **twice a day**, ~**300 articles/day**, **$150/month hard cap** including GNews (€49.99), OpenAI and hosting; a daily model-spend cap enforced in code.
- **Models**: **OpenAI only** (LLM + embeddings). No fine-tuning, no Python ML service. Golden-set labels are produced by cross-checking a higher-tier and a lower-tier OpenAI model; disagreements adjudicated by the owner.
- **Stack A**: Next.js + React + TypeScript, PostgreSQL + pgvector, Drizzle, pg-boss, separate web and worker processes. Supabase Auth with **Kakao + Google**; all reading is anonymous, login only for follows and last-seen tracking.
- **Evidence display**: English original by default; Korean machine translation on demand, cached, labelled as MT. Two-stage citation gate: deterministic span-exists check (100%) + model-judged support check.
- **Screens**: 오늘(Today) / 사건(Story) / 팔로우(Follow) / 검색(Search, semantic via pgvector) / 소개(About). Story page sections: 주장(Claims) / 출처(Sources) / 변화(Changes). v1 visualisations: article-volume-over-time and a revision strip; conflicting-numbers comparison is v2.
- **UX bar**: mobile-first + desktop two-column evidence view; WCAG 2.2 AA as target with axe + keyboard walkthrough as evidence; KakaoTalk in-app browser tested; OG share cards; system dark mode; 200% text zoom; reduced-motion respected.
- **Evidence for hiring**: eval report, cost/latency, recovery drill, deploy/rollback, ADRs, Korean README.

## Rules (apply to every research ticket)

- Prefer **primary sources**: official docs, source code, product/pricing pages, papers, first-party blog posts. Follow each claim back to the source that owns it.
- Facts must be current as of **September 2026**; date every fact. Mark anything uncertain as uncertain. Never invent numbers, features or URLs.
- Use web search liberally. Use the `$research` skill.
- Where the brief asks for **measurements** (API calls, quotas, densities), actually run them if a key is available in the environment; otherwise say so and estimate from documentation, clearly labelled.
- **Deliverable**: exactly one Markdown file at the path given at the top, in this structure:
  1. `## 요약` — Korean, 15 lines max, for the human reader
  2. `## Scope`
  3. `## Findings` — every claim cited inline `[n]`
  4. `## Options & trade-offs` — tables where possible
  5. `## Recommendation` — opinionated, for a solo dev with a product-grade bar and the fixed decisions above
  6. `## Open questions for the interview` — decisions only the product owner can make; phrase each as a question with 2–4 options
  7. `## Sources` — numbered list of URLs with access dates
  Body in English (token economy); only the 요약 is Korean.
- **Do not commit, do not open a PR.** Claude will commit all research together.
- You may read `CONTEXT.md` and other `docs/research/*.md` files but never modify them.
- When done: `gh issue comment <this issue number>` with the file path and a 3-line summary. Do **not** close the issue.
