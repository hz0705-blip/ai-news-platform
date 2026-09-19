# Research #9: GNews queries, collection density, and article changes

## 요약

- 2026-09-19 기준 정본 스펙의 단계 순서·권리 등급·보존 기간을 적용했다. 중복 제거는 임베딩 전에 결정론적으로 수행하고, 비슷한 기사의 사건 배정은 별도로 둔다.[1][2]
- GNews Essential은 월 €49.99, 하루 1,000요청, 요청당 최대 25기사다. 유료 한도 10요청/초와 UTC 자정(한국 09시) 초기화를 확인했다.[12][13]
- 네 토픽의 영어 쿼리와 한국 관련 보도 쿼리 5개를 제안했다. 여러 쿼리에 잡힌 기사는 하나로 처리하되 토픽 소속은 보존한다.[1][9]
- 키가 없어 밀도·본문 완전성·변경 재수집은 실측하지 않았다. 24시간 창, 페이지 순회, 출처 분포·본문 길이·중복·언어 누출을 기록할 실행 절차를 넣었다.[3]
- 05시·17시 배치마다 약 150기사 분석을 목표로 하고, 하루 요청을 신규 수집 96·재수집 720·재시도 84·비상 여유 100으로 나누는 시작안을 제안한다.[1][12][13]
- GNews는 URL 직접 조회나 원문 변경 반영 기한을 문서로 보장하지 않는다. 재검색 성공과 최신 본문 확인을 구분해야 한다.[9][11][14]
- 출처가 명시한 정정과 무음 원문 변경을 구분하고, 새 불변 기사 버전에 근거를 연결한다. 본문 삭제 시점 이후 재수집으로 보존 기간을 연장하지 않는다.[1][2]
- **영어 Wikinews는 현재 읽기 전용으로 폐쇄되어 신규 발행을 기대할 수 없다.** 스펙의 라이브 연결 전제와 충돌하므로 M2b 처리 방법을 인터뷰 질문으로 남긴다.[36][37]
- GDELT는 링크만 등급으로 유지하고, 출처 정보는 지역·소유 형태·언어만 수집한다.[1][2]

## Scope

**Evidence date: 2026-09-19.** This answers brief #9 in Q1–Q8 order. M2a dependencies receive most detail: Q1–Q4 and Q8. The current specification supersedes the brief's 2026-09-16 context, including the complete pipeline, Railway Singapore worker, 05:00/17:00 KST slots, 90-minute active-job expiry, immutable normalized Article versions, and retention. The glossary governs domain terms. Account identifiers, follows, and reading history are unnecessary inputs to collection or change detection.[1][2][3]

**Measurement status:** no GNEWS, OPENAI, or SUPABASE credentials are available for this run, as specified by the requester. No authenticated density, API freshness, publisher-fetch, latency, or quality experiment was executed. Public no-key Wikinews and GDELT smoke results are explicitly reported in Q6/Q7. Numbers labelled **calculation**, **starting proposal**, or **unmeasured estimate** are not results. The embedded measurement program is a future implementation-ticket procedure, not repository implementation.[3][40][53][54][55]

**Reuse audit:** prior research already covers prices/rights, versioned provenance, dedup versus event grouping, and metadata without political ratings. This note extends those findings rather than adopting their superseded architecture/model/corpus suggestions. The current GNews pricing and June 22, 2026 terms were rechecked; Feedly's 85%/31-day precedent was rechecked but is not imported as our threshold. Wikinews' operating status requires a material correction to the older research assumptions; Q7 and the interview section expose it explicitly.[4][5][6][7][8][13][14][20][36][37]

## Findings

### Q1. GNews API surface as checked on 2026-09-19

#### Endpoint and parameter reference

| Surface | Verified behavior |
|---|---|
| `GET https://gnews.io/api/v4/search` | Keyword search; `q` required, maximum 200 characters.[9] |
| `q` | Quoted phrases; `AND` (also spaces), `OR`, `NOT`, parentheses. **OR binds more tightly than AND**; parenthesize every mixed expression. Quote special characters; URL-encode.[9] |
| `lang`, `country` | `lang=en`; search `country` describes publication origin, not subject geography. Leave country unset for worldwide English coverage.[9] |
| `in` | Search fields: `title,description` default; `content` optional.[9] |
| `from`, `to`, `sortby` | Inclusive publication-time bounds, ISO 8601; search ordering `publishedAt` default or `relevance`.[9] |
| `max`, `page` | `max` defaults 10; subscription cap applies. `page` starts 1; at most 1,000 results can be paged.[10][13] |
| `truncate`, `nullable` | Omit `truncate` for paid full content; `truncate=content` requests shortening. `nullable` accepts `description,content,image`.[10][11] |
| `GET https://gnews.io/api/v4/top-headlines` | Trending selection based on Google News ranking; categories `general,world,nation,business,technology,entertainment,sports,science,health`. Supports `q,lang,country,from,to,max,page,truncate,nullable`; does **not document** search's `in` or `sortby`.[10] |

Top-headlines' country description differs: mostly sources originating there, plus coverage relevant there. Do not use either endpoint's country filter to implement a reliable “foreign press about Korea” boundary. The search supported-country list does not list South Korea; lack of `country=kr` is not proof that Korean English outlets are absent.[9][10]

The response envelope is `totalArticles` plus `articles`. Documented article fields are `id,title,description,content,url,image,publishedAt,lang`; source fields are `id,name,url,country`, with `source.country` documented only for search. Publication time is UTC. No response field for provider fetch time, publisher modification time, canonical URL, revision ID, or explicit correction status is documented. Treat absent/null optional fields as an adapter concern, and do not expose images under the fixed text-only UI policy.[1][11]

#### Plan, pagination, and errors

Essential currently advertises **€49.99/month, 1,000 requests/day, up to 25 articles/request, real-time availability, historical data from 2020, and full content**. These are advertised capabilities, not measured coverage/completeness guarantees. The earlier price finding remains current.[4][13]

Current endpoint references document `page` without an Essential exclusion; therefore plan on `max=25,page=1…40`, subject to an account smoke test. **Calculation:** 25 × 40 = 1,000 retrievable results per query/window, not 1,000 requests. Freeze `from/to`, dedup across pages, and partition saturated windows rather than claiming a complete export. Old `gnews.io/docs/v4` examples using `expand=content` are superseded here by the current `docs.gnews.io` parameter reference; do not send both interfaces blindly.[9][10][13][24]

| Response | Documented meaning | Proposed action |
|---|---|---|
| 200 | Success | Validate schema; 0 articles is a successful empty result.[12] |
| 400 | Invalid parameters/query | Record sanitized parameters; fix, do not retry unchanged.[12] |
| 401 | Missing/invalid/expired key | Stop this adapter and report authentication failure.[12] |
| 403 | Daily quota or expired subscription | Stop; inspect reason. Quota resets **00:00 UTC = 09:00 KST**.[12] |
| 429 | Burst limit; paid **10 requests/second**, free 1/second | Shared limiter; bounded backoff, honor `Retry-After` if present.[12] |
| 500/503 | Server error/temporary unavailability | At most the spec's two retries within stage deadline.[1][12] |

Errors may have `errors: string[]` or `errors: {parameter: message}`. A stable remaining-quota header, `Retry-After` guarantee, and whether every failed request consumes daily quota are not established by these references. **Proposal:** account conservatively for every attempted request, log observed headers, and reconcile with the dashboard; never put the `apikey` URL in logs.[12]

**Deduplication is not an API contract.** The reviewed endpoint/response references expose no duplicate-removal option or guarantee covering repeated pages, overlapping queries, mirrored URLs, or wire syndication. Keep local deterministic dedup and provider IDs as provenance, not universal Article identity. “Real-time” does not guarantee that an already indexed article is refreshed after every publisher edit.[9][10][11][13][14]

### Q2. Query design for four topics

The following are **starting query proposals**, not measured retrieval findings. All search requests use `lang=en`, `in=title,description`, `sortby=publishedAt`, `max=25`, fixed `from/to`, and no country restriction. The syntax is constrained to documented operators; every string stays within the 200-character limit.[9]

| ID / topic | Proposed `q` or category | Purpose and expected overlap |
|---|---|---|
| K1 / Korea | `("South Korea" OR "South Korean" OR Seoul)` | Broad baseline; Seoul is not synonymous with every Korean subject. Expect overlap with all other topics. |
| K2 / Korea | `("South Korea" OR "South Korean" OR Seoul) AND NOT "K-pop" AND NOT Kpop AND NOT BTS AND NOT Blackpink` | Noise-reduction experiment, not an automatic replacement: cultural terms can occur in substantive policy/economy stories. |
| K3 / Korea | `("South Korea" OR Seoul OR Korean) AND (diplomacy OR military OR election OR sanctions OR "North Korea")` | South-linked diplomacy/security; do not exclude North Korea indiscriminately or lose inter-Korean events. |
| K4 / Korea | `("South Korea" OR "South Korean" OR Samsung OR "SK Hynix" OR Hyundai) AND (trade OR tariffs OR exports OR chips OR investment)` | Economy/industry channel; corporate mentions need Korean relevance review, not automatic identity equivalence. |
| K5 / Korea | `Korean AND NOT "North Korea" AND NOT "North Korean" AND NOT "K-pop" AND NOT Kpop AND NOT BTS` | Recall/noise diagnostic only: excludes mixed North/South coverage and may match diaspora, food, or culture. |
| P / politics-security | `(election OR diplomacy OR treaty OR sanctions OR ceasefire OR military OR war OR NATO OR "United Nations")` | Wider than international affairs; domestic-only politics can leak. Review whether a concrete cross-border/international event is present. |
| E / economy-finance | `(inflation OR "interest rates" OR "central bank" OR tariffs OR trade OR recession OR "global economy" OR "bond yields")` | Macro baseline; overlap with P on sanctions/tariffs and T on technology trade. |
| T / technology-AI | `("artificial intelligence" OR "AI model" OR semiconductor OR cybersecurity OR OpenAI OR Nvidia OR "data center")` | Avoid bare `AI` initially; overlap with E on companies/chips and P on security/export controls. |
| HW / politics discovery | `top-headlines?category=world` | Ranking-based supplemental discovery, not an exact politics taxonomy. |
| HB / economy discovery | `top-headlines?category=business` | Supplemental company/market coverage; not necessarily global macroeconomics. |
| HT / tech discovery | `top-headlines?category=technology` | Supplemental product/technology coverage; not limited to AI. |

**Expected articles/call, all eleven variants:** documented bound **0–25** on Essential; actual mean, median, publisher diversity, useful yield, and cross-topic overlap are **unmeasured**. No primary documentation provides a Korea-specific or topic-specific density from which an honest point estimate can be derived. For capacity planning only, test effective yields of 5/10/15 usable new Articles per request in Q3. Category selection trades query control for ranking-selected discovery; do not infer different independent reporting origins from different query hits.[9][10][13]

**Selection proposal:** measure all variants, then initially retain K1, K3, K4, P, E, T plus the three supplemental categories; keep K2 and K5 as controls until their excluded items are inspected. Review up to 50 deterministically sampled results per query for relevance. Compare K2 against K1 and K5 against the union of K1/K3 rather than judging exclusions by returned count alone. Record “excluded but relevant” examples to avoid optimizing solely for precision.[1][9]

**Foreign-source boundary proposal:** use a reviewed Source/domain table, not `.kr` suffixes or `country=us`; GNews' pricing FAQ explicitly says source filtering is not supported.[13] Seed the domestic-English review queue with `en.yna.co.kr`, `koreaherald.com`, and `koreajoongangdaily.joins.com` from the brief; approve aliases only after checking publisher ownership/editorial identity. For the current domestic-source exclusion, quarantine unknown source origin and exclude confirmed Korean-domestic English publishers from the live full-processing set. A foreign publisher's Korea bureau is not automatically a Korean-domestic publisher. Scope exceptions belong in the interview question, not an implicit rights exception.[1][3]

**Multi-topic proposal within the fixed rule:** preserve all query IDs and their Topic IDs on one Article. The specification already says that an Article belongs to exactly one Story and a Story's Topic set is the union of its Articles' Topics. Do not create one Article or Story per query hit. A `primaryTopic` may be a display/routing preference with all secondary memberships retained; the optional rule is an interview decision. The budget tie-break is Korea → politics/security → economy → tech, after the spec's Story article-count priority, not a replacement for that priority.[1][2]

### Q3. Density measurement and a two-slot request schedule

#### What is known, estimated, and still unmeasured

| Metric requested by the brief | Status on 2026-09-19 |
|---|---|
| Returned articles/query over 24 hours | Not measured; `0…25` per response is a plan bound, not a density estimate.[13] |
| Unique URL/title, top 15 publisher domains | Not measured; title equivalence will be reported as a diagnostic, never destructive dedup.[1][9] |
| Content length p10/p50/p90/p95 | Not measured; paid full content entitlement does not establish extraction completeness.[11][13][14] |
| Empty/truncated content and English leakage | Not measured; record nulls, visible truncation markers, API language labels, and a human language audit separately.[11] |
| Query/topic overlap and usable yield | Not measured; compute on canonical candidate identities, and report the fraction rejected for rights, relevance, language, or content quality.[1] |

**Capacity calculation:** the mathematical minimum is 6 full, entirely usable, mutually distinct responses for 150 Articles. At effective yields 15/10/5, the requirement is 10/15/30 calls per batch; at fewer than 3.125 useful Articles/call, a 48-call discovery cap cannot yield 150. These are sensitivity scenarios derived from the target and plan maximum, not claimed achievable densities. Never pad a thin batch with irrelevant coverage.[1][13]

#### Runnable measurement procedure for a later implementation ticket

**Inputs:** a real Essential account; Node 24; a UTC end instant `GNEWS_WINDOW_END`; exactly 24 hours before it as start; the query version in Q2; a private output path outside the public repository; and confirmed remaining UTC-day allowance. Run once for a fixed weekday and once for a weekend later, using the same selection method. Do not run concurrently with collection unless a shared request ledger has reserved this experiment's allowance.[1][3][9][13]

Copy the JavaScript below to a temporary `measure-gnews.mjs`; supply `GNEWS_API_KEY` through the implementation environment's secret loader. Then run `GNEWS_WINDOW_END='2026-09-19T00:00:00Z' node /tmp/measure-gnews.mjs > /tmp/gnews-density-private.json`. This example date defines the experiment, not a live run performed here. The program requests all eleven variants, at most 40 pages each (440 requests), sequentially below one request/second, stops on API errors, retains sanitized request parameters/status/timings and response bodies, and prints per-query metrics plus pairwise overlap. Authentication uses the documented `X-Api-Key` header.[25] Input validation runs before any request. Full response output is private retained content subject to the same expiry rules as ingestion.[1][9][10][11][12][13]

```js
import { setTimeout as delay } from 'node:timers/promises';
const key = process.env.GNEWS_API_KEY;
const end = new Date(process.env.GNEWS_WINDOW_END ?? '');
if (!key || !Number.isFinite(end.getTime())) throw Error('Need key and UTC window end');
const start = new Date(end.getTime() - 86_400_000);
const defs = [
  ['K1','search','("South Korea" OR "South Korean" OR Seoul)'],
  ['K2','search','("South Korea" OR "South Korean" OR Seoul) AND NOT "K-pop" AND NOT Kpop AND NOT BTS AND NOT Blackpink'],
  ['K3','search','("South Korea" OR Seoul OR Korean) AND (diplomacy OR military OR election OR sanctions OR "North Korea")'],
  ['K4','search','("South Korea" OR "South Korean" OR Samsung OR "SK Hynix" OR Hyundai) AND (trade OR tariffs OR exports OR chips OR investment)'],
  ['K5','search','Korean AND NOT "North Korea" AND NOT "North Korean" AND NOT "K-pop" AND NOT Kpop AND NOT BTS'],
  ['P','search','(election OR diplomacy OR treaty OR sanctions OR ceasefire OR military OR war OR NATO OR "United Nations")'],
  ['E','search','(inflation OR "interest rates" OR "central bank" OR tariffs OR trade OR recession OR "global economy" OR "bond yields")'],
  ['T','search','("artificial intelligence" OR "AI model" OR semiconductor OR cybersecurity OR OpenAI OR Nvidia OR "data center")'],
  ['HW','top-headlines','world'], ['HB','top-headlines','business'],
  ['HT','top-headlines','technology'],
];
if (defs.some(([, e, q]) => e === 'search' && [...q].length > 200)) throw Error('Query too long');
const urlKey = value => {
  try {
    const u = new URL(value);
    u.hash = '';
    for (const p of [...u.searchParams.keys()])
      if (/^utm_/i.test(p) || /^(fbclid|gclid)$/i.test(p)) u.searchParams.delete(p);
    return u.href; // Do not drop unknown query parameters or fold host aliases.
  } catch { return String(value ?? ''); }
};
const titleKey = a => String(a.title ?? '').normalize('NFC').toLowerCase().replace(/\s+/gu,' ').trim();
const domain = a => { try { return new URL(a.url).hostname; } catch { return '(invalid)'; } };
const quantile = (xs,p) => xs.length ? xs[Math.floor((xs.length-1)*p)] : null;
const runs = [], sets = new Map();
let attempts = 0, halted = false;
for (const [id, endpoint, term] of defs) {
  if (halted) break;
  const calls = [], rows = [];
  for (let page=1; page<=40; page++) {
    const p = new URLSearchParams({lang:'en',max:'25',page:String(page),
      from:start.toISOString(),to:end.toISOString(),nullable:'description,content,image'});
    if (endpoint === 'search') { p.set('q',term); p.set('in','title,description'); p.set('sortby','publishedAt'); }
    else p.set('category',term);
    const params = Object.fromEntries(p);
    await delay(1100);
    const begin = Date.now(); attempts++;
    let response;
    try {
      response = await fetch(`https://gnews.io/api/v4/${endpoint}?${p}`, {
        headers:{'X-Api-Key':key},signal:AbortSignal.timeout(20000)});
    } catch (e) {
      calls.push({params,status:'network-error',error:e.name,ms:Date.now()-begin});
      halted = true; break; // No URL-bearing error message or implicit retries.
    }
    const raw = await response.text();
    let body; try { body=JSON.parse(raw); } catch { body={parseError:true}; }
    calls.push({params,status:response.status,ms:Date.now()-begin,
      observedAt:new Date().toISOString(),retryAfter:response.headers.get('retry-after'),body});
    if (!response.ok || !Array.isArray(body.articles)) { halted=true; break; }
    rows.push(...body.articles);
    if (body.articles.length < 25 || page*25 >= body.totalArticles) break;
  }
  const unique = [...new Map(rows.map(a=>[urlKey(a.url),a])).values()];
  const urls = new Set(unique.map(a=>urlKey(a.url))); sets.set(id,urls);
  const lengths = unique.map(a=>[...String(a.content??'')].length).sort((a,b)=>a-b);
  const counts = new Map(); for (const a of unique) counts.set(domain(a),(counts.get(domain(a))??0)+1);
  const maxTotal = Math.max(0,...calls.map(c=>Number(c.body?.totalArticles)||0));
  runs.push({id,endpoint,term,calls,metrics:{returned:rows.length,uniqueURL:unique.length,
    uniqueTitleDiagnostic:new Set(unique.map(titleKey)).size,
    totalArticlesMax:maxTotal,censored:maxTotal>1000 || halted,
    top15Domains:[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,15),
    contentCodePoints:{p10:quantile(lengths,.1),p50:quantile(lengths,.5),p90:quantile(lengths,.9),p95:quantile(lengths,.95)},
    emptyContent:unique.filter(a=>!String(a.content??'').trim()).length,
    truncationMarkerSuspects:unique.filter(a=>/\[\+?\s*[\d,]+\s*(?:chars?|characters?)\]/i.test(a.content??'')).length,
    providerNonEnglish:unique.filter(a=>a.lang && a.lang!=='en').length,
    providerMissingLanguage:unique.filter(a=>!a.lang).length,
    humanLanguageAudit:'pending',humanRelevanceAudit:'pending',humanTruncationAudit:'pending'}});
}
const overlap=[];
for(let i=0;i<runs.length;i++) for(let j=i+1;j<runs.length;j++) {
  const a=sets.get(runs[i].id),b=sets.get(runs[j].id);
  const intersection=[...a].filter(x=>b.has(x)).length;
  const union=new Set([...a,...b]).size;
  overlap.push({a:runs[i].id,b:runs[j].id,intersection,jaccard:union?intersection/union:null});
}
console.log(JSON.stringify({queryVersion:'r9-2026-09-19',node:process.version,
  from:start.toISOString(),to:end.toISOString(),attempts,halted,runs,overlap},null,2));
```

**Completion and selection criteria for the measurement ticket (proposal):** the script is only the capture/summary phase, not proof of complete collection or language accuracy. Complete the following before selecting queries.[1][3]

1. Confirm the account tier and that page 2 adds records; compare `max=25` with returned count and log rejection/clamping. Compare one representative paid response with `truncate=content` versus omitted truncation. Do not intentionally flood the API to test 429 or exhaust quota to test 403; use recorded error fixtures for those paths.[9][12][13]
2. Report every query's successful calls, returned rows, exact raw-URL count, normalized-URL count, provider-ID count, title diagnostic, final Q8 Article count, top 15 domains, p10/p50/p90/p95 code-point lengths, empty fraction and suspected/confirmed truncation fractions with denominators. Audit at least 50 stable-URL-sorted items/query (all if fewer), including short/long/flagged strata; inspect available licensed body completeness rather than equating a missing marker with complete text. Keep human-confirmed truncation separate from provider truncation markers.[9][11][13]
3. Audit English on the same sample with `English/non-English/mixed/indeterminate`, including title and body. Report provider-label leakage separately from human leakage and uncertainty; ASCII or Latin script is not a language detector. Record relevance, Korean-domestic publisher exclusion, and reasons for rejection on the same rows. All sampling rules and denominators belong in the result.[1][3]
4. Compute overlap at both query and Topic level: intersection counts, Jaccard, incremental unique **usable** Articles after preceding selected queries, distinct reporting origins after Q8, and publisher concentration. Query membership survives dedup. Compare excluded K-pop/North-Korea examples manually before choosing K2/K5.[1][9]
5. If `totalArticles>1000`, divide that same 24-hour search window into six 4-hour slices and repeat only censored queries within a separately reserved allowance; subdivide again down to 15 minutes if necessary. Because bounds are inclusive, dedup shared endpoints. Stop at the experiment's allowance/deadline and label unresolved slices **censored**, not measured full-day density. Top-headlines remains ranking-selected even after time slicing. Log changes in `totalArticles` across pages and capture time; fixed publication bounds do not freeze the provider index.[9][10][14]
6. Later replay the captured batch at 05:00/17:00 KST slot inputs without network; record useful Articles/call, calls to obtain 150, stage durations, 60-minute completion fraction, 90-minute expiry, rights exclusions, and deferred work. Tune against the separate development set; do not select queries or dedup thresholds on the holdout.[1]

#### Proposed production allowance and timing

The following is a **starting allocation**, not a requirement to spend the allowance. Use one transactional provider request ledger keyed by **UTC date**, plus a distinct pipeline slot key in KST. A quota day includes the **17:00 KST slot and the following 05:00 KST slot**; resetting the ledger at KST midnight would be wrong.[1][12]

| Use | Requests per UTC day | Maximum per slot / rule |
|---|---:|---|
| New discovery | 96 | 48 each at 05:00/17:00; stop once 150 usable new Articles are selected. |
| Re-fetch/change checks | 720 | 360 each: proposed steady-state 300 active-age checks plus 60 dormant checks. |
| Retry allowance | 84 | Shared; at most two retries per job, deadline and quota permitting. |
| Unallocated emergency reserve | 100 | Do not automatically consume for deeper pagination or low-priority discovery. |
| **Total ceiling** | **1,000** | Every attempted provider request debits the ledger, conservatively. |

Within discovery's 48 requests, start with 8 Korea requests (K1/K3/K4, assigning remaining pages to measured yield), 4 P, 4 E, 4 T, and one request per supplemental category: **23 initial requests**, with 25 adaptive top-ups available. Query-hit overlap is deduped before filling Article slots. At a limiting request/model budget preserve the specified priority; the analysis queue sorts by Story article count first and Topic order for ties. Record underfilled batches and deferred Articles rather than spending protected re-fetch allowance. Source/topic balance targets, if added, remain interview choices rather than an unapproved ranking change.[1][9][13]

Use windows ending at the intended slot, with a two-hour overlap before the previous successful watermark; select newly observed identities rather than blindly excluding overlap. Late arrivals enter a bounded catch-up query; do not turn an outage into an unbounded history sweep. For a first deployment, use the preceding 12 hours. These window values are proposals to measure, not guaranteed publisher latency coverage.[1][9][14]

**Starting worker envelope:** one request at a time at at most 2 requests/second, 20-second request timeout, and a 15-minute collection/re-fetch stage deadline inside the fixed 90-minute job expiry. At 408 nominal calls/slot, pacing alone takes at least 204 seconds; request latency and retries determine the actual elapsed time, so the deadline may defer checks. Checkpoint the remaining due work, honor the fixed two-retry rule, and leave the rest of the pipeline time to embed, assign, extract, gate, compare, and publish. Never display the slot start as last published time.[1][12]

### Q4. Re-fetch, Article Changes, and explicit Corrections

#### Retrieval guarantees and rights

| Route | What can actually be established | Recommendation |
|---|---|---|
| GNews by article URL / ID | No direct lookup endpoint or URL/ID query parameter is documented in the reviewed public API.[9][11] | Do not invent `/article/:id`, `url=`, or search-engine `site:` syntax. |
| GNews exact-title search | A phrase query can rediscover indexed text, but is not unique article lookup. An edited title can stop matching.[9] | Use quoted stable title phrase with `in=title`, then exact accepted URL/provider-ID identity validation locally; record misses. |
| GNews original `from/to` | Filters publication time, not modification time.[9] | Start with original publication day, then a capped 72-hour surrounding window if metadata shifted; retain original publication identity. |
| GNews repeated existing query | May return a previously seen Article; no revision/freshness SLA is established.[11][14] | Coalesce due Articles satisfied by one response; distinguish “provider representation unchanged” from “publisher unchanged.” |
| Direct publisher fetch | RFC 9309 says robots rules are not access authorization. Terms and rights remain separate.[17] | No blanket crawler. Enable only source-specific permitted fetches; GNews payment alone is insufficient authorization.[14][17] |

Guardian's current terms restrict automated scraping and AI-related reuse without approval; this independently supports keeping its direct-fetch permission unresolved.[18] For all publishers, **proposal:** store separate `provider_processing_allowed`, `display_policy`, and `direct_refetch_allowed` decisions with policy URL/date. Check the actual crawler's robots rules, applicable terms, source tier, redirects, and deadline before each allowed retrieval; recheck cached robots at most daily. Denied/unknown permission, 401/403, robots failure, paywall, or parser failure becomes a coverage gap, never a workaround or “unchanged” result. A permitted fetch should identify the service, pace per host (start at one request/10 seconds), use conditional validators, and reject non-public network destinations/redirects.[1][14][17][23]

An HTTP 304 supports retaining the same representation under its validator; an ETag/Last-Modified change alone does not establish editorial change. A 200 page must pass article-body extraction and completeness checks before comparison. A paywall fragment, consent page, intermittent empty body, or a newly truncated provider response must not become a mass deletion in the next Article version.[23]

**Prior art:** NewsDiffs describes discovering prominently linked articles, site-specific parsing, version storage in Git, and showing changed versions through a diff interface. Its repository includes an hourly scraper example and parser extension points. This is useful precedent for the discover → retrieve → extract → version → diff sequence; its historical architecture and public full-text archive do not grant us publisher rights or justify perpetual Article-body storage.[15][16]

#### Proposed bounded re-fetch schedule

Age is measured from original Article publication, falling back to first collection only when publication is unknown. Schedule checks at the next fixed batch after the due age; retain `dueAt`, `attemptedAt`, `lastSuccessfulCheck`, `providerObservedAt`, and failure reason. Do not change publication time to renew retention. The Story is active for the spec's 72-hour window, may become dormant, and ends after its fixed lifecycle; Article-body expiry is separately 30 days from Article publication.[1][2]

| Article/Story phase | Starting check schedule | Quota consequence / honesty |
|---|---|---|
| Collection | Baseline normalized body/version and correction marker scan. | Discovery response is the first observation; do not refetch immediately without a reason. |
| Active, first 72 hours | Two follow-ups: next batch at age ≥12 hours and ≥60 hours, if still eligible and not already checked after that due time. | 300 new Articles/day × 2 = **600 requests/day** worst case at one lookup/check; repeated-query coalescing may save calls but is unmeasured. |
| Active, known explicit correction / dispute / current Evidence | Move urgent due Articles ahead of routine checks; use remaining protected reserve only through the ledger. | Report displaced checks as deferred. No claim of complete 12-hour surveillance. |
| Dormant, still before Article expiry | At age ≥7, ≥14, ≥28 days, select at most 40 eligible Articles/day per cohort (120 total); current Evidence, unresolved disputes, then stable age/ID order. | This is **sampled** dormant monitoring, not three checks on all Articles. Log selection fraction per cohort and skipped items. |
| Story ended or Article age ≥30 days | Stop automatic retrieval at the earlier applicable cutoff; delete bodies and body-bearing caches/measurement captures. | Keep permitted Evidence spans/hash/URL/metadata; do not reconstruct a purged body from the publisher or a diff chain. |

**Capacity warning (calculation):** checking all 900 active Articles twice daily would require approximately 1,800 individual requests/day before discovery, above Essential's allowance. The two-check proposal fits 600 + 120 = 720 planned checks/day but leaves observable gaps; a changed-then-reverted text between checks is undetectable. A lookup requiring extra pages/fallbacks consumes extra requests and reduces the number of completed checks. Report coverage, not a fictional exhaustive change-detection guarantee.[1][13]

If an Article is first ingested after a due age, collection counts as that observation; do not execute both overdue checks immediately. Dormant check selection never reopens a Story automatically. A material new Article can reactivate it only through the spec's assignment rules; operator intervention governs ended Stories. A re-fetch itself must not keep a Story perpetually active.[1][2]

#### Normalization-aware versioning and correction classification

**Proposed algorithm, honoring immutable Evidence coordinates:** extract the article body using a pinned provider/site parser; track title and attribution metadata, and retain publisher correction notices in the normalized article content as well as structured notice fields. A newly added correction notice must survive the hash comparison even if the rest of the body is unchanged. Remove markup and non-article chrome, normalize NFC and CRLF/CR to LF, and store this exact normalized text with extractor/normalizer versions and SHA-256. NFC preserves canonical character equivalence; do not use NFKC, digit deletion, quote deletion, case folding, or punctuation stripping on the Evidence text. Offsets are half-open Unicode code points, not JavaScript UTF-16 indexes.[1][2][22]

Keep two comparisons: (a) exact normalized Evidence-body hash, which defines a new immutable Article version when different; (b) an editorial-content projection that excludes only explicitly identified boilerplate regions and insignificant formatting for change classification. Retain an offset map back to each immutable body. A parser upgrade is a processing revision, not evidence that the publisher edited; compare equivalent parser versions or mark the observation uncomparable. If a normalization-only body difference creates a new internal version, classify it as non-editorial and do not generate a reader Change solely because preprocessing changed.[1][2]

Align equal paragraph hashes first, then deterministically diff changed paragraphs at Unicode code-point level with stable tie-breaks. Preserve insertions/deletions of digits, dates, negation, modal verbs and speaker names even when only one character changes. Ambiguous repeated text gets no invented span mapping: the spec permits a new Claim identifier with lineage when reliable anchors are absent. No “ignore edits below N%” rule is allowed to suppress a numeric correction.[1][2]

| Marker / change | Starting detection rule | Classification |
|---|---|---|
| `Correction:` / `Corrections:` | Anchored publisher note, not a quotation about somebody else's correction. Capture note text, version, location and time if stated. | Explicit Correction candidate; link to affected Claim/Evidence before setting corrected status.[1][19] |
| `CORRECTED-` | Headline-prefix candidate, case-insensitive; require corroborating publisher correction wording/structured notice when its meaning is ambiguous. | Candidate only; do not infer a correction from a body mention or filename. Proposed pattern, not a universal Reuters API promise.[1][3] |
| `Editor's note` / `Editor’s note` | Capture note; inspect whether it explicitly acknowledges an error, withdrawal or corrected detail. | May explain reporting methods rather than correct an error; AP documents both uses.[19] |
| `Updated:` / `UPDATE` / changed timestamp | Capture as update metadata; inspect text difference. | **Not sufficient for Correction**. Substantive silent difference is Article Change.[1][2] |
| Same URL, changed substantive text, no explicit correction | New version and deterministic diff. | Article Change; do not close disputes or mark corrected merely from disappearance.[1][2] |
| Explicit note but unavailable prior text | Store note as observed; map affected Claims only where grounded. | No invented before-text/diff; allow uncertainty about affected Claims.[1][2] |

AP explicitly distinguishes visible corrections from other editorial notes and says online corrections can overwrite the previous text, supporting preservation of observed versions and cautious marker handling. Marker regexes are only candidate detectors; article text remains untrusted input even when it resembles a system instruction.[19][1]

**Proposed re-fetch validation ticket:** select 30 stored Articles, 10 each from ages <24h, 24–72h, and 3–28d; include at least five publishers and all available explicit-correction cases. For each, issue a sanitized exact-title search (quoted stable ≤200-character phrase, `in=title,lang=en,max=25,from/to` around publication); if identity is missing, record a miss and try one bounded query using a distinctive surviving phrase. Match on provider ID/approved URL aliases, never title alone. Repeat at the next slot; direct-fetch only approved publishers. Record request count, exact identity hit rate, response-body hash, changed-title miss, stale-provider versus publisher version, extraction failure, observed correction notice, false boilerplate change, and detection delay where the publisher supplies an edit timestamp. Store `unknown` when freshness cannot be established. Validate unchanged, silent edit, explicit correction, transient truncation, moved paragraph, NFC/LF-only change and non-BMP cases using rights-cleared replay fixtures. No numerical success claim is made before this experiment.[1][9][11][14][17]

### Q5. Publisher metadata

**Recommendation: a small reviewed registry, bootstrapped from Wikidata and verified against publisher-owned pages.** Wikidata's structured data is CC0; its data-access routes include entity JSON and `wbgetentities`. This supplies candidate facts, not a guarantee of current ownership or an editorial classification. The actual top approximately 50 publishers must be selected from a seven-day Q3 sample ranked by distinct eligible Articles; this run cannot truthfully name a measured top 50.[1][26][27]

| Needed metadata | Candidate primary/structured evidence | Proposed interpretation |
|---|---|---|
| Publisher identity and domain aliases | Official About/contact page; Wikidata official website `P856`.[28] | Match brand and edition, not only parent company. Store explicit aliases and reviewed redirects. |
| Country/region | Publisher address/annual report; `P17` country, `P159` headquarters.[29][30] | Use publisher base; neither coverage geography nor TLD establishes it. Preserve ambiguous/multiple regions. |
| Ownership | Official governance/annual report; `P127` owned by, `P749` parent organization.[31][32] | Keep owner identity and supporting date internally; map only reviewed evidence to the public ownership label. |
| Language | Observed Article language and edition policy; `P407` language of work/name.[33] | Language is edition/content-level where needed; an international publisher can publish multiple languages. |

**Proposed registry fields:** Source ID, accepted domains, Wikidata item/revision if used, region, ownership type, languages, evidence URLs, evidence as-of/access dates, reviewer, review due date, and separate rights decision. Use `public-service/private/state-owned/nonprofit-cooperative/unknown` as an initial internal taxonomy to review. “Wire” is a distribution role, not mutually exclusive ownership: AP describes itself as a news cooperative; Reuters' site identifies Thomson Reuters as parent. Keep `distributionRole=wire` separate internally so these do not become contradictory labels. Do not derive “state-affiliated” from a bias dataset or government funding alone.[1][34][35]

**Maintenance proposal:** after the density pilot, verify the top 50 once; leave unsupported values unknown. Fetch known Wikidata IDs in batches via `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=QID1%7CQID2&props=claims%7Clabels&languages=en&format=json` (replace placeholders with reviewed IDs), or `https://www.wikidata.org/wiki/Special:EntityData/QID.json`. Record returned entity revision, inspect statement references and qualifiers, then verify ownership with the publisher. Cache inputs; review monthly and whenever a domain, acquisition, rights complaint, or conflicting source fact appears. Proposed automation produces a review diff, never silently overwrites a label. Public information remains region, ownership type and language, with no political bias/factuality score.[1][26][27]

### Q6. GDELT integration

**Product selection:** GDELT's Events data encodes actors/actions; GKG focuses on entities/themes. DOC 2.0's article-list mode is the closest match to this ticket's title/URL discovery need.[51] The official **2017-06-20** DOC reference still states a default 75 and maximum 250 records for article lists; it documents quoted phrases, parenthesized OR, exclusions, `sourcelang:english`, `domainis:`, and UTC `startdatetime/enddatetime` (`YYYYMMDDHHMMSS`). The 2018 update expanded search, with limitations for non-timeline results; do not extrapolate a guaranteed September 2026 historical horizon from that dated announcement.[49][50]

**Live smoke on 2026-09-19:** the no-key request [53] returned **HTTP 429**, with response guidance to limit requests to one every five seconds. A later retry also returned 429. Thus the cap of 250 is **documentation-reverified, not live payload-verified**; no current density/schema result was obtained. Do not report unrestricted rate or a successful article-list retrieval.[53]

**Proposed sample request for an implementation smoke:** a Story-specific entity/action combination is safer than an entity alone. Replace the dates with the intended bounded observation window; capture headers, status, duration and body privately, and inspect status before parsing JSON. This command is a future procedure, not the successful result of this research.[1][49][53]

```sh
curl --get --max-time 30 'https://api.gdeltproject.org/api/v2/doc/doc' \
  --data-urlencode 'query="South Korea" (missile OR sanctions) sourcelang:english' \
  --data-urlencode 'mode=artlist' --data-urlencode 'format=json' \
  --data-urlencode 'maxrecords=250' --data-urlencode 'sort=datedesc' \
  --data-urlencode 'startdatetime=20260918000000' \
  --data-urlencode 'enddatetime=20260919000000' \
  --dump-header /tmp/gdelt-headers.txt --output /tmp/gdelt-result.json
```

**Adapter proposal:** use one serial queue with ≥6-second spacing, backoff/observed `Retry-After`, and an initial cap of 20 Story queries per batch. This consumes no GNews allowance, but shares the worker deadline; GDELT failure does not block publication of already supported Stories. Expect and validate article-list fields such as `url,title,domain,language,sourcecountry,seendate` against the first recorded successful response. Keep `seendate` as provider observation time unless a verified mapping establishes publication time; show that fallback clearly. No documented pagination cursor is assumed. When 250 records fill a response, split its time window, dedup URLs at boundaries, and report any remaining saturation rather than claiming complete coverage.[1][49][53]

**Matching proposal:** exact approved URL identity attaches another observation to an existing Article. A new URL stays a distinct link-only Article candidate; match its title at the **Story assignment** stage using permitted title embeddings plus entity, action, location and event-time compatibility with the 72-hour active set. An ambiguous candidate remains unattached; the same entity on a different day is insufficient. No hidden publisher-body retrieval, Evidence extraction or independent Reporting Origin credit follows from a GDELT hit. Display only title, Source, outbound URL and timestamp, and ignore supplied tone/images.[1][2]

GDELT permits use of its datasets without a fee and asks for attribution/linking. **Inference:** this does not license the underlying publishers' full texts or images; the fixed link-only tier remains necessary. Cite GDELT as discovery provider separately from the actual publisher.[1][52]

### Q7. English Wikinews

#### Current status changes the brief's live-ingestion assumption

**English Wikinews is closed and read-only.** Its current main page states this; the Wikimedia Foundation board archive records the closure decision announced 2026-03-30 for May 4, and the resolved operations task corroborates execution. The September 2026 date-category page shows no Articles in its daily categories. The appropriate forward daily-volume expectation is therefore **0 new routinely published Articles while closed**, not an invented positive estimate from pre-closure history.[36][37][38][39]

**Actual public API observations on 2026-09-19:** querying the September 18, 2026 category returned HTTP 200 with an empty `categorymembers` array. A three-item descending Published-category query returned the closure Article (page ID `3088290`, category-add timestamp `2026-05-03T23:59:05Z`), followed by April entries. Its revision-history request returned latest revision `5025600` dated `2026-05-04T15:40:46Z`. These are narrow live smoke observations, not an exhaustive historical throughput measurement.[40][54][55]

This conflicts with the brief/spec expectation of a continuing second full-processing source. **Do not silently substitute another source or treat old archived Articles as current.** Archive use also encounters the fixed Article-body deletion rule: publication more than 30 days ago cannot acquire a fresh retention period just because it was ingested today. The interview must resolve M2b acceptance and any explicitly scoped historical evaluation permission before archive bodies become pipeline inputs.[1][3][36][37]

#### API recipes, conditional on the owner's archive decision

Use `https://en.wikinews.org/w/api.php` with `format=json&formatversion=2&maxlag=5`, an identified User-Agent/contact, serial requests, batching/cache where available, and bounded backoff. No universal unlimited-request allowance is asserted.[47][48]

| Operation | Request parameters / continuation | Interpretation |
|---|---|---|
| List published pages | `action=query&list=categorymembers&cmtitle=Category:Published&cmnamespace=0&cmsort=timestamp&cmdir=desc&cmlimit=50&cmprop=ids\|title\|timestamp` | Category-add time is not publication time; follow every returned continuation key.[41] |
| Date-based volume audit | `list=categorymembers&cmtitle=Category:September 18, 2026&cmnamespace=0&cmlimit=500`; intersect with Published membership. | Exclude drafts, categories, redirects and non-news pages; new pages/edits are not publication counts.[40][41] |
| Current wikitext | `action=query&prop=revisions&pageids=<id>&rvprop=ids\|timestamp\|sha1\|comment\|content&rvslots=main&rvlimit=1` | Preserve page ID, revision ID and slot content; apply rights/retention gate before body persistence.[1][42] |
| Revision history | `action=query&prop=revisions&pageids=<id>&rvprop=ids\|timestamp\|sha1\|comment&rvlimit=50&rvdir=newer&rvstartid=<last-revid>` | The start ID is inclusive in the observed smoke: `5025596` returned itself then `5025600`; skip stored revisions, carry all continuation keys.[42][54] |
| Revision HTML | `action=parse&oldid=<revid>&prop=text\|revid` | Parse a named revision; freeze normalized extraction. Template/render changes can alter HTML independently of the Article revision, so raw HTML differences are not automatically Article Changes.[43] |
| Recent edits discovery | `action=query&list=recentchanges&rcnamespace=0&rctype=edit\|new&rcprop=title\|ids\|timestamp\|comment&rcdir=newer&rcstart=<watermark>` | A bounded recent-changes feed is not complete archival history; use watched page revision histories for recovery.[44] |

**Proposed change adapter:** `(wiki,pageId,revid,extractorVersion)` identifies an observation. Compare normalized body SHA-256; the upstream SHA-1 is a revision marker, not a replacement for Evidence's SHA-256. A new revision with identical normalized article text creates no Article Change. A published explicit correction notice can be a Correction candidate; an edit summary, cleanup revision, or administrator action alone is not sufficient. Closure makes ongoing new-Article polling unproductive; run only the owner-approved archival/metadata scope.[1][2][36][42]

**Licensing date check:** English Wikinews' current copyright policy distinguishes CC-BY-4.0 for Articles published after 2024-12-16 from the earlier CC-BY-2.5 period beginning 2005-09-25; verify the article's actual license at the cutoff instead of assigning all historical text 4.0. Images have separate licensing. CC-BY-4.0 requires appropriate credit, license link and indication of changes. Proposed attribution: “Wikinews — [Article title/original link] — [revision permalink] — [applicable license]; excerpted / normalized / translated as applicable.” This grants no automatic image reuse, and a reuse license does not override the project's stricter retention rule.[1][45][46]

### Q8. Deterministic pre-embedding deduplication

**Boundary:** collection → exact dedup → embedding → Story assignment is fixed. Dedup identifies transport retries, Article aliases, exact content reuse and wire provenance; it does not solve semantic same-event grouping. The existing research calls for preserving syndication lineage. Feedly's documented >85% overlap and 31-day window are a product precedent, not evidence that these values protect our numeric/attribution changes.[1][4][5][6][20]

#### Proposed ordered rules and starting thresholds

| Order | Deterministic rule | Output and safeguards |
|---|---|---|
| 0. Rights and shape | Validate provider schema, rights tier, publication/observation times, normalized-body provenance. | Link-only Articles carry metadata; no body hash, embedding of hidden publisher body, or reporting-origin credit.[1][2] |
| 1. Exact provider item / URL | Same provider item ID or exactly identical accepted URL identifies a candidate existing Article. Compare body hash before deciding “already processed.” | Unchanged hash: merge observation/query memberships. Changed hash: Q4 new version, never discard as URL duplicate.[1][11] |
| 2. Conservative URL key | Lowercase scheme/host via URL parser; remove fragment/default port and explicitly allowlisted tracking keys (`utm_*`, `gclid`, `fbclid`). Keep path case, unknown query keys, trailing-slash differences and `http/https` distinct absent a verified alias. | Store original URL and rule version. Query sorting/removal beyond the allowlist requires a publisher-specific test; canonicalization must not combine pagination/article IDs.[21] |
| 3. Verified canonical alias | Accept same-publisher `rel=canonical`/redirect aliases only when already acquired permissibly, target identity/body agrees, and target is an Article rather than a homepage. | Cross-publisher canonical is provenance evidence, not permission to delete either publisher's Article. Quarantine inconsistent redirects/canonicals.[17][21] |
| 4. Exact normalized-body SHA-256 | Same nonempty full normalized body + normalizer version → exact content group. Compare stored bytes on a putative collision; never hash all empty bodies as one article. | Reuse embedding input for truly identical text; retain every distinct publisher Article and its URLs/times. Different hashes remain distinct versions/content candidates.[1][2] |
| 5. Headline candidate index | NFC, lowercase and whitespace-normalized title; exact match or token Jaccard ≥0.90 only generates a candidate pair within 72h. | **Never delete/merge from title alone**. Repeated headlines, liveblogs and same-entity different-event pairs survive.[1] |
| 6. Wire-copy evidence | Require explicit same wire credit/byline or a verified syndication reference, compatible original reporting date, ≥200 body tokens, ≥0.95 Jaccard of deterministic 5-token shingle sets, and length ratio ≥0.90. | Starting thresholds for a **wire-family candidate**, not automatic textual equivalence. Diff changed segments and preserve every copy/version; verify shared Evidence spans before counting one origin.[1][2][4] |
| 7. Ambiguous near-copy | High overlap without wire provenance, changed numbers/speakers/time/negation, or substantial local additions. | Keep separate processing inputs; record `possible-copy` provenance. Embedding + rules later assigns a Story; similarity never manufactures independent corroboration.[1][2] |

Rules 2–7 and all numerical thresholds above are **proposed development-set starting values**, not measured optimal values or final spec changes. A content fingerprint may lowercase/tokenize for candidate retrieval, but the exact normalized Evidence body and all changed tokens remain untouched. Deterministic means the same recorded inputs, parser/rule versions and clock yield the same decisions; it does not mean every similar pair should collapse.[1][22]

**Wire-copy implementation detail (proposal):** use a stable credited-wire identifier plus a reporting-item reference when available. Otherwise keep the relation as provisional until copied passages are established. Reuse an embedding only when the actual normalized title-plus-lead input hash also matches: identical bodies with different headlines do not establish identical embedding inputs. Make each Article/version's span mapping explicit; Evidence cannot cite offsets from a different publisher's version. For near copies, process changed/local paragraphs and preserve provenance at Claim level: shared wire passages count as one Reporting Origin; genuinely independent added reporting may count separately only when supported by its own Evidence. Do not use transitive similarity chains (`A≈B`, `B≈C`) to assert `A=C`; compare each member to the fixed representative or retain a graph of pairwise relations.[1][2][4]

**Window proposal:** exact identity lookup persists as metadata; full-content comparisons are confined to retained text (≤30 days). Wire candidates start in the 72-hour active window but can use an explicit wire-item reference to connect an older retained copy. No private 31-day body cache survives the spec's 30-day deletion merely to imitate Feedly.[1][20]

#### Stage handoff contracts to make M2a reviewable

These are **suggested adapter contracts**, not changes to the fixed pipeline or an implementation in this research ticket.[1][5]

| Boundary | Inputs → outputs | Suggested idempotency key |
|---|---|---|
| Collection | Provider response + intended slot + query version + rights decision → immutable observations, Article identity candidates, normalized version candidate, acquisition failures. | `(provider, slot, queryVersion, window, page)` for stored fetch results; observation identity also includes provider item/URL and payload hash. Intentional later re-fetch uses a new due-check/slot key. |
| Exact dedup | Recorded candidates + alias/provenance registry + rule version → Article/version upserts, query-membership unions, exact content groups, wire relations, material-change candidates. | `(articleIdentity, bodyHash, normalizerVersion, dedupRuleVersion)`; query-membership updates have their own set-union identity. |
| Embedding handoff | Eligible representative text + linked Article/version identities → embed inputs/reused vectors; metadata-only items follow their permitted matching path. | `(inputTextHash, preprocessingVersion, model, dimensions)`; do not reuse an old vector for changed text. |
| Later Revision calculation | Validated Claim/Evidence/status results plus version/provenance changes → the four permitted Change types, published atomically per Story. | `(storyId, orderedInputVersionSet, rule/prompt/modelVersions)` plus publication transaction identity. No-op observations do not advance published time. |

The complete pipeline still includes Evidence extraction, Claim generation, both consistency gates, contradiction judgement and atomic publication. A failed lookup/dedup stage is not an Article Change; a successful unchanged check updates observation metadata only. Downstream model execution and thresholds belong to their implementation/research tickets.[1]

#### Required evaluation packets and observable behavior

| Packet | Dedup/change behavior to assert through batch replay |
|---|---|
| Wire copy on multiple domains | Preserve publisher Articles/URLs; shared passages supply one Reporting Origin; no fabricated independent agreement.[1][2] |
| Same entity, different event | Title/entity similarity alone never merges; keep candidates for later event/time rules.[1] |
| Time shift | Keep new event/date-bearing text; temporal update is not automatically a contradiction or duplicate.[1] |
| Numeric update | One changed digit survives hash/diff and prevents exact-text reuse; preserve before/after version even though full numeric-claim comparison is deferred.[1] |
| Explicit correction | Preserve source notice and affected Evidence; only grounded explicit correction can drive corrected status.[1][19] |
| Silent edit | New normalized Article version and Article Change, without inventing Correction.[1][2] |
| Quote attribution | Speaker changes survive normalization/wire checks; quotations about corrections do not trigger publisher Correction.[1][19] |
| Non-BMP / combining characters | NFC/LF normalization is stable; code-point offsets and UTF-16 rendering conversion refer to the correct spans after movement.[1][22] |
| Prompt-like article text | Treat as literal input data, never execute instructions or change query/rights/dedup rules; replay produces the same output.[1][4] |
| Boilerplate / parser drift / truncated re-fetch | No false mass deletion or editorial Change from consent text, ad modules or extractor upgrades; mark failed/uncomparable observations.[1] |

Measure false merges/splits, wire-family precision/recall, same-URL-change recall, false boilerplate change rate, missed-correction rate, span remapping validity, and per-check coverage/cost on the development stream first. Preserve the spec's separate holdout and report denominators, not only aggregate duplicate savings. CI replays recorded inputs; paid network calls remain manual smoke/measurement work.[1]

## Options & trade-offs

| Decision | Option | Trade-off / status |
|---|---|---|
| Topic discovery | Search baseline + bounded category supplement | Recommended starting experiment: controllable keywords plus ranking-selected coverage; actual yield unknown.[9][10] |
| Topic discovery | Categories only | Lower query maintenance, weak match to Korea/international-politics boundaries; not recommended as sole collector.[1][10] |
| Change checks | Provider rediscovery within fixed quota | Lowest new crawler burden; no guaranteed publisher-edit freshness, explicit coverage gaps.[9][11][14] |
| Change checks | Per-source permitted publisher checks | Better direct observations where authorized; robots, terms, extraction and origin security add maintenance.[14][17][23] |
| Dedup | Exact identity/body collapse plus retained wire relations | Fits deterministic pre-embedding boundary and Reporting Origin semantics; some redundant text still requires analysis.[1][2] |
| Dedup | Broad title/85% overlap deletion | Saves calls but can erase changed quantities or distinct reporting; reject as a default.[1][20] |
| Publisher metadata | Reviewed local table seeded from structured open data | Small maintenance surface and inspectable provenance; actual top 50 comes from measurement, not a guessed ranking.[1][26][27] |
| Wikinews | Archive-only handling versus a revised live-source acceptance plan | Current closure prevents the old continuous-ingestion assumption; owner decision required, see interview.[1][36][37] |

## Recommendation

**Proposal for Claude's implementation tickets:** complete M2a with the documented GNews surface, query experiment, shared UTC request ledger, immutable Article versions, and deterministic identity/content/wire handling. Preserve all query memberships and publisher provenance. Use Q3's 48 discovery requests and Q4's bounded checks per slot as measured starting budgets; never guarantee 150 usable Articles or comprehensive edits before observing real data.[1][9][12][13]

Implement collection/dedup as replayable inputs and outputs before calibrating Story assignment. Treat the two active-age rechecks as a coverage policy, not an edit-completeness SLA; count lookup misses, changed-title misses, stale provider bodies and skipped checks. Ship the exact version/hash/span mechanics with fixtures in M2a, then connect the reader-facing Changes and Claim continuity in M3 as the spec requires.[1][2]

M2b should keep publisher metadata modest and reviewed, and GDELT strictly link-only. **Do not silently replace or reinterpret Wikinews:** record the closure finding and obtain the product decision below before representing its archive as a live third source. This research changes only this note; it neither amends the specification nor authorizes a new provider.[1][3][36][37]

Rights and retention remain cross-cutting invariants: no full GNews article in public payloads, no duplicate-origin inflation, no body re-creation after expiry, and no blanket publisher crawler. GNews termination's downloaded-material destruction requirement must not be forgotten by private measurement files or replay fixtures.[1][14]

## Open questions for the interview

1. **How should M2b's Wikinews acceptance criterion be handled now that English Wikinews is closed/read-only?** Options: **A**, explicitly approve a historical integration scope, separately deciding whether any evaluation-only exception to the 30-day body rule is permitted; **B**, defer the Wikinews/live-three-source acceptance portion while allowing metadata-only archival API validation under existing rules; **C**, authorize separate research on a successor source. **Recommendation:** B until the owner explicitly chooses the historical scope or successor investigation. A CC-BY license alone does not create a retention exception, and an archived real Article must not be relabelled as a designed Demo Story.[1][2][36][37][45]
2. **Should Korean-domestic English publishers count as foreign press?** Options: **A**, exclude them under the current domestic-source boundary; **B**, show them only as separately labelled link-only context after an explicit scope decision; **C**, consider full inclusion in a later rights-reviewed phase. **Recommendation:** A for v1. The choice changes eligibility, not merely the spelling of the Topic.[1][3]
3. **Should multi-topic Stories have an additional primary display Topic?** Options: **A**, equal membership labels with no primary; **B**, primary selected by fixed Korea → politics → economy → tech priority, all secondary labels retained; **C**, an owner-maintained display override with all memberships retained. **Recommendation:** A initially. Exclusive assignment is not an option here because the spec already fixes Topic union.[1]
4. **What change-detection coverage should be communicated when provider freshness and quota prevent complete monitoring?** Options: **A**, the proposed two active checks plus sampled dormant checks, with per-Article last-check/gap metadata; **B**, concentrate the same allowance on Articles currently supporting displayed Evidence; **C**, prioritize disputed/corrected Stories and disclose narrower routine coverage. **Recommendation:** A as a measurable baseline, then B if the density experiment shows active monitoring misses its budget. No option promises discovery of all edits.[1][9][14]
5. **Which source-specific direct re-fetch permissions, if any, should be approved?** Options: **A**, provider-only checks until permission is recorded; **B**, a small reviewed publisher allowlist; **C**, only openly licensed archives. **Recommendation:** A for M2a, B only where a documented permission basis exists. This asks about the unresolved acquisition method, not permission to bypass restrictions.[1][14][17]
6. **What should happen to retained GNews Evidence excerpts and downloaded-content derivatives at subscription termination?** Options: **A**, remove all GNews-derived text and invalidate affected public representations while retaining non-content operational audit identifiers; **B**, retain only material covered by separately documented surviving rights; **C**, defer any cancellation until the retention/termination handling is explicitly resolved. **Recommendation:** A by default; indefinite Evidence retention in the general spec must not silently override its separate cancellation rule or supplier terms.[1][14]

## Sources

1. Repository source of truth, [specification](../spec/v1.md), especially domain rules, rights, pipeline, batches/cost, accounts, operations, retention, evaluation, pending/development decisions, testing and milestones — read 2026-09-19.
2. Repository [domain glossary](../../CONTEXT.md) — read 2026-09-19.
3. [Research brief #9](briefs/09-gnews-queries-change-detection.md); requester focus/overrides dated 2026-09-19 govern this run — read 2026-09-19.
4. Prior [AI pipeline research](04-ai-pipeline.md), source/API table and pipeline/versioning principles — read 2026-09-19; original research access date 2026-09-15, only current facts reverified here are adopted.
5. Prior [stack research](03-stack.md), ingestion/dedup/version contracts — read 2026-09-19; historical proposals subordinate to [1].
6. Prior [landscape research](01-landscape.md), dedup/clustering and provenance/change-tracking findings — read 2026-09-19; primary Feedly fact rechecked at [20].
7. Prior [UX research](02-ux.md), publisher metadata/provenance stance — read 2026-09-19; subordinate to [1].
8. Prior [portfolio research](05-portfolio-bar.md), inspectable evaluation/provenance evidence — read 2026-09-19; subordinate to [1].
9. GNews, [Search endpoint](https://docs.gnews.io/endpoints/search-endpoint) — live reference, no displayed revision date; accessed 2026-09-19.
10. GNews, [Top Headlines endpoint](https://docs.gnews.io/endpoints/top-headlines-endpoint) — live reference, no displayed revision date; accessed 2026-09-19.
11. GNews, [JSON response](https://docs.gnews.io/json-response) — accessed 2026-09-19.
12. GNews, [Error handling](https://docs.gnews.io/error-handling) — paid 10 requests/second and UTC reset explicitly documented; accessed 2026-09-19.
13. GNews, [Pricing](https://gnews.io/pricing) — monthly Essential offer; accessed 2026-09-19, no account-tier measurement.
14. GNews, [Terms of Service](https://gnews.io/legal/terms-of-service) — updated 2026-06-22, especially §§5–8, 14; accessed 2026-09-19.
15. NewsDiffs authors, [original source repository](https://github.com/ecprice/newsdiffs) — historical software/reference, not a current service SLA; accessed 2026-09-19.
16. NewsDiffs authors, [About NewsDiffs](https://newsdiffs.org/about/) — historical project description; accessed 2026-09-19.
17. IETF, [RFC 9309: Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309.html) — September 2022; accessed 2026-09-19.
18. Guardian, [Terms and conditions](https://www.theguardian.com/help/terms-of-service), automated-use restrictions — accessed 2026-09-19; no permission inferred.
19. Associated Press, [Telling the Story](https://www.ap.org/about/news-values-and-principles/telling-the-story/), corrections, attribution and editor's notes — accessed 2026-09-19.
20. Feedly, [How does Deduplication work?](https://docs.feedly.com/article/218-how-does-deduplication-work) — product-specific precedent; accessed 2026-09-19.
21. IETF, [RFC 6596: The Canonical Link Relation](https://www.rfc-editor.org/info/rfc6596/) — April 2012; accessed 2026-09-19.
22. Unicode Consortium, [UAX #15: Unicode Normalization Forms](https://www.unicode.org/reports/tr15/) — current reference; accessed 2026-09-19.
23. IETF, [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html), conditional requests/validators — June 2022; accessed 2026-09-19.
24. GNews, [legacy v4 documentation](https://gnews.io/docs/v4) — older `expand=content` examples; consulted only to explain migration to [9]; accessed 2026-09-19.

25. GNews, [Authentication](https://docs.gnews.io/authentication) — `X-Api-Key` header or query-key methods; accessed 2026-09-19.
26. Wikidata, [Licensing](https://www.wikidata.org/wiki/Wikidata:Licensing) — structured data CC0; accessed 2026-09-19.
27. Wikidata, [Data access](https://www.wikidata.org/wiki/Wikidata:Data_access) — entity API/JSON access; accessed 2026-09-19.
28. Wikidata, [official website, P856](https://www.wikidata.org/wiki/Property:P856) — accessed 2026-09-19.
29. Wikidata, [country, P17](https://www.wikidata.org/wiki/Property:P17) — accessed 2026-09-19.
30. Wikidata, [headquarters location, P159](https://www.wikidata.org/wiki/Property:P159) — accessed 2026-09-19.
31. Wikidata, [owned by, P127](https://www.wikidata.org/wiki/Property:P127) — accessed 2026-09-19.
32. Wikidata, [parent organization, P749](https://www.wikidata.org/wiki/Property:P749) — accessed 2026-09-19.
33. Wikidata, [language of work or name, P407](https://www.wikidata.org/wiki/Property:P407) — accessed 2026-09-19.
34. Associated Press, [About](https://www.ap.org/about/) — cooperative ownership description; accessed 2026-09-19.
35. Reuters, [Contact us](https://reutersagency.com/contact-us/) — parent organization reference; accessed 2026-09-19.
36. English Wikinews, [Main Page](https://en.wikinews.org/wiki/Main_Page) — current closed/read-only notice; accessed 2026-09-19.
37. Wikimedia Foundation Board, [2026 noticeboard archive](https://meta.wikimedia.org/wiki/Wikimedia_Foundation_Board_noticeboard/Archives/2026) — 2026-03-30 closure announcement and May 4 date; accessed 2026-09-19.
38. Wikimedia operations, [T421796](https://phabricator.wikimedia.org/T421796) — resolved Wikinews closure operation; accessed 2026-09-19.
39. English Wikinews, [September 2026 category](https://en.wikinews.org/wiki/Category:September_2026) — daily category counts; accessed 2026-09-19.
40. English Wikinews, [September 18 date-category API request](https://en.wikinews.org/w/api.php?action=query&list=categorymembers&cmtitle=Category%3ASeptember%2018%2C%202026&cmnamespace=0&cmlimit=500&format=json&formatversion=2&maxlag=5) — actual HTTP 200, empty `categorymembers`; measured 2026-09-19.
41. MediaWiki, [API:Categorymembers](https://www.mediawiki.org/wiki/API:Categorymembers) — accessed 2026-09-19.
42. MediaWiki, [API:Revisions](https://www.mediawiki.org/wiki/API:Revisions) — accessed 2026-09-19.
43. MediaWiki, [API:Parsing wikitext](https://www.mediawiki.org/wiki/API:Parsing_wikitext) — accessed 2026-09-19.
44. MediaWiki, [API:RecentChanges](https://www.mediawiki.org/wiki/API:RecentChanges) — accessed 2026-09-19.
45. English Wikinews, [Copyright](https://en.wikinews.org/wiki/Wikinews:Copyright) — article-date license boundaries; accessed 2026-09-19.
46. Creative Commons, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — attribution/change obligations; accessed 2026-09-19.
47. MediaWiki, [API:Etiquette](https://www.mediawiki.org/wiki/API:Etiquette) — accessed 2026-09-19.
48. Wikimedia Foundation, [User-Agent Policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy) — accessed 2026-09-19.
49. GDELT, [DOC 2.0 API debut/reference](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/) — published 2017-06-20; current page rechecked 2026-09-19, historical documentation distinguished from live measurements.
50. GDELT, [DOC 2.0 search-window update](https://blog.gdeltproject.org/doc-2-0-updates-1-5-year-searching-and-updated-mobile-interface/) — published 2018-05-18; accessed 2026-09-19.
51. GDELT, [Project overview](https://gdeltproject.org/) — Events/GKG product distinctions; accessed 2026-09-19.
52. GDELT, [About and dataset terms](https://gdeltproject.org/about.html) — accessed 2026-09-19; underlying publisher rights not granted by inference.
53. GDELT, [actual DOC API smoke request](https://api.gdeltproject.org/api/v2/doc/doc?query=%22South%20Korea%22%20sourcelang%3Aenglish&mode=artlist&format=json&maxrecords=250&timespan=24h&sort=datedesc) — HTTP 429 and five-second pacing guidance observed twice 2026-09-19; no successful payload/cap measurement.
54. English Wikinews, [actual revision-history smoke](https://en.wikinews.org/w/api.php?action=query&prop=revisions&pageids=3088290&rvprop=ids%7Ctimestamp%7Ccomment&rvlimit=2&rvdir=newer&rvstartid=5025596&format=json&formatversion=2&maxlag=5) — actual revisions `5025596`, `5025600`; measured 2026-09-19.
55. English Wikinews, [actual Published-category smoke](https://en.wikinews.org/w/api.php?action=query&list=categorymembers&cmtitle=Category%3APublished&cmnamespace=0&cmsort=timestamp&cmdir=desc&cmlimit=3&cmprop=ids%7Ctitle%7Ctimestamp&format=json&formatversion=2&maxlag=5) — three returned entries, most recent category addition the closure Article; measured 2026-09-19.
