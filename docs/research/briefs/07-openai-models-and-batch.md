# Research: OpenAI model, embedding and Batch API selection for a twice-daily news pipeline

**Deliverable path:** `docs/research/07-openai-models-and-batch.md`

## Questions to answer

1. **Current lineup (2026-09).** Every generally available OpenAI text model and embedding model with: price per 1M input/output tokens, context window, structured-output (JSON schema) support, reasoning-effort controls, rate-limit tier behaviour for a new paid account, deprecation notices. Primary source: OpenAI pricing and model pages. Date every number.
2. **Batch API.** Current discount, turnaround guarantee, size limits, how results are retrieved, failure semantics. Our pipeline runs twice a day and can tolerate hours of latency: quantify how much of the ~$30–40/month model spend the Batch API would save, and which pipeline stages can be batched (embedding, evidence extraction, claim generation, support judgement, contradiction judgement) vs must be synchronous (on-demand translation, search-query embedding).
3. **Stage → model assignment.** Recommend a specific model for each stage: embeddings (model + dimension, with pgvector index implications), evidence extraction, Korean claim generation, support judgement (Korean claim vs English span), contradiction judgement between English spans, Korean translation of spans, Story title generation. Justify with cost, quality expectations for Korean output, and structured-output reliability. Give a **higher-tier / lower-tier pair** for golden-set cross-checking.
4. **Cost model.** A per-article and per-batch token estimate for each stage (state assumptions: article ~800 words, Story ~5 articles, ~8 claims). Monthly cost at 300 articles/day with and without Batch API. Show the arithmetic.
5. **Korean quality.** What is known (official evals, third-party benchmarks, dated) about Korean generation and Korean→English cross-lingual semantic similarity for the candidate embedding models. Note if a Korean-specific embedding is needed for semantic search over Korean claims.
6. **Structured outputs & prompt engineering constraints**: JSON schema limits, refusal handling, how to return character offsets for evidence spans reliably (offset drift problem), prompt caching availability and pricing.
7. **Spend control**: OpenAI usage/cost API, per-key budgets, how to enforce a daily cap in code (token accounting before/after calls), what to do with in-flight Batch jobs when the cap is hit.
8. **Eval judge**: recommended model for LLM-as-judge in the eval harness, position/verbosity bias mitigations, cost per 100-item eval run.

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
