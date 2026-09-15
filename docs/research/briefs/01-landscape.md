# Research: market landscape, competitors, differentiation candidates

**Deliverable path:** `docs/research/01-landscape.md`

## Questions to answer

1. **Similar products.** At least 5 global (e.g. Ground News, Particle, Perplexity Discover, Feedly AI/Leo, Artifact post-mortem, Techmeme, Google News, Apple News+, Readwise Reader) and at least 5 Korean (e.g. Naver News AI briefing, Kakao/Daum News, DeepSearch, NEWNEEK, Longblack, others you find). For each: what it does, core UX, pricing, launch/shutdown dates, team size if known.
2. **Feature matrix** across all of them (summarisation, clustering, bias/source spectrum, timelines, personalisation, alerts, audio, offline, API, …).
3. **What users complain about.** App-store reviews, Hacker News / Reddit threads, post-mortems of dead products (Artifact etc.). Quote and cite.
4. **Gap analysis → 5–8 candidate differentiating features** for this project. For each: evidence of unmet need, implementation difficulty (S/M/L), portfolio impact (what it lets the author demonstrate), and which target market it serves.
5. **What makes a news app feel "product-grade"** rather than a side project: concrete, observable traits from the best examples.
## Project context

An **AI-powered general-news analysis web app**: it ingests general news (politics, economy, tech, …), then summarises, clusters and analyses it for readers. Solo developer. Purpose: a **product-grade portfolio** targeting both **full-stack** and **AI/ML engineer** roles. Target market (Korean vs global) is **undecided** — research **both** and keep them separate where they differ.

## Rules (apply to every research ticket)

- Prefer **primary sources**: official docs, source code, product/pricing pages, papers, first-party blog posts. Follow each claim back to the source that owns it.
- Facts must be current as of **September 2026**; date every fact. Mark anything uncertain as uncertain. Never invent numbers, features or URLs.
- Use web search liberally. Use the `$research` skill.
- **Deliverable**: exactly one Markdown file at the path given below, in this structure:
  1. `## 요약` — Korean, 15 lines max, for the human reader
  2. `## Scope`
  3. `## Findings` — every claim cited inline `[n]`
  4. `## Options & trade-offs` — tables where possible
  5. `## Recommendation` — opinionated, for a solo dev with a product-grade bar
  6. `## Open questions for the interview` — decisions only the product owner can make
  7. `## Sources` — numbered list of URLs with access dates
  Body in English (token economy); only the 요약 is Korean.
- **Do not commit, do not open a PR.** Claude will commit all research together.
- You may read other `docs/research/*.md` files but never modify them.
- When done: `gh issue comment <this issue number>` with the file path and a 3-line summary. Do **not** close the issue.
