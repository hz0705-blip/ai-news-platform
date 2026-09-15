# Issue #4 — Data rights, news analysis pipeline, costs and evaluation

## 요약

- 권고: 데이터의 AI 처리·공개 권한을 먼저 확보하고, 기사 목록보다 출처가 검증되는 사건별 요약을 구현한다.
- 네이버 검색 결과를 AI 분석 입력으로 사용하는 설계는 현재 약관과 맞지 않으므로 별도 허가 없이는 제외한다.
- 한국과 글로벌 뉴스는 데이터 계약·언어 평가를 분리하고, 국가별 정치 성향을 하나의 점수로 합치지 않는다.
- 정확 중복 제거 → 다국어 임베딩 → 사건 클러스터 → 근거 문장 추출 → 요약·검증 순서를 권고한다.
- 모든 요약 문장에 원문 구간을 연결하고, 상충하는 보도와 정정 이력을 그대로 드러낸다.
- 아래 가정에서 Luna 중심 처리의 월 모델 비용은 하루 1천 건 약 $104, 5천 건 약 $496이다.
- 이는 라이선스·인프라·인건비를 제외한 계산이며, 기사 길이·재요약·추론 토큰에 따라 달라진다.
- 한국어·영어·교차 언어 골든셋, 사람 검수, 회귀 평가 보고서를 포트폴리오의 핵심 증거로 제시한다.

## Scope

Research snapshot: **2026-09-15 (Asia/Seoul)**, answering the local issue #4 brief. All undated product, pricing, policy and repository observations below mean **observed on 2026-09-15**, not guaranteed future availability. Historical papers and cases retain their publication/decision dates. Prices are list prices, USD unless specified, before tax; quotes and contract permissions remain unknown where explicitly stated. Accessing a page through web retrieval is not an authenticated API throughput test.

The target is a solo-built, public, general-news analysis portfolio that could become commercial. Korean and global markets remain separate options. **Proposal**, **assumption**, and **calculation** identify this report's judgments rather than measured project results. No ingestion, model benchmark, publisher permission request or production performance test was performed for this research. The cost scenario assumes legally usable source text; metadata-only access cannot support the same evidence-rich product.

## Findings

### 1. Data sources and rights

#### Global sources

**Observation date for every source row: 2026-09-15.** H = headline, S = supplied snippet/description, F = full article. An API field being available is not evidence of a right to republish it, send it to an LLM, train on it or retain it indefinitely. The display column therefore separates technical access from verified permission; unknown rights are a proposed launch blocker. Provider-specific terms and underlying publisher rights can both apply. [41][43][68]

| Source | Access, rate/volume and price | Public portfolio / H, S, F display decision |
|---|---|---|
| Major-outlet RSS, e.g. BBC | Publisher feed URLs; usually no API key. No universal polling quota or price; per-outlet policy and availability differ. BBC feed terms permit specified personal-site uses and require business permission, potentially with a fee. [44] | BBC terms PDF is a legacy policy reference, not a newly negotiated 2026 licence. H/S feed display must follow its conditions, unchanged and attributed; F and AI use are not established. Confirm current terms. Feed XML was not successfully parsed in this research. [44] |
| GDELT | No-key DOC API, ArticleList JSON/RSS; 75 default / 250 maximum results per response in original 2017 documentation. Dataset has no fee and allows commercial reuse with attribution/link. Stable requests/second quota not verified; historical search-window details may have changed. [45][46] | Useful for discovery and event metadata. H/URL accessible; F republication and underlying publisher AI rights are not granted by GDELT's dataset policy (**inference**). Proposed adapter: single queue/backoff, not an invented unlimited-request assumption. [45][46] |
| NewsAPI | Key-based REST; Developer $0, 100 requests/day, 24-hour delay; Business $449/month, 250,000 requests; Advanced $1,749/month, 2 million. No full article text on any plan. [40] | Developer is development-only, excluding public production/staging demos. Paid access does not remove third-party copyright, attribution or competing-database restrictions. H/S rights require applicable permission; F unavailable from this API. [40][41] |
| GNews | Key-based REST; free 100 requests/day, 10 articles/request, 12-hour delay; Essential €49.99/month, 1,000/day, 25 articles/request; Business €99.99/month, 5,000/day, 50 results/request. Paid plans offer full content. [42] | Free is for development. H/S/F technically available according to tier; June 22, 2026 terms preserve third-party rights and limit resale/competing databases. Reasonable caching is not a perpetual republication/AI licence. [42][43] |
| Guardian Open Platform | API key; free noncommercial access: 500 calls/day and 1 call/second, including article text. Commercial/AI/TDM use has custom pricing. [47] | H/S/F retrieval is technically possible; request a contract expressly covering the proposed AI pipeline and display. [47] |
| NYT APIs | Official specification repo lists Article Search, Top Stories and Archive APIs; developer registration/API key required. Current 2026 quota, price and operative display/AI terms could not be verified because official portal/FAQ retrieval was blocked. [49] | H/S metadata schemas are useful for discovery; F/public-summary rights **unverified**. Apache-2.0 on API specification code does not license NYT journalism. Do not reuse remembered historical quota numbers. [49] |
| Mediastack | Key API; free 100 calls/month, delayed/noncommercial; Standard $24.99/month, 10,000 calls; Professional $99.99/month, 50,000 calls. [50] | Paid plans advertise commercial API use, but precise publisher-content/AI/cache/display clauses were inaccessible. H/S/F permitted display and F availability remain **unverified**, not implied by a “commercial” tier. [50][51] |
| English Wikinews | Public articles; articles published after 2024-12-16 use CC-BY-4.0; 2005-09-25 through 2024-12-15 use CC-BY-2.5. Images have separate licences. No ingestion quota verified here. [52] | H/S/F text reuse subject to the article's licence, attribution and change notices. Proposal: a useful clearly licensed demonstration corpus; coverage and source diversity still need measurement. Do not assume image reuse. [52] |

Guardian standard terms prohibit AI/TDM (§6(g)) and require content refresh/deletion every 24 hours (§5); negotiate explicit AI rights. [48]

**Practical RSS proposal:** maintain an explicit publisher allowlist, conditional HTTP requests, conservative polling and per-host backoff. Record whether the feed offers only H/S or F, but enforce the publisher licence independently of the payload. A feed's technical accessibility is not permission for aggregation or AI processing. Robots rules are not access authorization. [44][69]

#### Korea sources

| Source | Access, limits and pricing observed 2026-09-15 | Public portfolio / display and AI implications |
|---|---|---|
| Naver News Search | NAVER API HUB `GET /search/v1/news`, gateway key ID/key headers; 25,000/day shared Search quota; up to 100 results/request, start ≤1,000. Fields include title, description, original link, Naver link and publication time, not F. [53] | September 7, 2026 NAVER Developers Search terms prohibit AI input/training/improvement/evaluation/exposure and ads/revenue uses; search results must be independently displayed unmodified, attributed and linked. Persistent copies restricted; limited device cache ≤24 hours/until new query, server search history ≤21 days. **Exclude as AI evidence absent explicit permission.** [54] |
| Naver migration caveat | Since 2026-07-31 new applications go through API HUB; legacy migration deadline is 2027-06-30. Notice describes free operation initially and later paid policy; a future tariff is not established here. [55] | The amended terms above are the observed Developers terms; an API HUB-specific signed contract was not independently readable. Migration is not proof of broader AI rights. Require applicable HUB permission before using H/S in models or public derived analysis. [53][54][55] |
| Daum/Kakao | REST key; current Search catalog offers web/video/image/blog/book/café, **no dedicated news API**. Web Search is a discovery fallback. Free total quota 3 million/month; Daum Search 50,000/day, Web Search 30,000/day. [56][57] | Returned web title/contents/link are not a licence to article F. Policies protect third-party rights, notices and controlled user-experience caching; no independently verified news-summary/AI licence. Use only within confirmed terms and rights. [58] |
| SBS RSS | Official catalog lists newsflash, politics/economy and other feed URLs; XML retrieval encountered a tooling/content-type limitation, not proof the feeds are dead. No published rate cap verified. [59] | Official catalog limits RSS to personal noncommercial use; commercial use requires contact. H/S/F public redistribution and AI permission not established. Proposed public demo adapter disabled until scope approved. [59] |
| Hankyoreh / Kyunghyang RSS | Hankyoreh's 2005 RSS launch is historical evidence; live feed payloads were not verified. Current policy pages restrict RSS to personal reading; no public quota/tariff verified. [60][61][62] | H/S/F redistribution or re-RSS requires permission, including noncommercial use. Do not equate a 2005 RSS announcement with a currently licensed public AI feed. [60][61][62] |
| BigKinds, Korea Press Foundation | Manual API application is for institutions including public bodies/universities, with a requested period up to 12 months; instant self-service solo access not established. Public UI permits up to 20,000 Excel records with article body truncated to 200 characters. [63][64] | Export cap is **not** an API quota. Truncation protects copyright; public redistribution is not authorized by export access. API price, request quota, AI input, summary and public H/S/F rights require KPF confirmation. [63][64] |
| Yonhap | Syndication/licensing contact rather than a verified open public-news API. RSS is referenced on official English pages, but current XML, tariff and quota were not verified. [65] | May 1, 2026 official notice requires permission for reprinting/copying/distribution/modification/AI use. H/S/F and derived analysis should be contract-governed; do not scrape around missing rights. [65] |
| Korea Policy Briefing / government alternatives | KOGL Type 1 materials may be reused under attribution conditions, subject to item-level exclusions and separately protected images. **Korea.kr RSS was discontinued 2026-07-01**; do not propose it as a current RSS adapter. [66][67] | Proposal: item-checked licensed fixtures/manual capture, or a separately verified official API, can bootstrap Korean evidence. It is government communication, not a substitute for independent multi-outlet journalism. [66][67] |

#### Copyright, fair use and aggregation precedents

| Jurisdiction / authority | What the primary authority establishes | Product implication (**inference / recommendation**) |
|---|---|---|
| Korea Copyright Act, current text checked 2026-09-15 | Article 7(5) excludes facts-only current-news reports; Article 28 permits quotations within reasonable scope/fair practice; Article 35-5 assesses fair use using purpose/nature, work type, amount/substantiality and market effects; Article 37 requires attribution in applicable uses; Article 93 protects database producers. [68] | Reporting a fact differs from copying expressive journalism. Attribution alone does not cure infringement, and repeated small extractions can raise database issues. Do not use a fixed character cap as a legal safe harbour. |
| Korea Supreme Court, 2006-09-14, **2004도5350** | Yonhap article/photo dispute: creativity must be assessed in the material; the news category does not automatically remove protection. [70] | Avoid the blanket assertion “news is factual, so all article text is free.” Evaluate expression, images and compilation separately. |
| Korea Supreme Court, 2016-05-26, **2015도16701** | In the mobile-app linking facts considered, linking alone was not reproduction, display or creation of a derivative work. [71] | A conventional outbound link is a narrower activity than storing and displaying extracts. This holding is not immunity for copied snippets/full articles or every linking context. |
| US 17 USC §107 | Four-factor fair-use inquiry; no universal word-count or percentage safe harbour. [72] | News reporting/criticism can be relevant purposes, but an automated digest must still be assessed on actual use and market substitution. “Portfolio” is not an automatic exception. |
| **AP v. Meltwater**, S.D.N.Y., 2013-03-21 | Copyright Office's official case summary records that the commercial news-clipping service's use was not fair use, including market/licensing harm. [73] | A short clipping service can still substitute for licensed news consumption. Link-outs, attribution and paraphrase require a case-specific rights analysis. |
| EU Directive 2019/790, Articles 3, 4 and 15 | Scientific-research TDM exemption differs from general TDM with lawful access and expressly reserved rights, including machine-readable reservations; press-publication rights have hyperlink and very-short-extract limitations. [74] | Do not import the research exemption into a public commercial service, or interpret TDM permission as permission to reproduce news publicly. Applicable national implementation and target jurisdictions must be checked. |
| RFC 9309 (2022), robots exclusion | Robots directives are crawler instructions, not an authorization mechanism. [69] | Honor robots and publisher AI/TDM restrictions independently; permission to fetch does not settle copyright, contractual AI use or display rights. |

**Proposed display policy:** for an unresolved source, show only independently cleared metadata/link information; do not promise that every headline is unprotected. For cleared sources, display source/author/date, the permitted headline and excerpt length, links to the original and a separately identifiable generated summary. Full text, thumbnails/photos, translated extracts, cached evidence, public evaluation examples and LLM submission each require their own allowed-use fields. A source that grants ordinary RSS display but forbids AI processing cannot enter embeddings or summarisation. Gate publication on rights evidence, retain renewal/revocation dates and support takedown. These are conservative engineering controls, not a legal determination that all remaining summaries are fair use. [41][43][54][59][68][72]

**Unresolved contractual checks:** provider-specific AI inference versus training, use of third-party hosted processors, storage/retention, derived-summary display, public evaluation exports and commercial transition. Ask publishers/KPF for written answers against those exact uses. This research records no negotiated permission and no law-firm opinion; it does identify a feasible fallback: self-authored or item-licensed fixture stories, clearly labelled as demonstrations, until live content rights are secured. [47][52][63][66][68]

### 2. Pipeline techniques and failure controls

The following is a **proposed design**, grounded in the methods cited; these are not measured accuracy or throughput claims. Preserve the distinction between a duplicate article, an event cluster and a longer-running topic: online multilingual news research explicitly addresses discovering new story clusters over time, while BERTopic supplies broader topic representations. [10][24]

| Stage | Technique and persisted output | Failure controls / trade-off |
|---|---|---|
| Rights-aware ingestion | Attach provider, canonical URL, acquisition time, publication/update time, language, content hash, licence revision and allowed processing/display flags. Run only permitted adapters. | Proposal: gate before text storage, embeddings and vendor submission; rights expiry must invalidate derived summaries as well as cached text. |
| Exact and near deduplication | Proposal: canonical URL + normalized-text hash first; use token shingles/MinHash or cosine candidates for near copies. Keep all source URLs and syndication lineage. | A syndicated wire copy is one evidentiary origin; retain meaningful corrections as new article versions. Similarity alone is insufficient proof of duplication. Streaming story grouping is a separate problem. [10] |
| Event clustering | Multilingual embedding of title + selected lead/body spans; recent-neighbour candidate retrieval; combine cosine, entity overlap and time distance. Assign to an existing event or create a singleton. | Proposal: start with a 72-hour active window, longer explicit story links, calibrated thresholds per language pair, and immutable cluster IDs with split/merge history. A recurring entity alone must not merge different events. [10] |
| Offline cluster alternatives | HDBSCAN identifies density-based groups/noise; agglomerative clustering exposes a distance cut and configurable linkage. | HDBSCAN approximate prediction holds old clusters fixed, so it cannot discover new clusters without refitting. For cosine agglomeration use average/complete linkage; Ward requires Euclidean distance. Periodic refitting can change membership, requiring ID reconciliation. [11][12] |
| Per-article extraction | One schema-constrained call extracts entities, attributed claims, quantities, event times, stance targets and source-span IDs. | Proposal: reject nonexistent spans and malformed dates; represent uncertainty and speaker separately. GLiNER is a compact, parallel entity-extraction alternative, but its reported benchmarks do not establish Korean news performance. [13] |
| Lightweight knowledge graph | Proposal: relational `entity`, `alias`, `mention`, `claim`, `event` and `evidence` tables; edges carry article version, span and confidence. | Entity recognition is not identity resolution or a verified relation. Avoid merging Korean names/romanizations without supporting context. Begin with SQL joins; benchmark any graph-database requirement later. [13] |
| Multi-source summarisation | Extract salient supported claims from each source, choose diverse independent origins, then synthesize consensus, disagreement and unknowns. | Multi-News is an established multi-document benchmark, but subsequent research shows some nominally multi-document tasks can be solved from one document. Proposal: measure distinct-source contribution and preserve minority evidence. [14][15] |
| Stance / framing | Classify the position **toward a named proposition** as support/oppose/mixed/unclear, with quoted evidence and speaker attribution. Describe concrete framing differences. | BABE (2021) addresses word-choice bias, not universal outlet truthfulness; its 3,700 English sentences and expert annotations do not validate Korean political labels. Proposal: no public left/right score until locally annotated, calibrated evaluation supports it. [16] |
| Timeline | Extract `event_time`, `reported_at`, `updated_at`, precision/time zone and evidence; group events by normalized dates, then select novel milestones. | Timeline research separates date selection and date summarisation. Proposal: resolve “yesterday” relative to the article's publication time, retain uncertain intervals, distinguish allegation from confirmation and correct old entries visibly. [17] |
| Sentence-level citation grounding | Each summary sentence emits one or more existing span IDs; backend maps them to article URL, version and offsets. Run claim-level entailment and contradiction checks. | ALCE measures citation correctness/completeness; its results show retrieval plus citations does not guarantee supported answers. Proposal: no generated URLs, no citation-free factual sentences, no inference disguised as a quotation. [18] |
| Publication and refresh | Proposal: publish only after schema/span/number/date checks and a verifier pass; retain generation version, input hashes, model ID, prompt revision and usage. | If evidence is missing or contradictory, abstain, preserve attributed disagreement, or queue review. Recompute only on meaningful evidence changes; never use the previous generated summary as the sole evidence. Citation and QA-based evaluation remain fallible checks. [18][19] |

**Hallucination-control proposal:** treat source text as untrusted data, not instructions; keep tools unavailable during extraction/synthesis; delimit documents and allow only schema output. Split compound assertions when evidence supports only one clause. Cross-check amounts, units, dates and attributed speakers deterministically; use a separate verification call for semantic support. Expose “reported by,” “disputed,” and “insufficient evidence” rather than claiming an automated truth oracle. Faithfulness to an article does not establish that the article itself is true. Citation evaluation and QA-based factual consistency are complementary evidence, not proof. [18][19]

### 3. Model selection: September 2026 shortlist

These are **candidates to benchmark**, not a ranking established by this research. Use identical rights-cleared Korean, English and cross-language fixtures, and select the cheapest candidate that passes each stage's gates. Listed API availability is documentation-level evidence; account quotas and regional eligibility still need checking. [1][2][3]

| Candidate | Standard input / output per million tokens | Batch input / output | Proposed role |
|---|---:|---:|---|
| OpenAI `gpt-5.6-luna` | $0.20 / $1.20 | $0.10 / $0.60 | Default extraction, concise synthesis and first verification candidate. [1][2] |
| OpenAI `gpt-5.6-terra` | $2 / $12 | $1 / $6 | Difficult contradictions, long evidence packets, sampled comparison candidate. [2] |
| Claude Haiku 4.5 | $1 / $5 | $0.50 / $2.50 | Extraction and verification challenger. [3] |
| Claude Sonnet 5 | $2 / $10 | $1 / $5 | Cross-provider judge and hard-case synthesis challenger; $2/$10 is now standard, not the expired introductory-price assumption. [3] |
| Gemini 3.5 Flash-Lite | $0.30 / $2.50 | $0.15 / $1.25 | High-volume extraction/synthesis challenger. [4] |
| Gemini 3.8 Flash | $0.75 / $3.75 through 2026-12-31; then $1.50 / $7.50 | $0.375 / $1.875 through 2026-12-31; then $0.75 / $3.75 | Current stronger Flash challenger; do not project the promotional rate indefinitely. [4] |
| Qwen3.5-9B, self-hosted | No first-party per-token tariff for local weights; Apache-2.0 | Local job batching | Offline extraction/synthesis experiment; actual GPU time, memory, concurrency and Korean quality must be measured. [5] |

**Cost and retention details observed 2026-09-15:** OpenAI Batch discounts synchronous token prices by 50% with a 24-hour completion window. Claude and Gemini also document asynchronous batch processing; this is appropriate for backfills/evals, not a guaranteed breaking-news latency path. Use idempotent per-item IDs and retry only failed items. [6][7][8]

OpenAI GPT-5.6 caching requires a reusable prefix of at least 1,024 visible tokens; writes cost 1.25× input and reads 0.1×. Put stable instructions first and article text later, but do not assume all varying article tokens will hit cache. [9] Claude supports 5-minute and 1-hour cache lifetimes and model-specific minimum lengths; cache creation costs more than uncached input. [33] Gemini Flash-Lite's cache storage adds a time charge; the base scenario below claims no cache discount. [4]

#### Embeddings and Korean evidence

| Model / evidence | Verified observation | Recommendation / limitation |
|---|---|---|
| `text-embedding-3-small` | $0.02/million input tokens; large sibling $0.13/million. [20] | Hosted cost baseline. Neither price nor model-family reputation proves Korean clustering accuracy. |
| BAAI BGE-M3 | First-party card: 1,024 dimensions, 8,192-token inputs, dense/sparse/multi-vector modes and over 100 languages. [21] | Strong reproducible multilingual candidate; start dense-only, then test whether hybrid retrieval improves span recall. |
| Qwen3-Embedding-0.6B | Apache-2.0; first-party multilingual MTEB table reports mean-task 64.33 and clustering 52.33 versus BGE-M3 59.56/40.88; comparator snapshot is **2025-05-24**, not a September 2026 leaderboard. [22] | Efficient open candidate; rerun exact task subsets rather than promote the aggregate score as Korean evidence. |
| `upskyy/bge-m3-korean` | Author card reports KorSTS/KorNLI fine-tuning, 1,024 dimensions, and **self-reported** `sts-dev` cosine Spearman 0.8724. [23] | Korean challenger, not an independently verified event-clustering winner; training overlap and held-out split require inspection. |
| `multilingual-e5-large-instruct` | Author card truncates input at 512 tokens. [34] | Useful title/lead baseline; longer source evidence requires chunking. |
| Gemini Embedding 2 | Hosted text $0.20/million, batch $0.10/million; model maps several modalities into one space. [4] | Candidate if future multimedia retrieval matters; avoid paying for unused capabilities before a measured gain. |

**Evaluation proposal:** run Korean KLUE STS/NER subsets for sanity checks, plus a rights-cleared news event-pair set with same-event/different-event labels. KLUE is a Korean NLU benchmark, not a ready-made cross-language news-clustering ground truth. [35] Hold out whole events and publishers; test Korean↔Korean, English↔English and Korean↔English separately, including romanized names, reused headlines, different events involving the same politician and corrected numbers. Report pairwise F1, Recall@k of true event neighbours and final cluster scores; do not compare unrelated STS correlation and MTEB retrieval scores as one ranking. [12][22][23]

### 4. Per-stage and monthly model cost

**Scenario assumptions, not observations:** 1,000 ingested articles include 20% exact/near duplicates, leaving 800 analysed articles; each has 1,500 usable text tokens plus 300 prompt/schema tokens. Four unique articles form one event, yielding 200 event summaries. Each summary receives at most 3,000 tokens of extracted evidence/instructions and emits 350 tokens. A verification call per event uses 2,000 input/150 output tokens. Stance/framing runs on 25% of unique articles, using 1,000/120 tokens. Event-time extraction is included in the article extraction output. These are deliberately bounded evidence packets, not unconstrained full-context agents.

**Calculation formula:** `cost = calls × (input_tokens × input_rate + billed_output_tokens × output_rate) / 1,000,000`. Output allocations include any billable reasoning tokens; instrument actual usage because visible output alone can undercount billing. Luna's documented reasoning support and pricing do not guarantee these token allocations. [1]

**Cache assumption:** the base scenario selects `prompt_cache_options.mode: "explicit"` with no cache breakpoints, which performs no cache reads/writes; otherwise implicit cache creation could incur a write premium even when article text is not reused. [9]

| Stage per 1,000 ingested articles | Workload assumption | Million input / output tokens | Base API cost, USD |
|---|---|---:|---:|
| URL/hash dedup + clustering computation | Local worker/SQL; no generative model | — | $0 LLM charge; CPU/storage extra |
| Embeddings | 800 × 500 tokens, `text-embedding-3-small` | 0.400 / — | $0.008 [20] |
| Entities + claims + event times + span IDs | 800 × 1,800 / 250, Luna | 1.440 / 0.200 | $0.528 [1] |
| Multi-source synthesis | 200 × 3,000 / 350, Luna | 0.600 / 0.070 | $0.204 [1] |
| Sentence support / contradiction verification | 200 × 2,000 / 150, Luna | 0.400 / 0.030 | $0.116 [1] |
| Stance/framing on selected articles | 200 × 1,000 / 120, Luna | 0.200 / 0.024 | $0.0688 [1] |
| Timeline/KG materialisation | Reuse extracted times/entities; SQL | — | $0 additional LLM; separate prose timeline not included |
| Human-calibrated external judge sample | 10% of events: 20 × 4,000 / 300, Sonnet 5 | 0.080 / 0.006 | $0.220 [3] |
| **Base total** | Includes embedding and sampled judge | **2.720 / 0.330 LLM + 0.400 embedding** | **$1.1448** |

**Operational allowance (calculated):** apply 2× to synthesis, verification and the sampled judge to budget a second version per event; add 20% to all resulting API costs for failed calls/token variance; then reserve **$1.25 per 1,000 ingested articles** for harder-model escalation. This produces `(1.1448 + 0.204 + 0.116 + 0.220) × 1.20 + 1.25 = $3.27176` per 1,000. The escalation reserve funds approximately 50 Sonnet requests at 8,000 input/900 output each ($0.025/request), a planning limit rather than a quality guarantee. [3]

| Scenario, 30-day month | Per 1,000 ingested | 1k/day = 30,000/month | 5k/day = 150,000/month |
|---|---:|---:|---:|
| Base single-version workload | $1.1448 | $34.34 | $171.72 |
| Operational allowance above | $3.27176 | $98.15 | $490.76 |
| Plus fixed 500-case monthly eval: Sonnet 4,000/300 tokens each = $5.50 | Fixed +$5.50/month | **$103.65** | **$496.26** |
| Batch all eligible calls; same workload and half-cost escalation/eval, embeddings conservatively undiscounted | About $1.64068 + $2.75 fixed | **$51.97** | **$248.85** |

The monthly rows are **our arithmetic**, not vendor quotes; batch savings derive from documented token discounts. [2][3][6] The extra fixed evaluation is separate from production sampling. A human reviewer, data licence/API subscription, worker, database/vector storage, logs, egress, tax and exchange rates are **excluded**. No unsupported dollar estimate is assigned to those items. Paid news access can exceed this model budget, so compare total product cost after rights are resolved.

**Sensitivity calculations:** removing the assumed 20% duplicate saving multiplies article-proportional work by 1.25; long Korean texts must be tokenized per vendor rather than assigned an English word/token ratio. Reprocessing every new article instead of twice per event increases synthesis/review spend. Doubling all input-token allocations, including embeddings, adds $0.696 to the base per-1,000 calculation; doubling all output allocations adds $0.4488. A second-language summary/verification version adds approximately $0.32 per 1,000 before operational allowances. Every extra 1,000 billed Luna output tokens on all 800 extraction calls adds $0.96. These sensitivity rows hold all other scenario assumptions fixed. [1][3][20]

**Self-hosting calculation method:** report measured accelerator-seconds per 1,000 articles × actual hourly rental price / 3,600, plus idle hours, CPU, memory and operations. Local open weights have no API token bill, but this does not make serving free. Prefer a short measured Qwen3.5-9B experiment before procuring always-on GPU capacity. [5]

### 5. Evaluation that can be shown in a portfolio

SummEval (2021) combines automatic metrics with human assessments; QAFactEval (2022) evaluates factual consistency through question answering; ALCE (2023) separates correctness, citation support and coverage. None supplies a universal Korean-news pass threshold. [19][18][25] Use their measurement ideas, then publish project-specific evidence rather than importing paper scores.

**Proposed golden set:** begin with 300 rights-cleared event packets (100 Korean, 100 English, 100 mixed-language) and 1,000 difficult article pairs. Include politics/economy/technology, small outlets, breaking reports, corrections, negation, numerical disagreements, syndicated copies, unrelated same-entity events and instructions embedded in source text. Two people independently annotate at least a 20% subset; adjudicate disagreements, publish the rubric and inter-annotator agreement. If only one annotator is available, disclose that limitation. Split by event and time; keep a frozen held-out set separate from prompt tuning. These sample counts are a solo-development proposal, not a power analysis.

| Dimension | Metric / test | Proposed release use |
|---|---|---|
| Summary faithfulness | Atomic supported claims / factual claims; contradiction and unsupported-claim rate; QA-based consistency as secondary signal. [19] | Human-audit unsupported claims by language/topic; zero critical fabricated attribution/date/amount in the release sample, with denominator and confidence interval. |
| Citation integrity | Exact existence of article/version/span; citation precision = supported citation links / inspected links; completeness = factual claims with sufficient supporting citations / factual claims. Adapt ALCE to the project's atomic claims. [18] | 100% valid resolvable span IDs is a deterministic gate; semantic correctness requires manual/judge validation. |
| Coverage | Gold salient facts covered / gold salient facts; independent-source contribution, unresolved disagreement retention. [15][25] | Compare against lead-only and extractive baselines; long fluent summaries must not win by length alone. |
| Clustering | Adjusted Rand Index (ARI) and Normalized Mutual Information (NMI), plus pairwise precision/recall/F1 and merge/split errors. ARI adjusts agreement for chance; NMI does not. [12] | Report singleton/noise treatment explicitly; do not put all unrelated noise in one “true” event. Use event-held-out thresholds. |
| Stance/entity/time | Macro-F1 and per-class precision/recall; span F1 for entities; event-time/date precision; abstention coverage. [13][16][17] | Separate speaker stance from journalist framing; evaluate Korean and English independently. |
| Operations | p50/p95 ingestion-to-publication delay, cost per accepted summary, stale/corrected output rate, retry rate | Proposed observability; display measurement window and sample size, not fabricated SLA claims. |

**LLM-as-judge safeguards:** the 2023 MT-Bench study documents position, verbosity and self-enhancement bias; its agreement result is benchmark-specific. [26] Proposal: hide producer/model IDs, randomize paired answer order and run both orders on a subset, cap lengths, give a binary rubric per atomic claim plus source evidence, and calibrate against the human-labelled subset. Track judge-human confusion matrices and changes between judge versions. Use another provider as one check, but do not call a second model independent ground truth. Keep source errors and judge errors distinct.

**Proposed CI and feedback loop:** every change runs deterministic schema/span/URL/time/rights fixtures and a small fixed regression set; nightly or release runs regenerate the larger set with pinned model/prompt/data versions and a dollar ceiling. Store metric JSON, evaluation script version, dataset manifest/checksums, failure examples and report links in the eventual evaluation area approved by the planner. A dashboard should show baseline-versus-current scores by language/topic, counts/confidence intervals, latency/cost and known failures. Publish article text or excerpts in reports only when licensed. Reader feedback should identify a summary sentence and reason (unsupported, outdated, wrong cluster, missing context), enter a review queue, and become a held-out regression case after adjudication. These are recommendations, not artifacts created by this ticket. [18][25][26]

### 6. Reference implementations

GitHub observations below were retrieved **2026-09-15**. Stars are the page's displayed counts (rounded where `k` is used). “Last commit” means the newest visible default-branch entry, not a guarantee that an authenticated API would expose no newer change. Repository licences cover code, not the publisher data a demo may ingest.

| Repository | Stars | Last visible commit | Licence | Read for / limitation |
|---|---:|---|---|---|
| FreshRSS/FreshRSS | 16.0k | 2026-09-14, `74092a7`, `edge` | AGPL-3.0 | Mature feed aggregation, refresh/import/read-state UX; reference architecture, not an AI clustering system. [27][28] |
| RSSNext/Folo | 39.0k | 2026-09-12, `44f0e5d`, `dev` | AGPL-3.0; `icons/mgc` redistribution exception | AI RSS reader and client interaction patterns; review file-specific asset restrictions before reuse. [29][30] |
| aws-samples/news-clustering-and-summarization | 46 | 2025-03-13, `6174ccd`, `main` | **LICENSE file: MIT-0**; README incorrectly says Amazon Software License | End-to-end micro-batch embedding/DBSCAN and summary-trigger logic. Useful concepts; AWS service topology and stale dependencies require adaptation for a solo project. [31][32][36] |
| MaartenGr/BERTopic | 7.8k | 2026-08-27, `9036123`, `master` | MIT | Embedding → clustering → c-TF-IDF representations and online variants; broad topics are not automatically same-event clusters. [24][37] |
| princeton-nlp/ALCE | 527 | 2024-10-09, `246c476`, `main` | MIT | Citation evaluation, retrieval, post-hoc citation baselines and human evaluation; older model/configuration assumptions need modernization. [38][39] |

## Options & trade-offs

| Choice | Advantage | Cost / risk | Position |
|---|---|---|---|
| Licensed curated corpus first | Every displayed claim can have an auditable evidence trail | Smaller coverage; contract lead time | Recommended launch constraint; rights must cover AI input and derived display, not just API access. |
| Metadata/link discovery only | Lower stored-content footprint | Cannot honestly provide detailed full-article analysis | Valid fallback product; label analysis of metadata and do not fill missing article facts from model memory. |
| Online centroid/event assignment | New events can appear immediately; incremental work | Threshold drift, accidental chaining, cluster splits | Recommended initial event baseline with a frozen evaluation set. [10] |
| HDBSCAN / agglomerative refits | Inspectable offline alternatives; easy comparisons | Refit cost and unstable membership; fixed-cluster prediction limits | Benchmark on bounded recent windows before adopting. [11][12] |
| Small hosted LLM + escalation | Low operational burden; explicit cost envelope | External data-processing permissions and model drift | Recommended default, subject to Korean evaluation. [1][3] |
| Self-hosted Qwen | Version control and local processing | Serving, memory, monitoring and quality validation | Offline comparator first. [5] |
| Public bias score | Simple to display | False precision and cross-country label mismatch | Defer; show source-backed framing/stance differences instead. [16] |
| Batch / cache | Lower cost on suitable repeated or delayed work | Batch latency, cache minimums/writes/storage | Batch backfills/evals; synchronous news updates; measure actual cache reuse. [6][7][8][9][33] |

## Recommendation

**Opinionated proposal:** ship one complete, licensed evidence-to-event slice before increasing source count. Maintain separate Korean and global rights inventories and evaluation slices. Make source spans, conflicting claims, correction history and “what changed since the previous version” visible product features. A link to a real source is insufficient if that source does not support the displayed sentence. [18]

Start with deterministic deduplication, multilingual embeddings and a simple online event assignment baseline; compare BGE-M3, Qwen3-Embedding-0.6B and a hosted embedding on the same Korean/English pairs. Use Luna as the initial cost candidate and benchmark Haiku/Flash-Lite on extraction, with Sonnet as a sampled verifier and escalation candidate. This is a hypothesis to test, not a claim of best quality. Keep prompts, event IDs, evidence hashes and pricing revisions inspectable. [1][3][4][10][21][22]

Use the operational scenario as an initial **roughly $105/month at 1k/day or $500/month at 5k/day model allowance**, then replace assumptions with token telemetry. Budget rights and infrastructure separately. Publish no performance number without a reproducible evaluation report, baseline and error breakdown. Keep a small corpus and human review until citation support, event precision and correction handling meet explicit owner-approved gates. [18][19][25][26]

## Open questions for the interview

1. Is the first audience Korean, global-English, or bilingual, and which language should mixed-source summaries use?
2. Is a curated licensed demonstration acceptable, or is broad live coverage essential at launch?
3. Will the public portfolio contain ads, subscriptions or other commercial promotion, and what monthly data-licence budget is acceptable?
4. Which publishers are important enough to pursue a licence covering storage, AI inference, embeddings, translations, summaries, public snippets and evaluation examples, and how long can launch wait for those agreements?
5. How fresh must a story be: minutes, hours, or a daily digest? Can backfills and evaluation wait for batch processing?
6. Should source disagreement be shown without resolving it, and which topics require human approval before publication?
7. Who can provide a second Korean/English annotation pass, and how much review time is available each week?
8. Is framing/stance comparison sufficient, or is a political-bias label a required product promise that warrants a separate validated project?
9. What retention/correction/takedown behaviour should readers see when a source changes or its permission expires?

## Sources

All sources accessed **2026-09-15**. Numbers identify primary documentation, repositories, papers or authoritative legal materials; historical benchmark dates are explicitly retained above.

1. OpenAI, GPT-5.6 Luna model and pricing — https://developers.openai.com/api/docs/models/gpt-5.6-luna (accessed 2026-09-15).
2. OpenAI, API pricing — https://developers.openai.com/api/docs/pricing (accessed 2026-09-15).
3. Anthropic, model pricing — https://platform.claude.com/docs/en/about-claude/pricing (accessed 2026-09-15).
4. Google, Gemini Developer API pricing — https://ai.google.dev/gemini-api/docs/pricing (accessed 2026-09-15).
5. Qwen, Qwen3.5-9B model card — https://huggingface.co/Qwen/Qwen3.5-9B (accessed 2026-09-15).
6. OpenAI, Batch API — https://developers.openai.com/api/docs/guides/batch (accessed 2026-09-15).
7. Anthropic, batch processing — https://platform.claude.com/docs/en/build-with-claude/batch-processing (accessed 2026-09-15).
8. Google, Batch API — https://ai.google.dev/gemini-api/docs/batch-api (accessed 2026-09-15).
9. OpenAI, prompt caching — https://developers.openai.com/api/docs/guides/prompt-caching (accessed 2026-09-15).
10. Miranda et al. (2018), Multilingual Clustering of Streaming News — https://aclanthology.org/D18-1483/ (accessed 2026-09-15).
11. HDBSCAN, predicting clusters for new points — https://hdbscan.readthedocs.io/en/latest/prediction_tutorial.html (accessed 2026-09-15).
12. scikit-learn, clustering guide and evaluation — https://scikit-learn.org/stable/modules/clustering.html ; agglomerative API — https://scikit-learn.org/stable/modules/generated/sklearn.cluster.AgglomerativeClustering.html (accessed 2026-09-15).
13. Zaratiana et al. (2024), GLiNER — https://aclanthology.org/2024.naacl-long.300/ (accessed 2026-09-15).
14. Fabbri et al. (2019), Multi-News — https://aclanthology.org/P19-1102/ (accessed 2026-09-15).
15. Wolhandler et al. (2022), How “Multi” is Multi-Document Summarization? — https://aclanthology.org/2022.emnlp-main.389/ (accessed 2026-09-15).
16. Spinde et al. (2021), BABE — https://aclanthology.org/2021.findings-emnlp.101/ (accessed 2026-09-15).
17. Ghalandari and Ifrim (2020), Examining the State-of-the-Art in News Timeline Summarization — https://aclanthology.org/2020.acl-main.122/ (accessed 2026-09-15).
18. Gao et al. (2023), Enabling Large Language Models to Generate Text with Citations — https://aclanthology.org/2023.emnlp-main.398/ (accessed 2026-09-15).
19. Fabbri et al. (2022), QAFactEval — https://aclanthology.org/2022.naacl-main.187/ (accessed 2026-09-15).
20. OpenAI, text-embedding-3-small model — https://developers.openai.com/api/docs/models/text-embedding-3-small (accessed 2026-09-15).
21. BAAI, BGE-M3 model card — https://huggingface.co/BAAI/bge-m3 (accessed 2026-09-15).
22. Qwen, Qwen3-Embedding-0.6B model card / dated MTEB table — https://huggingface.co/Qwen/Qwen3-Embedding-0.6B (accessed 2026-09-15).
23. upskyy, BGE-M3 Korean model card — https://huggingface.co/upskyy/bge-m3-korean (accessed 2026-09-15).
24. BERTopic repository — https://github.com/MaartenGr/BERTopic (accessed 2026-09-15).
25. Fabbri et al. (2021), SummEval — https://aclanthology.org/2021.tacl-1.24/ (accessed 2026-09-15).
26. Zheng et al. (2023), Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena — https://arxiv.org/abs/2306.05685 (accessed 2026-09-15).
27. FreshRSS repository — https://github.com/FreshRSS/FreshRSS (accessed 2026-09-15).
28. FreshRSS default-branch commits — https://github.com/FreshRSS/FreshRSS/commits (accessed 2026-09-15).
29. Folo repository and licence exception — https://github.com/RSSNext/Folo (accessed 2026-09-15).
30. Folo default-branch commits — https://github.com/RSSNext/Folo/commits (accessed 2026-09-15).
31. AWS news clustering and summarization repository — https://github.com/aws-samples/news-clustering-and-summarization (accessed 2026-09-15).
32. AWS sample default-branch commits — https://github.com/aws-samples/news-clustering-and-summarization/commits (accessed 2026-09-15).
33. Anthropic, prompt caching — https://platform.claude.com/docs/en/build-with-claude/prompt-caching (accessed 2026-09-15).
34. intfloat, multilingual-e5-large-instruct model card — https://huggingface.co/intfloat/multilingual-e5-large-instruct (accessed 2026-09-15).
35. KLUE benchmark repository — https://github.com/klue-benchmark/KLUE (accessed 2026-09-15).
36. AWS sample LICENSE — https://github.com/aws-samples/news-clustering-and-summarization/blob/main/LICENSE (accessed 2026-09-15).
37. BERTopic default-branch commits — https://github.com/MaartenGr/BERTopic/commits (accessed 2026-09-15).
38. ALCE repository — https://github.com/princeton-nlp/ALCE (accessed 2026-09-15).
39. ALCE default-branch commits — https://github.com/princeton-nlp/ALCE/commits (accessed 2026-09-15).
40. NewsAPI pricing — https://newsapi.org/pricing (accessed 2026-09-15).
41. NewsAPI terms — https://newsapi.org/terms (accessed 2026-09-15).
42. GNews pricing — https://gnews.io/pricing (accessed 2026-09-15).
43. GNews terms, updated 2026-06-22 — https://gnews.io/legal/terms-of-service (accessed 2026-09-15).
44. BBC terms PDF, RSS section 15; legacy policy reference — https://downloads.bbc.co.uk/usingthebbc/bbc_terms_of_use.pdf (accessed 2026-09-15; current 2026 permission requires confirmation).
45. GDELT project / dataset policy — https://gdeltproject.org/about.html (accessed 2026-09-15).
46. GDELT DOC 2.0 API documentation, original 2017 — https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/ (accessed 2026-09-15).
47. Guardian Open Platform access and commercial tiers — https://open-platform.theguardian.com/access/ (accessed 2026-09-15).
48. Guardian Open Platform terms — https://www.theguardian.com/open-platform/terms-and-conditions (accessed 2026-09-15).
49. NYT official API specification repository — https://github.com/nytimes/public_api_specs (accessed 2026-09-15; current portal/FAQ quotas and terms unverified).
50. Mediastack pricing — https://mediastack.com/pricing (accessed 2026-09-15).
51. APILayer terms — https://www.ideracorp.com/legal/APILayer ; Mediastack API documentation — https://docs.apilayer.com/mediastack/docs/api-documentation (retrieval attempted 2026-09-15; terms timeout / documentation login shell, substantive permissions unverified).
52. English Wikinews copyright policy — https://en.wikinews.org/wiki/Wikinews%3ACopyright (accessed 2026-09-15).
53. NAVER API HUB News Search documentation — https://api.ncloud-docs.com/docs/en/naver-api-hub-search-news (accessed 2026-09-15).
54. NAVER Developers, Search terms amendment notice, 2026-09-07 — https://developers.naver.com/notice/article/33400 (accessed 2026-09-15).
55. NAVER Developers, API HUB migration notice — https://developers.naver.com/notice/article/32530 (accessed 2026-09-15).
56. Kakao, Daum Search API catalog — https://developers.kakao.com/docs/ko/daum-search/common (accessed 2026-09-15).
57. Kakao, quotas — https://developers.kakao.com/docs/ko/getting-started/quota (accessed 2026-09-15).
58. Kakao, operating policies — https://developers.kakao.com/terms/ko/site-policies (accessed 2026-09-15).
59. SBS, RSS catalog and usage policy — https://news.sbs.co.kr/news/rss.do ; catalogued newsflash feed — https://news.sbs.co.kr/news/newsflashRssFeed.do?plink=RSSREADER (catalog accessed 2026-09-15; XML content not parsed by research tool).
60. Hankyoreh, digital use policy — https://oauth.hani.co.kr/help/rules/mypage_help_copyright.html?type=digital_use_rule (accessed 2026-09-15).
61. Kyunghyang, digital use policy — https://www.khan.co.kr/help/help_digital.html (accessed 2026-09-15).
62. Hankyoreh, historical RSS launch announcement (2005) — https://notice.hani.co.kr/customer_view.html?bid=notification&no=333&page=40 (accessed 2026-09-15).
63. BigKinds user manual, API application section 7.5 — https://bigkinds.or.kr/manual/빅카인즈_사용자매뉴얼.pdf (accessed 2026-09-15).
64. BigKinds search/export UI and copyright notice — https://www.bigkinds.or.kr/v2/news/index.do (accessed 2026-09-15).
65. Yonhap copyright / AI-use notice, 2026-05-01 — https://www.yna.co.kr/view/AKR20260501034500011 (accessed through official indexed notice 2026-09-15).
66. Korea Policy Briefing copyright policy — https://m.korea.kr/etc/copyRight.do?pWise=mSub&pWiseSub=copyRight (accessed 2026-09-15).
67. Korea Policy Briefing RSS service termination notice, effective 2026-07-01 — https://www.korea.kr/etc/noticeView.do?newsId=132038885&pWise=main&pWiseSub=O1 (accessed 2026-09-15).
68. Korea Copyright Act — https://www.law.go.kr/lsInfoP.do?ancYnChk=0&lsId=000798 (accessed 2026-09-15).
69. IETF RFC 9309, Robots Exclusion Protocol (2022) — https://www.rfc-editor.org/rfc/rfc9309.html (accessed 2026-09-15).
70. Korea Supreme Court, 2006-09-14, 2004도5350 — https://www.law.go.kr/LSW/precInfoP.do?evtNo=2004%EB%8F%845350&mode=0 (accessed 2026-09-15).
71. Korea Supreme Court, 2016-05-26, 2015도16701 — https://www.law.go.kr/LSW/precInfoP.do?precSeq=187803 (accessed 2026-09-15).
72. US Copyright Office, 17 USC §107 — https://www.copyright.gov/title17/92chap1.html#107 (accessed 2026-09-15).
73. US Copyright Office, AP v. Meltwater (S.D.N.Y. 2013) official fair-use case summary — https://www.copyright.gov/fair-use/summaries/ap-meltwater-sdny2013.pdf (accessed 2026-09-15).
74. EU Directive 2019/790 — https://eur-lex.europa.eu/legal-content/EN-FR/TXT/?uri=CELEX%3A32019L0790 (accessed 2026-09-15).
