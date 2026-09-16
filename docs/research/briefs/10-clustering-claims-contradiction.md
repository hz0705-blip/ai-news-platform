# Research: story assignment, claim extraction/matching, contradiction judgement and evaluation design — reference practice and concrete rules

**Deliverable path:** `docs/research/10-clustering-claims-contradiction.md`

## Questions to answer

1. **Online story assignment.** How do production news aggregators and published systems assign an incoming article to an existing cluster or open a new one (Google News-style, Ground/Particle if documented, academic: TDT, NewsEmbed, MIND, SemEval multilingual clustering)? Report the typical: similarity measure, threshold ranges for embedding cosine, **time window** (how many days before a Story stops accepting articles), centroid vs max-link vs pairwise, handling of merges/splits. Recommend a v1 rule set with named parameters (values to be tuned on the golden set) and a definition of **Story lifecycle** (active / dormant / closed).
2. **Story title and Korean claim generation.** Practices for summarising a multi-document cluster as a **fixed list of atomic, evidence-bound sentences**: claim atomicity definitions (FActScore, SAFE, VeriScore, RAGAS "claims"), recommended count per story, ordering, distinguishing *fact* vs *stance attributed to a source* vs *forecast*. Recommend a claim schema.
3. **Evidence spans and citation faithfulness.** Methods for getting reliable character offsets for supporting spans from an LLM (quote-then-locate, fuzzy matching, sentence-ID indexing), the deterministic "span exists" gate, and the model-judged "span supports claim" gate across languages (Korean claim vs English span). Cite attributable-summarisation / citation-eval literature (ALCE, AttributionBench, etc.).
4. **Claim identity across revisions.** How to decide that claim C' in Revision n+1 is "the same claim, updated" as C in Revision n: evidence-span overlap (Jaccard on offsets), embedding similarity of claim text, or LLM alignment. Recommend a rule and how to classify the change (unchanged / reworded-only / substantively changed / removed / added).
5. **Contradiction status.** NLI-based and LLM-based contradiction detection between news sentences: datasets (SNLI/MNLI limits, ContractNLI, news-specific), known failure modes (numbers, hedges, temporal updates being misread as contradictions, "silence ≠ contradiction"). Define state-transition rules for *single source → multiple agree → conflicting → resolved → corrected* at claim and story level. Recommend prompts/output schema.
6. **Numeric claims (v2 groundwork).** How systems extract and normalise quantities (subject, time, unit, value) and detect conflicting figures across sources; what schema to store now so v2 can add it without migration pain.
7. **Evaluation design.** For each judgement above, the standard metric and how to compute it: clustering (ARI, NMI, B-cubed), citation gate pass rates, support-judgement precision/recall vs human labels, contradiction accuracy/F1, claim-matching accuracy. Sizing guidance: given ~100 story packets and ~300 article pairs, what confidence intervals result; what stratification (by topic, by story size) is feasible. Recommend a **golden-set construction protocol** using two OpenAI models (higher/lower tier) with owner adjudication of disagreements, and how to report agreement.
8. **Reference implementations / open source** in TypeScript or Python that we can read for patterns (not adopt as a Python service): clustering utilities, NLI wrappers, claim-extraction prompts, eval harnesses (promptfoo, Braintrust, LangSmith evals, RAGAS). Note licences.

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
