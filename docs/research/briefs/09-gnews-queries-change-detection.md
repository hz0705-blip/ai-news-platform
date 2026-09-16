# Research: GNews query design for 4 topics, article density measurement, re-fetch and article-change detection, GDELT and Wikinews integration

**Deliverable path:** `docs/research/09-gnews-queries-change-detection.md`

## Questions to answer

1. **GNews API surface (2026-09).** `search` vs `top-headlines` endpoints, parameters (`q` syntax incl. boolean/phrase, `lang`, `country`, `from/to`, `sortby`, `max`, `truncate`, `in`), response fields, pagination behaviour, dedup behaviour, rate limits for Essential (1,000 req/day, 25 articles/req, 10 req/s). Primary source: docs.gnews.io.
2. **Query design for our 4 topics**, English-language sources only:
   - Korea in foreign press (한국 관련 해외 보도): propose 3–5 query variants (e.g. `"South Korea" OR Seoul OR Korean`, exclusions for North Korea vs South Korea handling, K-pop noise) and how to filter out Korean-domestic outlets writing in English (Yonhap EN, Korea Herald, Korea JoongAng Daily) if we want *foreign* press only — or argue for including them.
   - International politics/diplomacy/security; world economy/finance; tech/AI: propose queries or `top-headlines` categories, and the trade-off between category feeds and keyword queries.
   For each: expected articles per call, overlap between topics, how to assign multi-topic articles.
3. **Density measurement.** If a GNews key is available in the environment, run each proposed query for a 24-hour window and report: articles returned, unique after URL/title dedup, publisher distribution (top 15 domains), content length distribution, share with truncated/empty content, non-English leakage. If no key, estimate from documentation and clearly label. Recommend a request schedule that yields ~150 articles per batch (twice daily) within quota.
4. **Article re-fetch and change detection.** Can an already-seen article be re-retrieved via GNews (by URL, by exact-title query, by `from/to` window)? Is re-fetching the publisher URL directly acceptable (robots.txt, terms) for hash comparison? How do NewsDiffs-style projects detect edits? Recommend a concrete method and schedule for detecting *Article Change* and explicit *Corrections* (patterns like "Correction:", "Updated:", "Editor's note").
5. **Publisher metadata.** For the top ~50 publishers likely to appear: how to obtain country/region, ownership type (public broadcaster, private, state-affiliated, wire), and language — Wikidata, existing open datasets (e.g. Media Bias/Fact Check is *not* wanted; we need ownership/region only), or a hand-maintained table. Recommend a source and a maintenance approach.
6. **GDELT integration.** Which GDELT product (GKG, Events, DOC 2.0 API) gives us "other outlets covering the same story" by URL/title/time; query examples; rate limits; how to match GDELT records to our Stories; what metadata we may display.
7. **Wikinews.** MediaWiki API calls to list recent English Wikinews articles, fetch wikitext/HTML, get revision history (for article-change detection), licence attribution requirements for CC-BY display; expected volume per day.
8. **Dedup rules** across sources: exact URL, canonical URL, title similarity, wire-copy detection (same AP/Reuters text on many domains) — recommend a deterministic pre-embedding dedup pipeline.

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
