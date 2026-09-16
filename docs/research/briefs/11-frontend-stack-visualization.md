# Research: frontend foundation — component library state, Tailwind v4, Korean web fonts, accessible charts, OG cards

**Deliverable path:** `docs/research/11-frontend-stack-visualization.md`

## Questions to answer

1. **shadcn/ui + Base UI + Tailwind v4 as of 2026-09.** Current shadcn CLI defaults (Radix vs Base UI), migration state, which components are stable on Base UI, known gaps, theming approach (CSS variables, OKLCH), dark-mode tokens. Alternatives worth a look for a solo dev: React Aria Components, Ark UI, Park UI, Mantine. Recommend one with reasons. *Candidates to verify (Claude pre-scan 2026-09-16, not conclusions):* shadcn changelog says Base UI became the default for new projects in 2026-07 with Radix still supported; [tweakcn](https://github.com/jnsahaj/tweakcn) (open source, OKLCH/Tailwind v4 export) as the theme editor.
2. **Next.js 16 rendering choices** for our pages: Today (twice-daily changes), Story (changes per Revision), Follow (per-user), Search (dynamic). ISR/revalidateTag patterns, per-Revision cache keys, streaming, what runs on the client (evidence highlighting, revision strip interaction). Note Next.js 16 specifics (cache components, `use cache`).
3. **Korean web typography**: Pretendard vs Noto Sans KR vs system fonts; variable-font subsetting, loading strategy (self-host vs CDN), `word-break: keep-all`, line-height and measure for mixed Korean/English text (Korean claims with English evidence). Cite performance numbers where available. *Candidates to verify:* [Pretendard / Pretendard Std](https://github.com/orioncactus/pretendard) (SIL OFL; variable + dynamic subset; `next/font/local` self-hosting).
4. **Accessible data visualisation** for two v1 charts (article volume over time; a revision strip with change markers): compare Recharts, visx, Observable Plot, D3 direct, Nivo, Chart.js — bundle size, SSR compatibility, accessibility (keyboard, aria, table fallback), theming with CSS variables. Recommend one and a table-fallback pattern. *Candidates to verify:* visx (MIT, small modular SVG primitives) vs Recharts 3 (MIT, SVG, SSR-safe); Claude's prior is visx since v1 has only two charts — confirm or refute with numbers.
5. **Evidence highlighting UI**: implementation patterns for showing a highlighted span inside a longer excerpt, linking a Korean claim to one or more English spans, mobile accordion vs desktop side panel; libraries or hand-rolled; how to handle span offsets when the excerpt is truncated. *Pre-scan finding:* no maintained library found — `react-text-annotate` last published ~2020, Microsoft `react-text-annotator` archived 2024-02. Default assumption is hand-rolled offset-based rendering; also evaluate `jsdiff` (BSD) for claim-text word diffs in the Changes section instead of `react-diff-viewer-continued` (MIT but Emotion-styled).
6. **OG share cards**: Next.js `ImageResponse` (satori) with Korean font embedding, KakaoTalk scraper requirements (image size, cache purge tool), Twitter/X and Slack card specifics.
7. **Accessibility tooling**: axe-core in Playwright, `eslint-plugin-jsx-a11y`, Lighthouse CI thresholds for LCP/INP/CLS, testing `prefers-reduced-motion` and 200% zoom, KakaoTalk in-app browser testing approach (real device, user-agent emulation limits).
8. **Testing stack**: Vitest vs Jest for Next.js 16, Playwright for E2E, Storybook or alternatives for component states (loading/empty/error/quota-reached), visual regression on a budget.

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
