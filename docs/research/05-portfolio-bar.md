# Research #5: A hire-worthy news-analysis product

## 요약

- 채용용 완성도는 기능 수보다 문제 정의, 작동하는 제품, 검증 가능한 판단·결과로 보여주는 편을 권한다. [1][3][8]
- 풀스택 지원에는 UX·API·데이터·배포·장애 대응을, AI/ML 지원에는 데이터·평가·오류 분석·비용 절충을 앞세운다. [1][9][10]
- 한국은 원티드 조사와 토스 안내, 글로벌은 GitLab 채용 기준을 따로 확인했다. 특정 기업 사례를 시장 전체로 일반화하지 않는다. [1][7][8]
- HN·Reddit 채용자 의견도 서로 다르다. 포트폴리오는 채용 보장이 아닌 면접에서 검증할 증거다. [5][6]
- 핵심 시연은 ‘뉴스 묶음 → 근거 있는 요약 → 원문 확인 → 변경·실패 상태’로 좁힐 것을 권한다. [33][35][36]
- README에서 데모·역할·핵심 결정·테스트·평가·한계에 바로 접근하게 한다. [11][12][13]
- 공개 데모는 합법적인 고정 데이터로 항상 재현 가능하게 하고, 실제 수집·추론 모드와 명확히 구분한다. [14][30]
- 인증·권한·비용 제한·접근성·오류 상태·개인정보/출처 표기·모니터링을 공개 전 필수 항목으로 제안한다. [19][20][21][22][28][30][31]
- 성능은 LCP ≤ 2.5초, INP ≤ 200ms, CLS ≤ 0.1을 목표로 삼되 실측 전에는 달성했다고 쓰지 않는다. [25]
- 모델 점수만 내세우지 말고 평가셋 버전, 시간 분리, 언어별 실패 사례, 비용과 재실행 방법을 공개한다. [33][34][35]
- 아래 체크리스트는 제안된 포트폴리오 기준이며 현재 구현 감사·법적 적합성 인증·합격 예측이 아니다.

## Scope

**Evidence cut-off and access date: 2026-09-15.** This answers the local issue #5 brief for a solo-built AI general-news product targeting full-stack and AI/ML engineering roles. Korea and global hiring evidence are separated below; the launch market remains undecided. This is a research deliverable, not implementation work or a new stack decision.

**Dating convention:** Every undated/live document, repository observation and proposed recommendation below is a **2026-09-15 snapshot**. Older evidence carries its publication date or an explicit historical/uncertain-date label. Retrieval today does not turn an old survey into a 2026 survey. Sources give access dates; no post-cut-off facts or unverified hiring-rate estimates are used.

**Evidence limits:** Official employer guides describe those employers, not the entire labor market. First-person hiring essays and community comments are qualitative evidence; pseudonymous hiring credentials are unverified. No representative September 2026 Korea-versus-global portfolio-outcome study was established in this research. Repository examples were inspected through their public README/file pages; their applications and test suites were not executed. Recommendations, priorities, demo durations and experiment designs are the author's synthesis, not claims that the project already meets them.

## Findings

### 1. What reviewers can actually assess

#### Global evidence: distinguish employer criteria from anecdotes

| Evidence and date | What the source actually says | Application to this portfolio — inference |
|---|---|---|
| GitLab full-stack role, live snapshot 2026-09-15 | Responsibilities include secure, tested, performant features; requirements include clear technical communication and diagnosing/preventing performance problems. [1] | Present one complete UI-to-database journey, its authorization boundary, meaningful tests and a measured performance decision. |
| GitLab technical interview, live snapshot 2026-09-15 | Uses a small application's merge request, asynchronous review, discussion and coding to assess technology knowledge, communication and collaboration. [2] | Make an issue → decision → change → test trail readable; expect to explain and modify the code in conversation. |
| Joel Spolsky, engineering hiring essay, 2006-10-25; historical | Describes assessing reasoning and delivery through recent projects, explanations, personal contributions and coding. His interview process is historical opinion, not a current universal standard. [3] | Explain what problem you owned, how you decided, what shipped and what you learned. |
| Josh Comeau, first-person hiring/career guide, undated page describing 2020 portfolio reviews | Reports hiring involvement and argues for guiding employers through the relevant parts of a project; polished templates alone can miss that purpose. The guide primarily targets early-career frontend applicants in the US/Canada. [4] | Lead with a case study and evidence links instead of a technology-logo gallery; extrapolation to other roles/markets is limited. |
| HN, 2017-05-25/26 thread; historical, self-described hiring voice | `kasey_junk` prioritizes engineering, documentation and tests for junior/academic portfolios, explicitly distinguishing research hiring. [5] | Quality of engineering evidence is a defensible target, but this comment does not establish market prevalence. |
| Reddit r/nextjs, August 2024 thread; historical, deleted-account author | A commenter identifying as someone who hires developers says a specific ffmpeg/WASM project matched the startup's needs; recommends fully working projects and a write-up. Identity and outcome cannot be independently verified. [6] | Tailor the entry point to the job. This narrowly relevant-project preference differs from a universal demand for novelty or breadth. |

**Conclusion — inference:** Use a portfolio to make skills inspectable, not as a substitute for interviews or professional experience. Do not claim a fixed reviewer attention span, required number of projects, guaranteed interview uplift, or universal requirement for public side projects: the cited evidence does not establish those claims. [1][2][3][5][6]

#### Korean evidence: separate platform data and employer guidance

| Evidence and date | Finding | Implication and limitation |
|---|---|---|
| Wanted's developer report; historical report discussing 2019–2022 hiring data and 2023 interests; exact survey fieldwork date unverified | Its online survey has 508 total respondents and separates people with interviewing experience from other respondents. It ranks communication and project experience highly; portfolios are only one evaluation item. [7] | A Korean recruiting-community/platform source supports explaining decisions and contributions. The interviewer subgroup is not the whole 508-person sample; do not present its percentages as September 2026 market estimates. |
| Toss joining guide, live snapshot 2026-09-15 | Asks for specific impact and learning, welcomes failures with attempted improvements, requests developer stack information, and advises tailoring to the posting. [8] | A Korean case-study summary should make problem → action → result → learning and personal ownership explicit. This is Toss's guidance, not a Korean cultural rule. |
| Toss Securities ML Engineer (LLM) posting, live snapshot 2026-09-15 | Describes AI-service problem definition, data construction, feature design, NLP/LLM experimentation and operation, cross-functional work, and explaining why an approach fits. [9] | Give Korean AI/ML reviewers access to the dataset, design rationale and product evaluation, not only an API integration screenshot. Job availability and requirements can change. |

**Localization recommendation — inference:** Maintain one technical evidence base with a concise Korean application narrative for Korean employers and an English entry point for global applications. Follow the actual posting's language and format requirements. These sources do not justify claiming that Korean employers prefer PDFs universally or that global employers always inspect GitHub. [1][8][11]

#### Full-stack versus AI/ML: two routes through the same project

Chip Huyen's interview guide draws on her own hiring work at NVIDIA and Snorkel AI and distinguishes ML roles and their skill requirements; its older examples are useful conceptual context, not September 2026 vacancy data. Applied LLM product work and model-research work must not be presented as interchangeable qualifications. [10]

| Target | Recommended evidence, not a universal hiring rubric | Interview explanation to prepare |
|---|---|---|
| Full-stack engineer | Accessible story discovery/detail flow; API/data model; per-user authorization; ingestion retries; tests and CI; deployment, rollback and performance evidence. [1][2] | Trace one request and one failed ingestion. Explain consistency, user feedback, security and a scoped trade-off. |
| Applied AI / ML product engineer | Dataset provenance; summarization/clustering baselines; reproducible evals; retrieval/citation errors; latency/cost; safe degraded behavior. [9][34][35] | Explain why AI helps this user, how quality was measured and what happens when it is wrong. |
| ML engineer with training/serving responsibilities | Add a justified learned component, leakage controls, training/configuration reproducibility, model/version lineage and deployment monitoring when the target posting requires them. [9][10][34] | Defend split strategy, optimization/evaluation choices and production failure diagnosis. An external-API-only project does not prove model-training experience. |
| Research-oriented ML role | Treat this app as supporting engineering evidence; a research contribution requires its own experiments, baselines and role-specific evidence. [5][10] | Explain the scientific question and validity of the experiment; do not rename prompt iteration as novel model research. |

### 2. Repo presentation that makes the evidence accessible

GitHub's own resume guidance recommends highlighting relevant projects and making them understandable through READMEs, setup/testing information and demonstrations. C4 separates a system's external context from its internal applications/data stores. GitHub workflow badges report a workflow's state, not the correctness of the entire product. [11][12][13]

**Proposed README/case-study skeleton:** These headings are a future presentation proposal only; this ticket does not create or edit README, ADRs or domain documents. The organization below is a synthesis of the referenced presentation and architecture guidance. [4][11][12]

```text
1. Product in one sentence; intended reader and problem
2. Demo / repository navigation / captioned video; demo mode and reset policy
3. What works today; explicit non-goals and known limitations
4. My contribution; provenance of reused code and AI-assisted development
5. A concrete case study: problem → alternatives → decision → measured outcome
6. Architecture: context + container view; links to code and data flow
7. Run locally: prerequisites, environment names, seed/reset, start/test commands
8. Quality: CI run, critical tests, accessibility/performance measurement conditions
9. AI evidence: evaluation dataset/version, baselines, failures, latency and cost
10. Operations: freshness, monitoring, rollback, restore and expense limits
11. Domain/decision index: authoritative CONTEXT/glossary and selected ADR links
12. License, content provenance, privacy/terms, contact and focused open issues
```

**Supporting artifacts — recommendations:** Keep a small glossary for `article`, `story cluster`, `source`, `claim`, `citation`, `as-of time` and `analysis version`, with one authoritative definition per term. Link a few consequential ADRs documenting context, alternatives, decision, consequences and revisit triggers. Show actual services and trust boundaries in a diagram; add a sequence for delayed ingestion or analysis failure if useful. Avoid diagrams containing components that do not exist. [12][16][34]

**Demonstration and history — recommendations:** Provide licensed, deterministic seed data and a resettable/read-only demo; identify fixture mode versus current upstream ingestion. Add a captioned **2–3 minute** video, an optional small GIF, and a text walkthrough as fallbacks; the duration is a proposed convenience, not a hiring statistic. Keep commits truthful and cohesive, preserve provenance and secret hygiene, and link genuine scoped issues with acceptance criteria, alternatives and verification. Do not fabricate collaborators, commit density, users or process history. Put CI/test links beside specific claims; badges alone are insufficient evidence. [2][11][13][14][30]

#### Four public repositories worth studying

All observations below were checked on **2026-09-15**. These are presentation/process exemplars, not evidence that copying them gets someone hired. They are mature projects with resources beyond a solo portfolio; borrow the communication pattern, not their feature counts or infrastructure footprint. [14][15][17][18]

| Repository | Directly observed evidence | Why it works for this task — interpretation | What not to copy |
|---|---|---|---|
| [Immich](https://github.com/immich-app/immich) | README offers demo access, installation/docs links, translated READMEs, a feature matrix and an explicit backup warning; tree exposes web, server, machine-learning and e2e directories. [14] | A reader can understand capability, try it and discover limitations quickly. Model the discoverability and honest operations caveat. | Its mobile/media scope; a directory named `e2e` is not proof its current tests pass. |
| [PostHog](https://github.com/PostHog/posthog) | Public tree exposes frontend/backend, Playwright, contribution and issue/PR surfaces; `COMPROMISES.md` records deliberate cuts, consequences and follow-up conditions. [15][16] | Makes engineering decisions discussable rather than presenting the product as flawless. Borrow a short decision/limitation trail. | Its multi-product architecture or known compromises; documenting a hazard does not make it acceptable for this app. |
| [Langfuse](https://github.com/langfuse/langfuse) | README links demo, docs, changelog and roadmap; explains traces, datasets and evaluation capabilities, with executable integration examples and self-host instructions. [17] | Connects an AI engineering problem to inspectable tooling and a path to reproduce it. Borrow the dataset → evaluation → trace explanation. | Self-hosting an observability platform solely to look sophisticated; tool installation does not constitute an evaluation result. |
| [LiteLLM](https://github.com/BerriAI/litellm) | README explains the gateway/SDK, integration examples and operational capabilities including cost tracking, logging and routing. [18] | Makes integration boundaries and operational concerns visible. Borrow concrete examples and cost/failure documentation. | Broad provider support claims unless tested locally; provider count is not evidence of this project's reliability. |

### 3. Proposed production-grade portfolio checklist

**Priority semantics:** **Must** = before sharing the applicable public flow; **Should** = valuable next increment for the target role; **Nice** = optional polish. Conditional Must items become mandatory only when that feature/data exposure exists. These are recommendations based on the cited standards/guides, not a compliance certification or industry-wide hiring threshold. Every evidence cell is something to produce and verify, not an assertion about the current code. [1][19][20][22][31]

| Area | Priority | Proposed acceptance evidence |
|---|---|---|
| Authentication and sessions | **Must if accounts exist** | HTTPS; reviewed session lifecycle; secure cookie settings where cookies carry sessions; expiry/revocation/logout; server-side authorization. Test expired session, account A accessing B's data and access after logout. Anonymous reading can ship before accounts. [19] |
| API and abuse boundaries | **Must** | Keep provider keys server-side; constrain request/body sizes, concurrency, retries, timeouts and external spend. Test rate-limit response, duplicate request and expensive-work cancellation/stop. Demo traffic must not create unlimited inference bills. [20] |
| Empty/loading/error states | **Must** | Exercise no stories, no search results, ingestion pending, stale data, provider timeout, offline and partial analysis. Distinguish “nothing matched” from “fetch failed”; offer a meaningful next action and accessible status/error feedback. [21][22] |
| Accessibility | **Must for core journey** | Aim for WCAG 2.2 AA: semantic controls, keyboard access, visible/unobscured focus, labels, contrast, reflow and accessible status messages. Verify manually with keyboard and screen reader as well as automated checks; publish known gaps rather than declaring conformance from one score. [22] |
| SEO | **Must for public indexable story pages** | Unique titles/descriptions, crawlable links, canonical handling and meaningful HTTP status codes; inspect rendered content. Keep private/demo-only duplicate pages out of the indexing plan intentionally. [23] |
| Open Graph sharing | **Should** | Per-story title/type/image/URL metadata visible to the intended preview fetcher; verify an actual preview. Provide a safe fallback image and correct source/context. Open Graph lists those four as its basic required properties. [24] |
| Core Web Vitals | **Must measurement and budget; Should field verification when traffic permits** | Target p75 **LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1**, segmented by mobile/desktop. Record URL, build, device/network and method; do not claim a field pass without sufficient real-user data. [25][37] |
| i18n | **Must correctness for supported languages; Should second language** | Declare document/passage language, externalize copy and format dates/numbers consistently. Test Korean IME search, long headlines, fallback text and timezone labels. Full Korean+English product launch is conditional on the owner's market decision. [26] |
| Analytics | **Should** | A minimal event plan for story open → source click → return/feedback, with clear definitions and privacy review. Show aggregate sample size and collection window; do not imply product-market fit from seed traffic. Avoid capturing full article text or personal query content by default. [28][29][31] |
| Feature flags | **Should; Must a way to stop paid AI work** | A server-enforced kill switch and deterministic fallback if flag evaluation fails. A config switch suffices initially; a full flag platform and A/B experimentation suite are **Nice**. [20][27] |
| Onboarding | **Must** | First visit explains the reader benefit and how to verify sources; offer an example story without compulsory signup. Explain any genuinely necessary account step and give form feedback; a multi-step tour is **Nice**. [4][14][21] |
| Privacy notice | **Must for actual data collection** | Accessible notice matching real analytics, logs, accounts and AI processors: purpose, data, retention, sharing and user contact/rights. Korea's PIPC updated its guidance on 2026-04-24, including generative-AI considerations; EU-facing applicability needs a separate market/data assessment. [28][29] |
| Terms and service limitations | **Should; Must resolve applicable obligations before a public service launch** | Describe allowed use, availability limitations, AI limitations and contact/removal process truthfully. Do not copy an unrelated company's policies or imply that a terms page alone establishes legal compliance. Applicable requirements depend on countries, data and service model. [28][29][36] |
| Content attribution and rights | **Must** | Show publisher, original URL, publication time and analysis time; record fixture/feed licenses and allowed reproduction. Korea Copyright Commission distinguishes protected news expression from unprotected factual reporting; attribution or noncommercial intent alone is not a blanket permission to reproduce articles. [30] |
| Uptime and freshness monitoring | **Must** | External smoke check of a real story flow/API, an actionable alert, error logging without secrets, last-successful ingestion timestamp and stale-data state. Track latency/errors/traffic/resource saturation as useful; a public status page is **Nice**. [31] |
| Backups and recovery | **Must for persistent user data; seed rebuild Must otherwise** | Document coverage, retention, proposed recovery objectives and a performed restore drill. Include object files separately when needed: Supabase, for example, says database backups exclude Storage objects. A backup toggle alone is not restore evidence. [32] |
| Tests, CI and delivery | **Must** | Reproducible setup; unit tests of critical transformations, API/auth/data-boundary integration tests, one E2E reader journey plus failure case; CI links and a known deployed revision/rollback procedure. Choose tests for risks, not an arbitrary coverage percentage. [1][2][13][34] |

**Performance interpretation:** Lighthouse's default load test does not measure INP because there is no user input; TBT is a lab proxy, not the same metric. PageSpeed Insights field data can be absent for low-traffic URLs and uses a rolling 28-day window. Publish lab findings separately from field findings and label “insufficient field data” honestly. The above thresholds are external definitions of “good,” while any project-specific payload or API budget is a proposed target until measured. [25][37][38]

### 4. Common portfolio failure modes and prevention

This is a qualitative risk list synthesized from reviewer guidance and engineering references, not a measured ranking of how often applicants fail. [3][4][5][11]

| Failure mode | How to avoid it / evidence to show |
|---|---|
| Many unfinished features | Bound the release to one useful journey; explicitly remove or label unsupported actions; demonstrate loading, failure and completion. Keep future ideas in scoped issues. [1][4][21] |
| No tests, or only badge/coverage theater | Show a regression that failed before its fix, an authorization boundary test and a user-flow test; link the exact run and explain remaining coverage gaps. [2][13][34] |
| Dead demo or setup that needs the author | Maintain seeded fallback mode, exercise the live link externally and retain a dated recording plus documented local setup. Clearly label cached/fixture content. [11][14][31] |
| Tutorial clone with cosmetic changes | Credit the starting point and show an independently chosen problem, a domain decision and a validated improvement; avoid presenting borrowed work as personal invention. [4][5][6] |
| No “why,” only a stack list | Write one constrained decision with alternatives and evidence, including a choice to defer a feature; connect implementation to the reader's task. [3][8][16] |
| Excellent screenshots, unexplained AI quality | Provide a versioned evaluation report with baselines, representative failures and the actual grading method; do not relabel model fluency as factual reliability. [33][35][36] |
| Unsupported production/usage claims | Separate targets, lab tests, fixture runs and observed real traffic. Report the date/window/sample size of claims and the responsibilities actually owned. [8][25][31][38] |
| Unbounded public AI endpoints | Enforce server-side quotas, bounded retries and a stop switch; demonstrate a helpful degraded response. A provider error must not become a blank page or retry loop. [20][27] |

### 5. Presenting AI responsibly and credibly

**Evidence foundation:** The 2019 Model Cards paper proposes reporting intended use, evaluation and limitations across relevant conditions/groups. Google's 2017 ML Test Score expands production readiness beyond model accuracy into data, infrastructure and monitoring. Anthropic's 2026-01-09 engineering article recommends choosing appropriate code/model/human graders and retaining trials/traces; these principles transfer to this pipeline without requiring a multi-agent architecture. NIST's 2024 GenAI profile addresses risks including confabulation, information integrity and harmful bias. [33][34][35][36]

**Proposed evaluation artifact for this app:** Use one report with reproducible configuration and clearly separate measured results from unrun experiments. This design is a project-specific application of those sources, not a prescribed benchmark. [33][34][35]

| Component | Recommended comparison and metric definition | Failure slice to expose |
|---|---|---|
| Story clustering | Compare a simple title/time baseline with the chosen embedding/clustering approach. Report pairwise precision/recall or another explicitly defined cluster metric on annotated same-event pairs. | Duplicate wire stories, same entity/different event, evolving events, Korean/English cross-language cases. [34] |
| Summarization | Compare an extractive/no-generation baseline and the chosen pipeline on the same held-out stories. Count unsupported material claims per evaluated material claim, with a documented human rubric. | Dates/numbers, attribution, allegation versus fact, conflicting sources and missing evidence. [33][36] |
| Citation grounding | Separate link validity from support: a working URL does not establish that the source entails the claim. Record claim → source passage/identifier judgments and omitted citations. | Correct publisher but wrong article; stale evidence; source unavailable or truncated. [33][36] |
| Change analysis | Compare versions against known story updates; count correctly identified material changes and missed/reported-but-absent changes using a written rubric. | Revised casualty figures, retractions, corrected attribution and publication-time versus ingestion-time confusion. [34][35] |
| Runtime behavior | Measure end-to-end latency, completion/error rate and cost per successfully processed story over a declared run. Include bounded retry costs. | Timeout, rate limit, malformed output, injected instructions inside article text and provider outage. [20][34][36] |

**Reproducibility recommendation:** Freeze a versioned, rights-cleared dataset; record selection/annotation rules, counts, language/topic/source/time slices and disagreement resolution. Split by event and time so near-duplicate articles or later corrections do not leak into a test of earlier knowledge. Keep prompt tuning separate from held-out evaluation; preserve model/config/prompt versions, run date, inputs allowed as of that time and code revision. For small samples report counts and uncertainty rather than a confident leaderboard. These are proposed controls for news-specific evaluation validity. [30][33][34]

**Grading recommendation:** Use deterministic validators for structure and source identifiers, human checks for material support, and optional model judges calibrated against human labels. Publish grader prompts/versions, a few disagreements and repeated-trial variation where generation varies; a judge's score is not ground truth. Store only publishable, redacted traces. This is the proposed application of Anthropic's grading guidance, with privacy constraints applied to stored evidence. [28][35]

**Cost evidence recommendation:** Report provider/model/date, billed input/output units, cache assumptions, embedding calls, retries, hosting/storage and measurement window. Distinguish marginal inference cost from total monthly running cost. Compute `observed variable cost per accepted story = total variable processing spend / accepted stories`; show rejected/failed attempts in the numerator. Compare a cheap baseline with the chosen quality/cost point, and expose a monthly cap. No provider prices or dollar promises are asserted here because no provider/workload has been selected. [18][20][34]

**Failure and bias presentation recommendation:** Label generated analysis, link source evidence, show freshness and uncertainty, and prefer abstention/partial output over inventing missing support. Keep a small public failure gallery with cause, user impact, mitigation and regression status. A plain-language limitation could read: “This analysis may omit context or misstate details. Source selection and language coverage can affect the result; check the linked reporting.” Add actual known Korean/English, topic and publisher-coverage gaps; do not claim political neutrality or a validated bias detector without a defined evaluation. Disclaimers complement controls and correction/reporting paths; they do not establish safety. [33][36]

**What to foreground in AI/ML interviews — synthesis:** A defensible baseline, clean evaluation boundaries, diagnosis of a real failure, a measured quality/cost trade-off and a reproducible change are stronger project evidence than naming many models. Present training expertise only when demonstrated. For full-stack interviews, make this AI evidence a short supporting section and lead with product integration; for AI/ML interviews, reverse that order. [1][9][10][34]

## Options & trade-offs

These choices are recommendations as of 2026-09-15; they are not decisions already accepted by the owner.

| Decision | Lean option | Expanded option | Recommendation and basis |
|---|---|---|---|
| Breadth | One complete news-reading/verification workflow | Accounts, personalization, alerts and broad topic coverage | Start with the complete workflow; expand only after essential failure states and evidence exist. [1][4][21] |
| Demonstration | Licensed seeded/read-only demo plus recording | Continuous live ingestion and on-demand AI | Maintain seed mode as a reliable entry point; add clearly labeled live mode with quotas and freshness monitoring. [14][20][30][31] |
| Audience language | One launch language, bilingual technical summary | Fully bilingual product/data/evaluation | Support the chosen launch audience correctly first; a second language adds meaningful evaluation work, not just translated buttons. [26][33] |
| AI depth | External models with rigorous application evaluation | Train/fine-tune a component and operate it | Use the lean option for applied AI roles; add training only for a justified problem and target-role requirement. [9][10][34] |
| Operations | Managed infrastructure, simple alerts and tested recovery | Multi-region deployment and complex observability | Prefer demonstrable recovery and bounded costs; operational complexity must solve an observed need. [20][31][32] |
| Portfolio entry | One concise README with two role-specific reading paths | Separate application narratives/sites | One evidence base; tailor summaries to individual Korean/global postings. Avoid duplicate technical facts drifting apart. [1][8][11] |

## Recommendation

**Build and present a small, complete product with an auditable AI pipeline.** Recommended release story: a reader opens a story cluster, reads a source-grounded summary, checks original evidence, and can understand either a material update or an explicit unavailable/stale state. This is a proposed scope for the product owner, not an implementation authorization. [1][33][36]

Use three review gates, in this order:

1. **Trustworthy demonstration:** rights-cleared fixtures; working anonymous journey; essential access/security/expense controls; accurate states and metadata; privacy and source disclosure; external smoke monitoring. Account-specific controls apply if accounts are shipped. [19][20][21][22][28][30][31]
2. **Defensible engineering:** reproducible setup and critical tests; one diagram; selected decisions and real issue history; a performed restore/rollback exercise appropriate to the data; performance results labeled by method. [2][11][12][13][25][32]
3. **Defensible AI:** versioned held-out evaluation; baseline comparison; language/topic failure slices; cost and latency accounting; limitations and a failure-to-regression example. Numeric quality gates should be chosen before the final held-out run and justified against the reader's task, not invented after seeing scores. [33][34][35][36]

For **Korean applications**, lead with a concise problem/action/result/learning story and personal contribution, linked to the relevant technical evidence. For **global applications**, provide the same evidence in clear English and highlight the target posting's responsibilities. For **AI/ML roles**, put the evaluation report beside the live demo; for **full-stack roles**, put the user flow and integration evidence first. Do not delay the core release for elaborate animations, a large flag platform, multi-region hosting or an unjustified training exercise. [1][8][9][10][11]

## Open questions for the interview

1. Which role is the first hiring target: full-stack, applied AI engineer, ML training/serving engineer or research-oriented ML? What seniority and actual job postings should this project support?
2. Is the first reader market Korea, an English-speaking market, or both? Which countries and languages must be supported at public launch?
3. What specific reader problem and core journey should be considered the first complete release? Which general-news topics are initially in scope?
4. Is a clearly labeled seeded portfolio demo sufficient initially, or must live ingestion run continuously? Are accounts/bookmarks necessary for that release?
5. What monthly operating cap and maintenance availability can the owner sustain while applying for jobs?
6. Which news sources and redistribution permissions can the owner obtain, and what material may be published in fixtures/evaluation examples?
7. What factual-error severity is unacceptable for this reader task, who can annotate/review evaluation cases, and who will handle corrections?
8. Which development contributions, failed experiments, measured results and AI-assistance details may be published as portfolio evidence?

## Sources

1. GitLab, Fullstack Engineers — live role handbook, snapshot 2026-09-15. https://handbook.gitlab.com/job-description-library/engineering/development/fullstack/ — accessed 2026-09-15.
2. GitLab, Technical Interviews — live hiring guide, snapshot 2026-09-15. https://handbook.gitlab.com/handbook/hiring/interviewing/technical/ — accessed 2026-09-15.
3. Joel Spolsky, The Guerrilla Guide to Interviewing, version 3.0 — published 2006-10-25; historical first-person engineering hiring essay. https://www.joelonsoftware.com/2006/10/25/the-guerrilla-guide-to-interviewing-version-30/ — accessed 2026-09-15.
4. Josh Comeau, Building an Effective Dev Portfolio — undated landing page with first-person hiring background and 2020 review context. https://www.joshwcomeau.com/effective-portfolio/ — accessed 2026-09-15.
5. Hacker News, What portfolio items are most impressive to you when hiring developers? — thread 2017-05-25, cited comment 2017-05-26; unverified first-person anecdote. https://news.ycombinator.com/item?id=14420802 — accessed 2026-09-15.
6. Reddit r/nextjs, What Makes a Developer's Portfolio Stand Out to You? — August 2024 thread; cited hiring comment's account deleted; anecdotal. https://www.reddit.com/r/nextjs/comments/1ej9piq/what_makes_a_developers_portfolio_stand_out_to_you/ — accessed 2026-09-15.
7. Wanted, Developer Report — historical PDF, survey date unverified; pp. 3, 7–8 for sample/evaluation factors; later pages discuss 2019–2022 and 2023. https://static.wanted.co.kr/images/data_report/Wanted_report_developer.pdf — accessed 2026-09-15.
8. Toss, Joining Guide — live employer guidance, snapshot 2026-09-15. https://i18n.toss.im/career/joining-guide — accessed 2026-09-15.
9. Toss Securities, ML Engineer (LLM) — live job detail, snapshot 2026-09-15. https://toss.im/career/job-detail?job_id=7575603003 — accessed 2026-09-15.
10. Chip Huyen, Introduction to Machine Learning Interviews Book — historical first-person interview guide; page publication date unspecified. https://huyenchip.com/ml-interviews-book/ — accessed 2026-09-15.
11. GitHub Docs, Using your GitHub profile to enhance your resume — live guidance. https://docs.github.com/en/account-and-profile/tutorials/using-your-github-profile-to-enhance-your-resume — accessed 2026-09-15.
12. Simon Brown, C4 model introduction — live model-owner documentation. https://c4model.com/introduction — accessed 2026-09-15.
13. GitHub Docs, Adding a workflow status badge — live documentation. https://docs.github.com/en/actions/how-tos/monitor-workflows/add-a-status-badge — accessed 2026-09-15.
14. Immich, public repository/README — mutable main-branch snapshot. https://github.com/immich-app/immich — accessed 2026-09-15.
15. PostHog, public repository — mutable master-branch snapshot. https://github.com/PostHog/posthog — accessed 2026-09-15.
16. PostHog, COMPROMISES.md — mutable master-branch document. https://github.com/PostHog/posthog/blob/master/COMPROMISES.md — accessed 2026-09-15.
17. Langfuse, public repository/README — mutable branch snapshot. https://github.com/langfuse/langfuse — accessed 2026-09-15.
18. LiteLLM, public repository/README — mutable branch snapshot. https://github.com/BerriAI/litellm — accessed 2026-09-15.
19. OWASP, Session Management Cheat Sheet — live security guidance. https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html — accessed 2026-09-15.
20. OWASP API Security Top 10, API4:2023 Unrestricted Resource Consumption — 2023 edition. https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/ — accessed 2026-09-15.
21. W3C WAI, Forms Tutorial: User Notifications — live guidance. https://www.w3.org/WAI/tutorials/forms/notifications/ — accessed 2026-09-15.
22. W3C, Web Content Accessibility Guidelines 2.2 — current published recommendation page. https://www.w3.org/TR/WCAG22/ — accessed 2026-09-15.
23. Google Search Central, Understand the JavaScript SEO basics — live documentation. https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics — accessed 2026-09-15.
24. Open Graph protocol — protocol-owner documentation. https://ogp.me/ — accessed 2026-09-15.
25. Google web.dev, Defining the Core Web Vitals metrics thresholds — updated 2025-05-07. https://web.dev/articles/defining-core-web-vitals-thresholds — accessed 2026-09-15.
26. W3C Internationalization, Declaring language in HTML — live guidance. https://www.w3.org/International/questions/qa-html-language-declarations — accessed 2026-09-15.
27. OpenFeature specification, Flag Evaluation — live specification. https://openfeature.dev/specification/sections/flag-evaluation/ — accessed 2026-09-15.
28. Korea Personal Information Protection Commission, revised privacy-notice guidance announcement — 2026-04-24. https://pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS074&nttId=12021 — accessed 2026-09-15.
29. European Data Protection Board, Respect individuals' rights, SME guide — live EU guidance; applicability conditional. https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en — accessed 2026-09-15.
30. Korea Copyright Commission, news/copyright FAQ — live institutional guidance; not source-specific permission. https://www.copyright.or.kr/customer-center/faq/list.do?categorycode1=02&counselfaqno=41607&pageIndex=10&portalcode=&searchkeyword= — accessed 2026-09-15.
31. Google, Site Reliability Engineering: Monitoring Distributed Systems — 2016 book chapter, checked current public text. https://sre.google/sre-book/monitoring-distributed-systems/ — accessed 2026-09-15.
32. Supabase Docs, Database Backups — live provider-specific example; no stack selection implied. https://supabase.com/docs/guides/platform/backups — accessed 2026-09-15.
33. Mitchell et al., Model Cards for Model Reporting — preprint 2018; FAT* 2019 paper. https://arxiv.org/abs/1810.03993 — accessed 2026-09-15.
34. Breck et al., The ML Test Score: A Rubric for ML Production Readiness and Technical Debt Reduction — 2017 paper, Google Research publication page. https://research.google/pubs/the-ml-test-score-a-rubric-for-ml-production-readiness-and-technical-debt-reduction/ — accessed 2026-09-15.
35. Anthropic Engineering, Demystifying evals for AI agents — published 2026-01-09. https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents — accessed 2026-09-15.
36. NIST, Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile, AI 600-1 — 2024. https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence — accessed 2026-09-15.
37. Google web.dev, Web Vitals — updated 2024-10-31. https://web.dev/articles/vitals — accessed 2026-09-15.
38. Google, About PageSpeed Insights — updated 2024-10-21. https://developers.google.com/speed/docs/insights/v5/about — accessed 2026-09-15.
