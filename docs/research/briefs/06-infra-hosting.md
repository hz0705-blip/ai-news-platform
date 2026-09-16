# Research: hosting and infrastructure for web + long-running worker + Postgres/pgvector under $150/month

**Deliverable path:** `docs/research/06-infra-hosting.md`

## Questions to answer

1. **Component map.** We need: (a) Next.js web app, (b) a Node worker that runs a twice-daily batch of ~150 articles through OpenAI calls (may run 20–60 minutes), (c) PostgreSQL 17/18 with pgvector 0.8, (d) a scheduler that triggers the batch, (e) object storage for fixtures/eval reports, (f) log/error capture. For each, list viable managed providers as of 2026-09 with **current** free/paid tiers and hard limits (execution time, memory, connection limits, cold starts, egress).
2. **Worker placement.** Vercel/serverless is unsuitable for a 30-minute batch. Compare: Fly.io machines, Railway, Render background workers, a small VPS (Hetzner/Oracle free tier), GitHub Actions scheduled job as the worker runtime, Supabase Edge/cron, Trigger.dev/Inngest style job runners. For each: cost at our load, how pg-boss fits, how it is deployed alongside the Next.js app from one monorepo.
3. **Postgres providers** with pgvector: Neon, Supabase, Railway, Fly Postgres, Crunchy Bridge, self-hosted on the VPS. Compare storage/compute pricing at ~5 GB, HNSW index support, connection pooling for serverless web, branching for preview, **backup and point-in-time recovery** (we must run a recovery drill), Korea/Asia region availability and latency from Seoul.
4. **Three concrete configurations** priced line by line (monthly, USD): a "minimum" (~$0–30), a "recommended" and a "comfortable" set, each staying under the $150 cap **after** GNews €49.99 and an estimated $30–40 OpenAI spend. State assumptions.
5. **Scheduling twice a day** in KST: cron options per provider, timezone handling, what happens if a run overlaps or fails, and how to expose "last updated at" and "budget reached" state to the web app.
6. **Observability on a budget**: error tracking (Sentry free tier limits), uptime/smoke monitoring from outside (free options), a simple cost dashboard (OpenAI usage API availability), structured logging.
7. **Deploy & rollback**: GitHub Actions flow for web + worker + Drizzle migrations; how to roll back a bad migration; preview environments; secrets management.
8. **Korean user latency**: which providers have Seoul/Tokyo regions for web and DB; is edge rendering worth it for mostly-static Story pages (ISR/revalidate on new Revision).

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
