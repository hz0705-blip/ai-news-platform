# Research: what makes a portfolio web app hire-worthy; production-grade checklist

**Deliverable path:** `docs/research/05-portfolio-bar.md`

## Questions to answer

1. **What hiring managers and senior engineers actually look at** in a portfolio project. Cite hiring guides, engineering-manager blog posts, HN/Reddit threads from people who hire, Korean hiring-community sources (e.g. 원티드, 커리어리, 코드너리, 개발자 커뮤니티) as well as global ones. Separate what matters for **full-stack** vs **AI/ML** roles.
2. **Repo presentation**: README / case-study structure that works, architecture diagrams, ADRs, CONTEXT/glossary, test & CI badges, live demo with seeded data, demo video/GIF, commit history hygiene, issue tracker as evidence of process. Give 3–5 exemplary public repos and say why they work.
3. **Production-grade checklist** for a web app: auth & sessions, empty/loading/error states, SEO & OG, Core Web Vitals budgets, accessibility, i18n, analytics & feature flags, onboarding, rate limiting & abuse protection, legal pages (privacy, terms, content attribution), uptime monitoring, backups. Mark each as must / should / nice for a portfolio.
4. **Common failure modes of portfolio projects** (unfinished features, no tests, dead demo, tutorial clones, no "why") and how to avoid each.
5. **How to present an AI product responsibly** in a portfolio: showing evals, cost awareness, failure handling, bias disclaimers. What impresses AI/ML interviewers specifically.
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
