# Research: Kakao + Google login via Supabase Auth in Next.js, in-app browser issues, and minimum legal pages

**Deliverable path:** `docs/research/08-auth-kakao-supabase-legal.md`

## Questions to answer

1. **Kakao Login requirements (2026-09).** Developer app registration, what "비즈 앱" (business app) verification requires and whether an individual can obtain it, which scopes (nickname, email) need it, review timeline, callback URL rules, test-user limits before verification, logout/unlink APIs, token lifetimes. Primary source: Kakao Developers docs.
2. **Supabase Auth integration.** Current recommended Next.js App Router pattern (`@supabase/ssr`), Kakao provider configuration, Google provider configuration, session refresh, protecting server actions, storing minimal profile data. Note any 2026 breaking changes.
3. **KakaoTalk in-app browser.** Known problems with OAuth redirects (Google blocks OAuth in embedded webviews; Kakao's own login inside KakaoTalk webview), detection user-agent strings, and the standard mitigations (open in external browser via `kakaotalk://web/openExternal`, intent URLs on Android, fallback UI). Also NAVER app webview. Provide a decision table: which login works where.
4. **Anonymous-first model.** Best practice for a site where all reading is anonymous and login only adds follows + last-seen: where to keep the "last seen revision" before login (none, per decision), how to prompt login contextually, and how to handle account deletion (Supabase user delete + Kakao unlink + cascading our data).
5. **Abuse control for anonymous cost-bearing endpoints** (on-demand translation, semantic search): rate limiting options in Next.js/Vercel/Fly (IP, cookie, Turnstile), caching strategies, cost per abuse scenario. Recommend a concrete policy.
6. **Minimum legal pages for a Korean-facing non-commercial site with social login**: what 개인정보 처리방침 must contain under PIPA for collecting email/nickname via Kakao/Google (required items, retention, third-party transfer to Supabase/OpenAI, contact), whether 이용약관 is required, cookie/consent requirements, and a takedown/correction request flow (72-hour handling target). Provide an outline (not final legal text) and cite the statute/guidance.
7. **Attribution page**: what a "출처 표기 및 데이터 권리" page should state given Wikinews CC-BY, GNews terms (publisher rights remain), GDELT, and MT-labelled translations.

## Project context (decided 2026-09-16, supersedes the context in briefs 01–05)

**ai-news-platform** — a product-grade portfolio web app for **Korean readers** that clusters **English-language international news** into *Stories*, writes a **Korean summary as a list of Claims**, links every Claim to **English Evidence spans** in the original articles, and tracks **what changed since the reader last saw the Story**. Solo developer; Claude implements via the superpowers cycle, Codex does research. Hiring targets: full-stack + applied-AI roles, Korea first with an English README as a secondary path.

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
