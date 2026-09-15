# Research: data sources, legal constraints, AI analysis pipeline, evaluation

**Deliverable path:** `docs/research/04-ai-pipeline.md`

## Questions to answer

1. **Data sources** — for each: access method, rate limits, pricing, ToS clauses relevant to a public portfolio demo, and what may be displayed (headline / snippet / full text):
   - Global: RSS feeds of major outlets, GDELT, NewsAPI, GNews, Guardian Open Platform, NYT APIs, Mediastack, others.
   - Korea: Naver News Search API, Daum/Kakao, Korean outlet RSS availability, BigKinds (Korea Press Foundation), Yonhap. Korean copyright law and news-aggregation precedents (cite).
   - Copyright & fair use / 공정이용: what a summariser may legally show. Cite statutes, cases, publisher policies (e.g. robots.txt AI directives, TDM opt-outs).
2. **Pipeline stages — techniques and cost per 1,000 articles**: deduplication & story clustering (embeddings + HDBSCAN/agglomerative/online methods), multi-source summarisation, stance/bias detection (and its reliability limits), entity extraction & lightweight knowledge graph, timeline construction, citation grounding (linking each summary sentence to source spans), hallucination controls.
3. **Model selection 2026**: Claude / OpenAI / Gemini / open models for each stage; embedding models (incl. Korean performance and multilingual benchmarks); batch APIs and prompt caching; realistic monthly LLM cost at 1k and 5k articles/day. Cite pricing pages.
4. **Evaluation**: golden sets, LLM-as-judge with its known biases, regression tests in CI, human feedback loop, metrics for summaries (faithfulness, coverage) and clustering (ARI/NMI). How portfolio projects can *show* they evaluated (dashboards, eval reports in repo).
5. **Reference implementations** worth reading: open-source news aggregators / clustering pipelines / summarisers on GitHub, with stars, last commit, licence.
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
