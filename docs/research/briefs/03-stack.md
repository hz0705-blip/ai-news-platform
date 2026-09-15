# Research: tech stack, architecture, infra, cost

**Deliverable path:** `docs/research/03-stack.md`

## Questions to answer

1. **2–3 concrete stack sets** for a solo full-stack + AI portfolio in 2026, each with versions and rationale:
   - Front end: Next.js/React vs SvelteKit vs Remix/React Router vs TanStack Start.
   - Back end: single TypeScript codebase vs TypeScript app + Python (FastAPI) AI service. When is the split worth it?
   - Database: Postgres + pgvector vs dedicated vector DB (Qdrant, Pinecone, Turbopuffer…). Also Drizzle vs Prisma.
   - Jobs/scheduling: BullMQ, Inngest, Trigger.dev, Temporal, pg-boss, plain cron. Which fit a periodic ingestion + LLM pipeline?
   - Cache, auth (Auth.js, Clerk, Better Auth, Supabase Auth), image handling, search (Postgres FTS vs Meilisearch vs Typesense).
2. **Architecture**: modular monolith vs services; ingestion pipeline shape (fetch → dedupe → embed → cluster → analyse → publish); API style (REST vs tRPC vs GraphQL vs server actions); real-time updates (SSE vs WebSocket vs polling). Give one recommended reference architecture as a Mermaid diagram.
3. **Hosting & monthly cost** for a live demo with ~1–5k articles/day: Vercel, Render, Fly.io, Railway, Supabase, Neon, Cloudflare. Free-tier limits and the cliff where cost jumps. Current 2026 pricing, cited.
4. **Engineering quality**: CI/CD (GitHub Actions), test strategy (unit / integration / E2E with Playwright, testing LLM outputs), observability (OpenTelemetry, Sentry, structured logs, LLM tracing tools like Langfuse), security basics (OWASP top 10 for this shape of app, secret management, rate limiting).
5. For each stack set, list **talking points for a full-stack interview** and **talking points for an AI/ML interview**.
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
