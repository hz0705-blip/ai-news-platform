# Hosting and infrastructure research — issue #6

## 요약

- **2026-09-17 기준 제안:** M0는 Vercel Hobby 서울 웹 + Supabase Pro 서울 DB로 시작하고, M2a에 Railway 싱가포르 상시 Node 워커를 추가한다. 웹·DB 이전은 필요 없다.[1][3][6][9][56][58]
- Hobby는 개인·비상업용 포트폴리오라는 조건에서 사용한다. 광고·유료 서비스·고객 업무로 바뀌면 재선정한다. Pro $20를 추가한 기존 구성 A는 현재 총예산에 맞지 않는다.[2][3][4][52]
- Supabase의 pgvector 0.8.x 제공 근거는 있지만, 선택한 서울 인스턴스의 실제 버전과 HNSW 생성 성공은 M0에서 SQL로 검증해야 한다. Neon은 버전 표가 명확하지만 서울·도쿄 지역이 없다.[59][65][66][79]
- Supabase Pro 일일 백업 + 외부 암호화 덤프를 기본으로 제안한다. 약 $130/월인 DB+PITR 구성은 제외하며, 특정 시점 복원이 필수라면 Neon 싱가포르를 선택한다.[56][57][61][64][67]
- 최소·권장·여유 구성의 계산상 월 총액은 **$142.44 / $146.78 / $149.50**다. GNews, OpenAI $40, 가정한 환율·세금·수수료를 포함하며 실제 청구액과 사용량 조건을 확인해야 한다.[8][12][34][52][56][64]
- 스케줄은 `Asia/Seoul`의 `0 5,17 * * *`, UTC로는 `0 20,8 * * *`다. 중복 실행 방지·재시도·지출 예약·재시작 후 누락 회복을 DB 상태로 관리한다.[42][43][44]
- 복구 훈련과 마이그레이션 장애 대응은 쓰기 중지 → 격리 DB 복원·검증 → 호환 앱 배포 및 연결 전환 → 작업 재개 순서를 따른다. 이 문서는 조사 결과이며 배포·복구 실측 완료 보고서가 아니다.[45][46][54][55][81]

## Scope

**Snapshot: 2026-09-17, Asia/Seoul.** All undated present-tense provider facts, tables and calculations below refer to this access date; explicitly dated announcements retain their original date. Prices are public list prices, not account-specific quotes. Recommendations and workload estimates are labelled as such. The brief fixes Stack A, Supabase Auth with Kakao/Google, about 300 Articles/day, two daily batches and a **$150 total monthly ceiling**; this report does not reopen those product choices.[1]

Questions are answered in order in Findings §1–§8. M0 blockers receive priority within those answers: web eligibility, actual extension availability, affordable recovery, worker duration and migration rollback. Existing `03-stack.md` is reused for the always-on pg-boss worker (§4, lines 71–76), Revision-aware caching (line 84), Seoul placement (line 171), configuration A (line 184), and Sentry/Langfuse (line 211); only the relevant assumptions and current provider facts are checked here.[2]

**Evidence boundary:** this run inspected documentation and checked only whether conventional DB and OpenAI administration credential environment variables were present; none were present. No provisioned database was queried, no paid API measurement was made, and no restore, deployment or Seoul latency benchmark was executed. SQL gates and drills below are proposed acceptance evidence for Claude's implementation. Source-code extension versions are distinguished from provider documentation and from a live selected-instance result. Local project sources are [1]–[2]; external factual sources are first-party documentation, vendor pages or upstream code.[1][59][65][78]

## Findings

### 1. Component map and the M0 web decision

**Deploy `apps/web` to Vercel Hobby with Node 24 and the function region explicitly set to `icn1`; use Supabase Pro PostgreSQL 17 in the specific Seoul region, subject to the SQL acceptance gate in §3.** This is the recommended M0 target, not a completed deployment. Vercel supports Node 24 and pnpm monorepos; `apps/web` is the project root while shared workspace packages remain available to the build. Run the first reviewed Drizzle migration separately from web request execution.[6][7][46][58][83]

**Is Hobby usable? Conditionally yes.** The vendor restricts it to personal, non-commercial use. A self-funded portfolio with no sales, ads, paid client work or monetized access is the assumed use here; this is an application of the published policy, not a written vendor ruling about this project. A hiring portfolio is not expressly exempted by name. If its purpose includes selling development services or the interpretation remains ambiguous, get a vendor determination or choose a paid host. Purchasing GNews/OpenAI is an expense and by itself does not establish that visitors generate revenue. Pro is $20/month with $20 usage credit, not a $20 all-resource spending ceiling.[3][4]

Check repository ownership before M0 import: Vercel Hobby cannot connect its Git integration to a repository owned by a Git organization. The free-web estimate assumes an eligible personal repository; do not discover this constraint after choosing the paid DB.[94]

| Component | Viable providers and current entry tiers | Limits relevant to this workload |
|---|---|---|
| Next.js web | Vercel Hobby $0 / Pro $20; Railway Hobby $5 minimum credited to usage; Render paid web from $7; Fly metered Machines; Cloudflare Workers $0 / $5 paid minimum.[4][8][12][17][49] | Vercel Hobby: 2 GB, 300 s/invocation, 100 GB CDN transfer, 1M edge requests, 4 active CPU-hours and 360 GB-hours memory/month. Pro: up to 4 GB, 800 s generally available; **1,800 s beta**, documented August 24, 2026. Cold starts remain possible; request concurrency must not become unbounded DB connections.[3][4][5] |
| Persistent Node worker | Railway, Render background worker, Fly Machine; a VPS is an operator-managed alternative. No Redis is needed for the fixed pg-boss choice.[2][8][13][17] | Persistent processes have no HTTP invocation deadline; restarts, deployment termination and OOM still apply. Proposed initial cap: one worker, 512 MB, small API concurrency, measured before increasing. See §2 for provider limits and costs.[8][13][17] |
| PostgreSQL + vector | Supabase Pro, Neon Launch, conditional Railway image, Fly MPG, Crunchy Bridge; self-hosting is not a managed DB service.[56][64][69][72][75] | Free Supabase/Neon DBs are only 0.5 GB and cannot satisfy the 5 GB comparison. pgvector presence does not establish version 0.8.x; use §3's gate. Supabase Micro has 60 server connections / 200 pool clients; pooling does not create more database compute.[56][61][64][65] |
| Scheduler | pg-boss inside the always-on worker: no separate scheduler bill; provider cron is an alternative trigger, not a second concurrent owner.[42] | At least one scheduler process must run. Recommended timezone and recovery semantics are in §5; a saved cron expression alone does not guarantee execution during an outage.[42] |
| Fixtures, eval reports and backups | R2 Standard: first 10 GB-month, 1M Class A and 10M Class B operations free; thereafter $0.015/GB-month, $4.50/M writes and $0.36/M reads, no R2 egress fee. Supabase Storage is also viable: Free 1 GB / Pro 100 GB included, sharing plan egress constraints.[34][56] | R2 single-part uploads are approximately 5 GiB; use multipart for larger dumps. About 5 TiB maximum object size. No compute memory/DB connection quota applies to object storage itself. Separate private backup objects from public fixtures.[35] |
| Logs/errors/model traces | Sentry Developer and Langfuse Hobby $0; structured stdout and a durable run ledger; external HTTP and missing-run monitoring.[36][37][38][39] | Sentry: one user, 5k errors, 5 GB logs, 5M spans/month; Langfuse: 50k units/month, 30 days access. Full article-level traces can exhaust units; see §6.[36][37] |

**Alternatives if Hobby is ineligible:** a paid Node web container on Railway/Render or Fly preserves the Node runtime and PostgreSQL driver. Render Free sleeps after 15 minutes of inactivity and is unsuitable as the production freshness/availability baseline. Cloudflare's official Next.js path uses OpenNext; Workers Free has 100k requests/day and 10 ms CPU, Paid starts at $5 with 10M requests and 30M CPU-ms, and isolate memory is 128 MB. It is a viable cost candidate only after adapter, authentication, database connectivity and revalidation tests, not an automatic drop-in for the repository's Node deployment. No advertised cold-start milliseconds are treated as measured latency here.[12][17][49][50][51][84]

### 2. Worker placement: 20–60 minutes, twice daily

**Workload assumption:** 60 monthly batches × 20–60 minutes = **20–60 active hours**, excluding retries, CI and backups. An always-on pg-boss process is billed for idle memory as well as batch execution. Prices below exclude OpenAI, the DB and taxes; RAM/CPU sizing is a proposed starting point, not a benchmark. All options build from the same repository and import the shared packages.[1][2][8]

Fly offers a trial, not an ongoing free worker: two VM-hours or seven days, with trial Machines stopping after five minutes. A paid account is required for the proposed 20–60-minute batch. Persistent paid containers/VMs stay warm while running but still have deployment/restart startup time; no provider startup-time guarantee was established.[13][17][93]

| Runtime | Duration, memory and monthly cost at this load | pg-boss and monorepo fit; important failure boundary |
|---|---|---|
| **Railway persistent service — recommended** | No documented batch wall-clock termination. Hobby $5 minimum; example average 0.5 GB RAM × $10 + 0.02 vCPU × $20 + 2 GB egress × $0.05 = **$5.50**. Peak RAM must still fit the configured service limit; Free permits only 0.5 GB and $1 monthly credit.[8][11] | Build the worker from repository root with a filtered pnpm build/start command. Keep sleeping/serverless mode off so polling and scheduling remain alive. Native cron can instead start/exit a one-shot worker, but then pg-boss's resident scheduler is disabled; retries need a subsequent invocation. Railway cron skips a new run while the prior run is active.[11][82] |
| **Fly Machine** | No function-style deadline. Public selector shows shared-1x/512 MB roughly $3.32/month and 1 GB $5.92, **region unresolved in extracted quote**; allow $4–8 for a small always-on worker pending Tokyo checkout. 20–60 h of a $0.0046/h preset is $0.09–0.28 compute only; this excludes scheduler, stopped rootfs and network. APAC public egress $0.04/GB, volumes $0.15/GB-month.[17] | Docker worker process, separate from web process; keep one Machine running for pg-boss. Stop/start scheduling requires another timer. Fly's approximate scheduled Machines are not precise KST cron; its Cron Manager is a separate always-on app that starts job Machines.[18][19] |
| **Render background worker / cron** | Paid 512 MB / 0.5 CPU worker **$7/month**, no free background-worker tier. Continuous worker has no per-job timeout. Cron has a **12-hour** cap and $1/service monthly minimum, prorated compute; 20–60 h at the corresponding $7/month rate is below/near that minimum, before retries.[12][13][14] | Build root workspace; worker-specific start command. Native cron delays the next scheduled run until the active run finishes; a manual trigger cancels the active run. Keep continuous pg-boss for uncomplicated retry/scheduler ownership. Singapore region; Hobby workspace includes 5 GB egress, then $0.15/GB.[14][15][16] |
| **Hetzner VPS** | No batch timeout; operator sets RAM/process limits. Singapore CPX12 is **$17.99/month excluding IPv4** after the June 15, 2026 increase, not an old €4 Europe quote. Singapore includes plan-dependent 0.5–5 TB traffic; overage $8.49/TB.[21][22] | Docker/systemd processes built from one workspace image; pg-boss runs normally. Operator owns OS patches, restart supervision, firewall, DB recovery if colocated and deployment drain. Paying for a dedicated server only for two short batches wastes idle capacity; assessment based on the fixed workload.[1][21] |
| **Oracle Always Free VPS** | $0 if allocation is available and quotas are respected. Current documentation gives A1 **1,500 OCPU-hours + 9,000 GB-hours**, equivalent to 2 OCPU / 12 GB, plus 200 GB block storage; do not reuse older 4 OCPU / 24 GB claims. Idle instances may be reclaimed.[20] | Node ARM container and systemd/pg-boss are feasible. Home-region capacity and reclamation prevent treating this as guaranteed free production hosting. No HTTP execution deadline; full operations burden remains.[20] |
| **GitHub Actions scheduled worker** | Standard Ubuntu VM job limit **6 h**; private runner 2 CPU/8 GB, public 4 CPU/16 GB. **Do not use `ubuntu-slim`: its limit is 15 min.** Public standard runners are free; private Free includes 2,000 min/month. 1,200–3,600 worker min means $0–$9.60 excess at $0.006/min before CI/retries.[23][24][26] | Run a finite worker command, drain/close pools and exit. pg-boss remains the job store but cannot run its scheduler when Actions is absent; use workflow cron to enqueue. Schedules can be delayed/dropped and public schedules disable after 60 days of inactivity; not the primary production worker recommendation.[25] |
| **Supabase Edge / Cron** | Edge: 256 MB, 2 s CPU/request, 150 s Free / 400 s paid wall time, 150 s idle timeout. Free includes 500k function invocations, Pro 2M; usage size is small here but duration fails.[27][56] | Cron can enqueue work or invoke an HTTP trigger, not supply a 60-minute Node process. Supabase recommends ≤8 concurrent cron jobs and ≤10 min/job; that is guidance, distinct from Edge hard limits. Adding a second queue/runtime would reopen the fixed stack.[1][28] |
| **Trigger.dev** | Tasks run without a duration limit by default; set a project/task maximum. Small-1x 0.5 vCPU/0.5 GB costs $0.0000338/s plus $0.000025/run: **$2.44–$7.30** metered at 60 runs. Free has $5 credits; Hobby $10 includes $10 credits, so budget $10 if Free is insufficient. Free pricing lists 20 concurrent runs and 10 schedules.[29][30] | Separate task deployment from the monorepo can import pipeline code. A finite pg-boss consumer can run inside a task, but Trigger scheduling/retries plus pg-boss introduce duplicate ownership unless one is disabled. This is an alternative, not a reason to replace the fixed worker now.[1][30][31] |
| **Inngest** | Hobby $0: 50k executions, 5 concurrent steps; a run plus each step counts. 9,000 Articles × (1 run + 4 steps) = 45k, before orchestration/retries. Pro starts at **$99**, outside this budget. Step max is 2 h **or the lower underlying host timeout**.[32][33] | Orchestration does not make a Vercel HTTP step last 60 minutes. Serve handlers beside the app or from a dedicated connection worker, with each step bounded; this duplicates pg-boss responsibility and is not the selected design.[2][33] |

The current Vercel 30-minute beta can accommodate some shorter work, so the absolute claim “Vercel can never run 30 minutes” is outdated. It still cannot safely contain the **60-minute upper bound**, recovery and retries as one invocation. Keep the separate worker already recommended by `03-stack.md`; do not base M2a on a beta deadline.[2][5]

### 3. PostgreSQL, pgvector and affordable recovery

#### Availability is three different claims

“Supports vectors,” “publishes a 0.8.x build,” and “this selected project runs 0.8.x” require different evidence. **Neon has the clearest public extension matrix; Supabase has hosted availability evidence plus current build manifests; Railway custom images and self-hosting provide image control. Fly MPG and Crunchy Bridge need explicit installed-version confirmation before being counted as satisfying 0.8.x.** HNSW predates 0.8, so HNSW availability alone is insufficient.[59][65][69][70][74][76][78][79]

| Provider | PG17/18 + pgvector/HNSW evidence | Approximately 5 GB: compute, storage and limits | Pooling, previews, region/cold behavior |
|---|---|---|---|
| **Supabase** | PG17; PG18 not verified. Official build manifest includes vector **0.8.0/0.8.2** for PG15/17; hosted discussion confirms 0.8.0 after an instance upgrade in April 2025. Actual Seoul default still requires SQL. HNSW documented.[59][79][85] | Free 500 MB, pauses after one inactive week. Pro **$25** with one Micro and 8 GB disk, 250 GB egress; extra disk $0.125/GB. Micro approximately 1 GB RAM, 60 server/200 pooled client connections.[56][61] | Supavisor transaction mode for web; direct/session mode for persistent work. Preview branches meter compute/disk/egress, Micro from $0.01344/h, outside compute credit/spend cap. **Seoul/Tokyo** specific regions; paid primary does not rely on scale-to-zero.[58][62][63] |
| **Neon** | Matrix explicitly lists **0.8.0 for PG14–17; 0.8.6 for PG18**. HNSW capability follows upstream vector, but acceptance still tests the actual target.[65][78] | Free 0.5 GB and 100 CU-hours/project; paid Launch **$0.106/CU-h + $0.35/GB-month**. At 0.25 CU ×730 h plus 5 GB: **$21.10**, before history. 0.25 CU is about 1 GB RAM; continuous queue polling prevents assumed idle savings.[64][67] | PgBouncer up to 10k client connections; actual backend limit depends on CU. Launch includes 10 branches; additional branches $0.002/branch-h plus compute/storage. **Singapore/Sydney, no Seoul/Tokyo** in current region list. Launch includes 500 GB public egress/project, then $0.10/GB; Free includes 5 GB. Sleeping endpoints add wake-up latency; no measured wake time claimed.[64][66][68] |
| **Railway** | Default template is explicitly **unmanaged** and omits extensions. Marketplace PG18.4/vector0.8.6 template is image evidence, not a maintained managed extension matrix. Pin and validate an appropriate PG17/18 vector image; HNSW comes from that image.[69][70][78] | Example 1 GB average RAM +0.05 vCPU +10 GB provisioned volume +2 GB egress = **$12.60 resource usage**. Hobby's 5 GB volume limit cannot safely hold 5 GB data plus WAL/index headroom: Pro $20 minimum makes the practical floor **$20**, shared with worker usage, before backup storage.[8] | Add PgBouncer explicitly; backend connections depend on DB configuration, not an advertised shared pool. Separate preview DB services/volumes cost resources. Singapore only in Asia; no Seoul/Tokyo. Keep DB awake.[8][9][69] |
| **Fly Managed Postgres** | CLI supports PG16/17, defaults to 16: request 17 explicitly. PG18 not established. Vendor documents pgvector/HNSW but no exact 0.8.x matrix.[73][74] | Basic $38 plus **$0.28/provisioned GB**. Default 10 GB volume means **$40.80** for 5 GB used, not $39.40 unless a 5 GB provision is accepted. Pooling, HA and recovery included; too little remaining total budget.[72][73] | PgBouncer included; session/transaction behavior is configurable. Fork/restore is an independently billed cluster, not an assumed free preview. **Tokyo** MPG available, Seoul absent.[18][72][86] |
| **Crunchy Bridge** | PG17/18 supported; PG18 announced November 7, 2025. The older pricing table includes PG15, but provisioning was generally retired May 26, 2026. Vector is available; exact current 0.8.x remains unverified.[75][76][92] | Published **AWS East** Hobby-0 $9/512 MB, Hobby-1 $18/1 GB; storage $0.10/GB. $9.50/$18.50 are 5 GB arithmetic, **not Seoul/Tokyo quotes or verified minimum-volume totals**. Hobby has no managed PgBouncer, HA or SLA.[75] | Own pooler for serverless on Hobby; clone/restore previews need a cost quote. Official provider catalog lists **Tokyo on AWS/GCP; no Seoul**. Tokyo has a 1.3 regional multiplier, but its application to storage/minimum volume needs a quote before a total is claimed.[75][77][91] |
| **Self-hosted VPS / Fly unmanaged** | Upstream images include **0.8.6-pg17 / 0.8.6-pg18**, HNSW. Pin digest, inspect and rehearse upgrades; this is operator-owned PostgreSQL.[78] | VM + disk + offsite storage. Hetzner Singapore starts around $17.99 excluding IPv4; Oracle is conditional $0. A 5 GB database needs additional working space for WAL, indexes, dump/restore and upgrades.[20][21][54][55] | Configure PgBouncer and `max_connections`, private networking and disposable preview DBs yourself. Fly Tokyo exists; no separate managed-service guarantee is implied by using its volume snapshots.[18][87] |

**M0 extension gate proposal:** connect with the migration role, record server version and available/installed vector version, then actually create an HNSW index. Fail deployment unless PostgreSQL is the approved major and vector is the accepted **0.8.x patch**. The upstream changelog contains later patch fixes, so “any 0.8” is not a security review. Supabase announced on July 22, 2026 that explicit extension version pinning is ignored from August 5: requesting `VERSION '0.8.2'` is not enforcement. An absent/old extension blocks M0 acceptance until the provider upgrade or a verified alternate target is selected.[59][60][65][78][88]

```sql
SHOW server_version;
SELECT name, default_version, installed_version
FROM pg_available_extensions WHERE name = 'vector';
CREATE EXTENSION IF NOT EXISTS vector;
SELECT extversion FROM pg_extension WHERE extname = 'vector';
SELECT amname FROM pg_am WHERE amname = 'hnsw';

-- Proposed disposable capability check, not production schema:
BEGIN;
CREATE TABLE public.infra_vector_probe (id integer, embedding vector(3));
INSERT INTO public.infra_vector_probe VALUES (1, '[1,0,0]');
CREATE INDEX infra_vector_probe_hnsw
  ON public.infra_vector_probe USING hnsw (embedding vector_cosine_ops);
SELECT id FROM public.infra_vector_probe
  ORDER BY embedding <=> '[1,0,0]'::vector LIMIT 1;
ROLLBACK;
```

Set the appropriate extension schema in `search_path` if the host installs vector outside `public`. This tiny query proves availability and permissions, not ANN quality or performance; a realistic fixture corpus and query-plan test are separate acceptance evidence.[78][85]

**Connection proposal:** web uses the transaction-pool URL with a small per-instance pool (start at one), SSL, and prepared statements disabled where required; worker uses a bounded direct/session pool (start at five), and migrations/backups use a distinct direct/session credential. Supabase direct connections normally require IPv6; use its session pooler when the CI runner needs IPv4. Keep privileged migrations and pg-boss schema setup out of autoscaled request handlers. Check `SHOW max_connections` and reserve operational connections during the first deploy.[61][62][68]

#### Backup and PITR comparison

| Option | Recovery capability and price | Decision under this budget |
|---|---|---|
| Supabase Pro daily backups | Seven daily recovery points included. Storage API objects are not included in database backups. Logical copies need separate retention and verification.[57] | **Recommended default**, with explicit acceptance of up to 24 h DB data loss between daily points. Additional pre-migration copies protect known risky changes. This is not arbitrary-time recovery.[54][57] |
| Supabase native PITR | Seven-day PITR approximately $100/month add-on and at least Small compute. Pro25 + Small15 − compute-credit10 + PITR100 ≈ **$130 DB-only**.[56][57][61] | Reject: GNews and model spend already make this exceed $150 before web/worker.[1][52] |
| Neon Launch history | Configurable up to seven days; paid default is one day, so set the window deliberately. History storage **$0.20/GB-month** in addition to compute/data. Example retained history 5 GB adds $1, not a guaranteed fixed backup fee.[64][67] | Best documented low-cost managed PITR alternative; Singapore and a separate Supabase Auth project are the tradeoffs. Keep a periodic portable dump too.[1][66][68] |
| Railway native PITR | **Available now**, using pgBackRest: weekly full/daily differential, four full backups retained; no flat PITR fee, storage-bucket usage and DB upload egress billed. Restore creates a sibling service. Requires a compatible Railway archiver image; custom pgvector-template compatibility is unverified.[71] | Promising conditional alternative, not “Railway has no PITR.” Rehearse vector + archiver + restore together before selecting it; monitor WAL upload health, not just snapshot success.[71] |
| Fly MPG / unmanaged | MPG advertises ten days of automated backups and point-in-time restore to a new cluster. Unmanaged Fly Postgres leaves recovery to the operator; daily volume snapshots default to five-day retention.[72][87] | MPG $40.80 DB floor is too large here. Unmanaged snapshots are not a substitute for WAL-based recovery.[55][72][87] |
| Crunchy Bridge | Daily backups plus WAL, ten-day recovery retention included; clone/restore to another cluster incurs its resources.[77] | Potential low-cost PITR alternative only after region, exact vector version, volume minimum and pooler costs are confirmed.[75][76][77] |
| `pg_dump` to R2 | Portable consistent logical snapshot; restore at the snapshot's state. **No PITR** without a base backup and continuous WAL archive. Self-hosting pgBackRest/WAL archiving adds operator duties.[34][54][55] | Independent copy for all configurations. Encrypt before upload, verify checksum and keep the decryption key outside the DB provider. Proposed retention/cost model is in §4.[34][54] |

#### Concrete recovery drill, proposed for M0 and repeated monthly

1. **Prepare an isolated target and evidence manifest.** Before the first migration, record PostgreSQL/vector versions, migration file hash, release identifier and UTC time. Once fixtures exist, capture counts, the latest published Revision ID and known Claim–Evidence links. Use a compatible PostgreSQL client; `pg_dump -Fc` plus a separately protected roles/grants export is a logical baseline. Preserve the application, migration-history and pg-boss schemas; use Supabase's provider-aware export guidance for managed schemas/roles.[45][54][57][80]
2. **Back up off-provider and prove readability.** Encrypt the dump, upload under a unique timestamp/checksum object key, then retrieve it and validate checksum/decryption. Back up fixture/report objects independently. Recommended schedule is one nightly full dump plus pre-migration dumps; alert if no successful backup by the next expected window. This model does not claim a 12-hour RPO; doubling full dumps changes egress materially.[34][39][54][57]
3. **For a logical drill**, restore to an empty same-major test DB with compatible vector using `pg_restore --exit-on-error --no-owner --no-privileges`, then deliberately recreate required roles/grants. **For a PITR drill**, write marker A, record UTC target T, then write marker B; restore a new branch/cluster to T after confirming T is inside the provider's recovery window. Verify A exists and B does not. Never overwrite production for a drill.[55][67][71][72][77][81]
4. **Keep all restored workers and schedules disabled.** Verify restore exit status, schema/migration journal, row counts, referential integrity, latest Revision, Claim–Evidence links, vector index/query and an anonymous web smoke test. Validate Supabase Auth login and account references separately: a Neon application DB backup does not restore the separate Auth project, and a dump must not be assumed to restore provider secrets or OAuth configuration. Restored queue rows must not replay paid side effects during verification.[1][43][54][57][81]
5. **Measure recovery, do not infer it from backup success.** Record snapshot/target time, last recovered committed data, restore start, verified-serving time, bytes and costs. Proposed targets: daily-dump **RPO ≤24 h**, **RTO ≤60 min at 5 GB**; for native PITR, propose **RPO ≤5 min**, subject to observed WAL/recovery window. These are acceptance goals, not vendor SLAs or results from this research. Keep the output as a private eval/report artifact.[1][34][55]
6. **Simulate cutover without publishing.** With writes paused, run the known-compatible web/worker release against the restored target, inspect the connection switch and reconcile batch IDs. Re-enable one worker only after read and write probes pass. Ensure backups/PITR are enabled on the restored target; Railway does not enable PITR on a restored sibling automatically. Record the actual RPO/RTO and follow-up defects before declaring recovery proven.[43][46][71][81]

### 4. Three configurations, priced line by line

**Calculation assumptions, 2026-09-17:** one developer, one primary, 5 GB DB, 730 compute-hours/month, 60 batches, OpenAI **$40** upper planning estimate, **EUR1 = USD1.20 assumed for budgeting, not a live FX quote**. GNews €49.99 becomes $59.99. Include a conservative **10% tax allowance on the vendor subtotal** and **$2 payment/FX fee allowance**; these are reserves, not a statement of actual tax treatment. Provider subdomain is used; no new domain purchase, paid email, paid telemetry, permanent preview DB or extra seat. All three require Hobby eligibility.[1][3][4][52]

The persistent Railway worker model is average 0.5 GB RAM, 0.02 vCPU and **2 GB outgoing traffic** ($5.50). Web CDN egress is assumed ≤10 GB/month. **Backups run in a separate standard GitHub Actions job, not through the Railway worker**, avoiding an extra Railway upload bill. Assume total private Actions usage ≤2,000 minutes, including ≤600 minutes for CI/backups/drills; public standard runners are free. Copy dumps straight to R2, without retaining large Actions artifacts.[8][23][26][34]

| Monthly USD item | Minimum: managed PITR, more integration | Recommended: Seoul, simpler operations | Comfortable: fixed worker bill, longer independent retention |
|---|---:|---:|---:|
| Vercel Hobby web / CDN within allowance | $0.00 | $0.00 | $0.00 [3][4] |
| Database compute | Neon 0.25 ×730 ×$0.106 = **$19.35** | Supabase Pro Micro **$25.00** | Supabase Pro Micro **$25.00** [56][64] |
| Database 5 GB storage | Neon 5 ×$0.35 = **$1.75** | $0 within 8 GB | $0 within 8 GB [56][64] |
| Native restore history | Neon assumed 5 GB history ×$0.20 = **$1.00**, window seven days | $0, seven daily backups; no PITR | $0, seven daily backups; no PITR [57][64][67] |
| Supabase Auth Kakao/Google | $0 Free project, separate from Neon | Included | Included [1][56] |
| Always-on worker + scheduler | Railway **$5.50** | Railway **$5.50** | Render 512 MB **$7.00** [8][12] |
| Worker network | Included in $5.50 calculation | Included in $5.50 calculation | $0, assumed 2 GB within 5 GB [8][16] |
| R2 fixtures/eval reports + retained dumps | 15 GB total: (15−10) ×$0.015 = **$0.08** | 85 GB: (85−10) ×$0.015 = **$1.13** | 150 GB: (150−10) ×$0.015 = **$2.10** [34] |
| DB backup transfer | Weekly 5 GB dumps ≈20 GB + app traffic, within Neon allowance | Daily dumps ≈150 GB + app/drill traffic <250 GB | Same daily transfer, longer stored retention [56][64] |
| CI / backups / ephemeral rehearsal within stated quotas | $0.00 | $0.00 | $0.00 [23][26] |
| Sentry / sampled Langfuse / external checks | $0.00 | $0.00 | $0.00 [36][37][38][39] |
| **Infrastructure subtotal** | **$27.68** | **$31.63** | **$34.10** |
| GNews Essential monthly, assumed FX | $59.99 | $59.99 | $59.99 [52] |
| OpenAI planning maximum | $40.00 | $40.00 | $40.00 [1] |
| **Vendor subtotal** | **$127.67** | **$131.62** | **$134.09** |
| Tax allowance, 10% | $12.77 | $13.16 | $13.41 |
| Payment/FX fee allowance | $2.00 | $2.00 | $2.00 |
| **Budgeted total / headroom to $150** | **$142.44 / $7.56** | **$146.78 / $3.22** | **$149.50 / $0.50** |

Totals are calculated from the cited rates and explicit assumptions; cent rounding is conservative. With OpenAI $30, each total is approximately $11 lower including the tax reserve. “Minimum $0–30” describes **infrastructure**, not total spend: paid GNews plus models already exceeds $30. Comfortable is deliberately modest: a fixed worker compute bill and more backup history, not HA, Vercel Pro or premium observability.[1][8][12][34][52][56][64]

R2 assumptions do not assume free compression: minimum retains two 5 GB dumps plus 5 GB fixtures/reports; recommended retains fourteen daily dumps plus two pre-migration copies and 5 GB objects; comfortable retains twenty-eight daily dumps plus one pre-migration copy and 5 GB objects. Uploading 150 GB/month from Railway would add roughly **$7.50 egress**, invalidating the recommended budget. Two daily full DB dumps would send about 300 GB/month, exceeding Supabase's included egress even before readers; use the priced daily cadence, measure compression, or explicitly reprice a tighter RPO.[8][34][56]

**Date-check of previous configuration A:** `03-stack.md`'s $57.50 infrastructure example used Vercel Pro20 + Railway12.50 + Supabase25 and excluded licensed news. Keeping that example's assumptions gives **$157.49 before taxes** after GNews at the assumed FX and OpenAI40. It is not a viable $150 total configuration. Even replacing only our recommended Hobby with Pro adds $22 including the reserve and reaches about $168.78. A commercial fallback needs cheaper web hosting and/or a lower model allocation, rather than silent addition of Pro.[2][4][52]

**Hard-cap operating proposal:** reserve already-committed subscriptions, tax/FX and recovery costs first; allocate only the remainder to models and variable infrastructure. At $40/month model allowance, use at most $1.29/day in a 31-day month, including pending request reservations, retries, embeddings and translation. Track month-to-date and forecast costs; stop new paid work before the remaining balance cannot fund it. Railway's hard resource-spend stop takes workloads offline; configure alerts before it. No table can guarantee a global cap when FX, invoices or traffic exceed its assumptions: reprice before purchase, and reduce OpenAI allocation or switch hosting if the forecast exceeds $150.[1][8][10][40][52]

### 5. Scheduling at 05:00 / 17:00 KST

Use **`0 5,17 * * *` with `tz: 'Asia/Seoul'`**, or **`0 20,8 * * *` in UTC**. The 20:00 UTC execution belongs to the following KST calendar day; derive the batch key from the intended KST slot, not the worker's UTC date. These are equivalent schedule calculations for UTC+09:00; persist UTC timestamps and display KST.[1][42]

| Trigger | Time handling | Overlap, missed delivery and failure |
|---|---|---|
| **pg-boss on Railway/Render/Fly/VPS** | Explicit `tz`; scheduler needs an active process and normally checks every 30 s.[42] | Use one scheduler authority and queue `singleton` policy for one active batch. Current upstream documents `missed: 'once'`; this must be checked against the pinned release. Maintain a DB slot ledger/reconciliation on startup even when using it; old/default behavior skips missed occurrences.[42][44] |
| Railway Cron | UTC cron; no extra per-trigger service fee beyond resources.[8][11] | Previous process still alive → skip next run; no automatic termination. Close pools and exit on completion; set a watchdog and reconcile skipped slots.[11] |
| Render Cron | UTC; per-second compute, $1 minimum.[14] | Schedule waits for active run; manual trigger cancels it; 12 h maximum. Queue/state reconciliation is still needed after a failed attempt.[14] |
| Fly / VPS | Resident pg-boss timezone or explicit UTC in OS cron; Fly Cron Manager is separate infrastructure.[19][42] | No cross-platform overlap guarantee: enforce it in the DB. Approximate Fly scheduled Machines are not suitable for exact 05:00/17:00 promises.[19] |
| GitHub Actions | UTC expression above; current docs also support an IANA timezone field.[25] | Use one concurrency group, `cancel-in-progress: false`, plus the DB lock. Delays, drops and disabled schedules mean no exact start SLA. Keep manual dispatch/reconciliation available.[25] |
| Vercel Cron | Pro minute scheduling; Hobby permits only once-daily expressions with up to 59 minutes timing variation.[89] | A single twice-daily expression is not Hobby-compatible. Two separate daily triggers still lack the desired precision and do not supply a long-running worker; use the resident scheduler.[5][89] |
| Supabase Cron | Explicit UTC schedule and a short enqueue/HTTP operation.[28] | Do not hold a database cron transaction while waiting on the entire OpenAI batch. Worker owns retries/overlap; Edge duration limits remain.[27][28] |
| Trigger.dev / Inngest | Trigger supports IANA timezone; explicit UTC cron is portable for either runner.[31][90] | Configure concurrency one and idempotency; native task retry/orchestration must not independently duplicate pg-boss retries. These are alternatives, not additional active schedulers.[30][33][44] |

**Proposed failure contract:** a unique slot record identifies the intended batch; individual stages persist inputs/outputs and idempotency keys. Acquire a DB-backed batch lease/fencing token before work. A queue's singleton policy prevents multiple active queue rows but does not stop a timed-out process still executing remote calls; fence publication and cancel requests when lease ownership is lost. Never hold a DB transaction open across the OpenAI network call.[43][44]

The documented default active-job expiration is **15 minutes**, shorter than this batch. Proposed orchestration expiration is 90 minutes with a shorter application watchdog, bounded stage deadlines and two retries with backoff; use heartbeats when supported by the pinned pg-boss release. A crash after a paid response but before persistence is an uncertain-cost event, not proof that a retry is free. Retry failed stages from stored outputs, route exhausted work to a dead-letter state and let the next reconciliation resume once under the budget.[2][43][44]

**Proposed web state:** keep durable `scheduled_for`, `started_at`, `finished_at`, `heartbeat_at`, `last_successful_publish_at`, `published_revision_id`, `status`, `stop_reason`, `spent`, `reserved` and `next_eligible_at`. Display “last updated” from the committed published Revision, never from cron start or fetch time. Preserve the last good Story when a batch fails or reaches budget; show `budget_reached` separately from failure and stale-data status. Account-specific Follow/Last Seen Revision responses remain private.[1][2][40][43]

### 6. Observability on a budget

Keep the Sentry + Langfuse split already selected in `03-stack.md`; the following are quota/date checks and proposed operational details, not another tool-selection exercise.[2]

| Need | Current allowance and proposed usage |
|---|---|
| Errors / releases | Sentry Developer $0: one user, 5k errors, 5 GB logs, 5M spans, 50 replays, one uptime and one cron monitor. Tag web/worker by immutable release ID; disable unnecessary replay and sample routine traces. Do not assume unlimited errors or export unrestricted article text.[36] |
| LLM evaluation traces | Langfuse Hobby $0: 50k units, 30 days access, two users; Core $29 with 100k units is too large an unplanned addition. Sample successful traces, retain failures within quota and store durable eval reports in R2.[34][37] |
| Outside-in availability | UptimeRobot Free: 50 monitors, five-minute checks. Probe anonymous Story/health responses from outside the hosting provider; use a post-deploy Playwright smoke for login/Claim–Evidence navigation rather than assuming HTTP 200 proves product health.[1][38] |
| Missing batch / backup | Healthchecks.io Free: 20 jobs, 100 log entries/job. Proposed grace window: batch expected at 05:00/17:00 plus 90 minutes; backup check separately. Notify on absent success, not only explicit exceptions.[39] |
| Structured logs | Proposed JSON fields: timestamp, release, run/slot/job IDs, stage, attempt, duration, token counts, reserved/actual USD, result and error class. Redact credentials, account identifiers and restricted Article text; retain safe hashes and IDs. Keep the DB run ledger as durable product state, not host log retention.[1][2][36][37] |

**OpenAI usage API is available.** Organization endpoints include `/v1/organization/usage/completions`, `/usage/embeddings` under the same organization prefix, and `/v1/organization/costs`; results support project/model or cost-line grouping as appropriate. The administrative API requires owner-created administrative credentials. Fetch reconciliation data only in a privileged job, then expose aggregated totals to the admin UI; never ship an Admin key to the web browser.[40][41]

**Proposed dashboard:** today's and month-to-date model spend, outstanding reservations, estimated tax/FX, GNews subscription, hosting forecast, remaining total budget, cost per published Revision and last reconciliation time. Use per-request stored usage for admission control and reconcile it to provider costs; an after-the-fact organization total cannot prevent simultaneous calls from overspending. No organization usage response was measured in this run because an administrative credential was unavailable.[1][40][41]

### 7. Deploy, preview, secrets and rollback

**Proposed GitHub Actions flow, not a workflow implemented by this research:** keep one release identifier across web, worker and migration artifacts. The repository's Node24/pnpm workspace and scripts remain authoritative; M0 first creates that execution basis.[1][7][82][83]

1. **PR checks:** frozen install; existing lint/typecheck/tests/build; disposable matching-major PostgreSQL with the accepted vector patch; apply migrations from an empty DB and a prior-release fixture DB. Add a small read-only web smoke. Preview web uses isolated Demo Stories and credentials; it must never schedule production batches.[1][45][53][78]
2. **Prepare immutable artifacts:** build web and worker from the same revision, with repository-root build context so `packages/*` is included. Use separate provider services, not a web import of the worker process. Retain the preceding worker image/release beyond Railway Hobby's 72-hour removed-image rollback window.[1][7][8][82]
3. **Serialize production deployment:** a single concurrency group/migration owner; inspect the generated SQL, take a verified recovery point, then run Drizzle migrations once with a dedicated credential. Use expand → compatible code → backfill → later contract for destructive changes. Schema auto-migration in every autoscaled app startup is not the proposed release mechanism.[45][46][53]
4. **Roll out:** after an additive migration, deploy the backward-compatible worker paused, then web, perform read/write smoke checks, enable one worker and confirm a bounded fixture job. M0 has no worker to roll out; M2a adds it without moving the web or primary DB. A deploy must not terminate a 60-minute job without persisted checkpoints and SIGTERM handling.[1][43][46]
5. **Preview cost controls:** use local/disposable CI PostgreSQL by default. Supabase branches bill separately and are outside the spend cap; Neon branches still incur compute/storage. Use short-lived, explicitly costed branches only for provider-specific migration rehearsal, delete after evidence capture, and never copy production secrets or unrestricted licensed content into public previews.[1][63][64][53]

#### Bad Drizzle migration: exact rollback order

**A web rollback does not undo PostgreSQL changes.** Drizzle's documented `migrate` applies pending SQL and records migration history; do not assume an automatic inverse migration exists or delete journal rows to simulate rollback. Vercel Instant Rollback changes the served deployment, not the external database. The following is a proposed incident procedure.[45][46][47]

1. **Stop damage first:** disable scheduler/enqueue, pause worker consumption, disable web writes or serve a maintenance/read-only view. Fence any in-flight publication and stop new paid calls. Preserve logs, failed database state, migration journal, source release and timestamps before attempting repair.[43][44][46][54]
2. **Determine what committed:** inspect actual schema and the journal. A transactionally failed migration may have rolled back; multi-step/nontransactional operations can leave partial state. Do not blindly rerun or reverse a migration based only on a failing CI exit code. Compare to the reviewed SQL and rehearsal evidence.[45][46][54]
3. **If schema remains backward compatible:** roll back web **and worker** to the previous immutable release while keeping the additive schema; smoke-test, then apply a reviewed corrective forward migration. Remove obsolete columns only in a later release after compatibility is proven.[45][46][47]
4. **If data was destroyed or old code is incompatible:** keep writes stopped. Prefer a reviewed forward repair that preserves valid data; otherwise restore a fresh isolated DB to the verified pre-change backup/PITR target, following §3. Preserve the failed DB; extract/reconcile valid post-backup writes before cutover if possible. Restoring to yesterday can lose Follow/Last Seen Revision writes as well as Articles.[1][54][55][81]
5. **Restore compatibility before traffic:** verify schema/data/vector and select the matching application release; switch web and worker secrets to the restored DB together, deploy while the worker remains paused, then run anonymous reading, authenticated ownership and a controlled write smoke. Invalidate affected public cache pointers after the data/release cutover.[1][46][48][81]
6. **Resume in order:** reconcile the slot/job ledger and uncertain external calls, enable exactly one worker, then scheduling; verify fresh publication and backup health before clearing maintenance. Re-enable PITR on a restored Railway sibling. Retain the failed DB until recovery is signed off; record measured loss and downtime.[43][44][71]

**Secrets proposal:** separate production/preview and runtime/migration roles. Store scoped deploy tokens and DB/OpenAI/R2 secrets in provider secret stores and GitHub environments; use OIDC where supported. Pin Actions by full SHA, minimize token permissions, and prevent untrusted PR jobs from receiving production credentials. Supabase public project URL/publishable key are different from service-role credentials; privileged keys and the OpenAI administrative credential must never become `NEXT_PUBLIC_*` values.[53][62][41]

### 8. Korean reader latency and caching

| Provider | Verified regional placement relevant to Korea | Consequence |
|---|---|---|
| Vercel | Seoul `icn1`, Tokyo `hnd1`, Singapore `sin1`; default function region is US `iad1` unless changed.[6] | Explicitly colocate web origin with DB; CDN presence alone does not move SQL execution.[6] |
| Supabase | Specific Seoul/Tokyo regions; general APAC placement is not a promise of Seoul.[58] | Recommended Seoul primary and web origin; Railway's Singapore worker is a batch-only cross-region client.[6][9][58] |
| Neon | Singapore/Sydney; no Seoul/Tokyo in current list.[66] | If choosing PITR-first Neon, put the Vercel SQL origin in Singapore and cache public reads near Korean users.[6][66] |
| Fly | Tokyo `nrt`, including MPG; no Seoul in listed regions.[18] | Tokyo worker or app/DB colocation alternative; verify region-specific resource price.[17][18] |
| Railway / Render / Hetzner | Singapore available; Seoul/Tokyo absent from their cited location lists.[9][15][22] | Use batched DB reads/writes rather than many per-Article inter-region round trips; a design recommendation, not a latency measurement.[2] |
| Crunchy Bridge | Official catalog lists AWS/GCP Tokyo, Azure Japan East; no Seoul.[91] | Tokyo placement is verified, but vector 0.8.x and the final regional bill remain selection gates.[76][91][92] |
| Oracle | Always Free allocation depends on home region and capacity.[20] | Do not budget a guaranteed free Seoul/Tokyo instance without an actual allocation.[20] |

**No numeric Seoul latency is claimed.** There was no deployed endpoint/DB to benchmark. Proposed M0 measurement: from a Seoul client, record 30 cold and 100 warm anonymous requests plus a DB query timer; repeat after a new Revision invalidates cache, report p50/p95, cache state and connection/wake-up time separately. At M2a also measure Singapore-worker-to-Seoul SQL round trips and total 150-Article batch duration. These sample counts are a proposed smoke protocol, not statistically established capacity evidence.[1][6][48][58]

**Prefer Node origin rendering + CDN caching, not a new edge rendering architecture.** Reuse `03-stack.md`'s locale/Revision cache-key decision. After atomically publishing a Revision, enqueue authenticated revalidation of the Story and Today views; update the public “latest Revision” pointer while immutable Revision content remains cacheable. Keep Follow and Last Seen Revision private. Next.js supports ISR on Node/Docker; adapters have platform-specific support and multiple self-hosted instances need coordinated caches. An edge runtime does not eliminate latency to a single distant write DB.[1][2][48][51]

## Options & trade-offs

| Choice | What it buys | What it gives up / decision gate |
|---|---|---|
| **Recommended Seoul configuration** | One paid Supabase project for DB/Auth; straightforward Vercel web; established persistent pg-boss worker. Budgeted $146.78 at the stated upper model spend.[1][8][56] | Daily-point recovery, not PITR; narrow $3.22 reserve; actual Seoul vector patch must pass M0 SQL. This is the default if a 24-hour RPO is acceptable.[57][59] |
| **Minimum / PITR-first Neon** | Budgeted $142.44 with seven-day history enabled and a portable weekly dump.[64][67] | Singapore origin and separate Supabase Auth lifecycle/backup. Polling keeps Neon awake; the advertised free/sleeping cost must not be substituted.[1][42][66] |
| **Comfortable within this cap** | Budgeted $149.50: Render's fixed 512 MB worker bill and more external dump retention.[12][34] | Only $0.50 reserve; not a recommendation to spend it before measuring actual invoices. No improvement to daily RPO or DB RAM.[57] |
| Vercel Pro + paid managed DB + worker | Commercial eligibility and paid web controls.[3][4] | The old configuration A is over cap with feeds/models. Reallocate model spend or use a cheaper web container; do not present it as affordable unchanged.[2][52] |
| Railway/Fly/VPS database | Version control and potential colocation; Railway now offers PITR with compatible images.[18][69][71][78] | Operator burden or image/archiver compatibility verification; volume snapshots alone do not prove recovery. Fly MPG's managed floor is already too high for the full envelope.[55][72][87] |

## Recommendation

### Proposals for Claude; no implementation or authority files changed

**M0: select Vercel Hobby `icn1` + Supabase Pro Micro Seoul, PostgreSQL 17.** Confirm non-commercial eligibility and actual invoice assumptions, run the vector/HNSW gate, use separate pooled runtime and migration connections, then deploy the blank page with a successful DB query and recorded first Drizzle migration. Capture a logical backup and restore fixtures to an isolated test DB before marking recovery capability demonstrated. M0 itself does not require paying for an idle worker; preserve the full M2a budget reservation.[1][3][6][46][56][58][62]

**M2a: add one persistent Railway Singapore worker with pg-boss scheduling; keep web and DB in place.** Disable service sleeping, configure KST schedule, explicit active-job expiry, bounded pools, idempotent stages, startup reconciliation and the budget state. Start from the $5.50 usage model and measure peak RAM, CPU and 150-Article runtime; upgrade only after repricing the whole $150 envelope. Put the nightly dump on GitHub Actions to avoid Railway backup-upload egress.[8][9][23][26][42][43]

**Recovery choice must be explicit:** the recommended configuration accepts daily recovery points. If the product owner requires genuine PITR or cannot accept losing up to a day of account state, choose **Neon Launch Singapore at M0**, keep Supabase Auth, and set seven-day restore history; do not wait until M2a to discover this requirement. Neither `pg_dump` nor a successful provider snapshot is proof of a passed recovery drill.[1][54][55][64][67]

Adopt the ordered rollback procedure in Findings §7 and record recovery timings/costs as project evidence. Keep Sentry/Langfuse on their free tiers, external checks active, and Revision-aware CDN caching unchanged from the stack research. These are research proposals for the implementation owner, not claims that this repository or a provider account is configured.[1][2][36][37][48]

## Open questions for the interview

1. Which recovery requirement should govern the initial DB purchase: **daily recovery points (recommended Seoul option)**, **≤5-minute target with managed PITR in Singapore**, or **a higher budget for Seoul PITR**?[55][57][64][67]
2. Which describes the public portfolio's intended use: **personal non-commercial demonstration**, **advertising/selling services or monetized product**, or **ambiguous use requiring a Vercel policy determination**?[3]
3. When actual taxes/FX/usage threaten $150, which should give way first: **reduce model/translation volume**, **freeze live ingestion and retain the last good Revision**, or **choose cheaper web/DB operations with more maintenance**?[1][8][40][52]
4. What freshness promise should users see: **05:00/17:00 batch start with a completion window**, **06:30/18:30 target publication after a 90-minute allowance**, or **best-effort twice daily with explicit stale/budget state**?[1][25][42][43]
5. For account-data recovery, what loss is acceptable: **up to 24 hours**, **at most one batch interval with repriced backups**, or **minute-scale PITR plus separate Auth recovery coverage**?[1][54][55][57]

## Sources

All sources accessed **2026-09-17**. Local documents are repository authorities, not independent vendor evidence. Live pages were preferred over stale search excerpts; Render's compute price was additionally visible in its official indexed pricing table. Neon pages were retrieved as Markdown when the browser parser rejected their content type. Source/build evidence does not establish a selected tenant's installed version.

1. Project brief and authorities — [brief](briefs/06-infra-hosting.md), [project](../agents/project.md), [glossary](../../CONTEXT.md), [agent role](../../AGENTS.md) — accessed 2026-09-17.
2. Prior stack research, especially §§4–5, 9–10 — [03-stack.md](03-stack.md) — dated 2026-09-15; accessed 2026-09-17.
3. Vercel fair-use guidelines — https://vercel.com/docs/limits/fair-use-guidelines — updated 2026-07-29; accessed 2026-09-17.
4. Vercel pricing — https://vercel.com/pricing — accessed 2026-09-17.
5. Vercel function limits — https://vercel.com/docs/functions/limitations — updated 2026-08-24; accessed 2026-09-17.
6. Vercel regions — https://vercel.com/docs/regions — accessed 2026-09-17.
7. Vercel monorepos — https://vercel.com/docs/monorepos — accessed 2026-09-17.
8. Railway plans, resource rates, volume limits and image retention — https://docs.railway.com/pricing/plans — accessed 2026-09-17.
9. Railway regions — https://docs.railway.com/deployments/regions — accessed 2026-09-17.
10. Railway cost control — https://docs.railway.com/pricing/cost-control — accessed 2026-09-17.
11. Railway cron jobs — https://docs.railway.com/cron-jobs — accessed 2026-09-17.
12. Render pricing — https://render.com/pricing — accessed 2026-09-17.
13. Render background workers — https://render.com/docs/background-workers — accessed 2026-09-17.
14. Render cron jobs — https://render.com/docs/cronjobs — accessed 2026-09-17.
15. Render regions — https://render.com/docs/regions — accessed 2026-09-17.
16. Render pricing change — https://render.com/blog/better-pricing-for-fast-growing-teams — fully rolled out 2026-08-01; accessed 2026-09-17.
17. Fly resource pricing — https://fly.io/docs/about/pricing/ — region selector unresolved for the sample Machine rate; accessed 2026-09-17.
18. Fly regions and MPG availability — https://fly.io/docs/reference/regions/ — accessed 2026-09-17.
19. Fly task scheduling — https://fly.io/docs/blueprints/task-scheduling/ — accessed 2026-09-17.
20. Oracle Always Free resources — https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm — accessed 2026-09-17.
21. Hetzner price adjustment — https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/ — effective 2026-06-15; accessed 2026-09-17.
22. Hetzner Singapore — https://www.hetzner.com/cloud-singapore/ — accessed 2026-09-17.
23. GitHub Actions billing — https://docs.github.com/en/billing/concepts/product-billing/github-actions — accessed 2026-09-17.
24. GitHub Actions limits — https://docs.github.com/en/actions/reference/limits — accessed 2026-09-17.
25. GitHub scheduled workflow behavior — https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule — accessed 2026-09-17.
26. GitHub hosted runner sizes and slim timeout — https://docs.github.com/en/actions/reference/runners/github-hosted-runners — accessed 2026-09-17.
27. Supabase Edge limits — https://supabase.com/docs/guides/functions/limits — accessed 2026-09-17.
28. Supabase Cron — https://supabase.com/docs/guides/cron — accessed 2026-09-17.
29. Trigger.dev pricing — https://trigger.dev/pricing — accessed 2026-09-17.
30. Trigger.dev task duration and concurrency — https://trigger.dev/docs/tasks/overview — accessed 2026-09-17.
31. Trigger.dev scheduled tasks — https://trigger.dev/docs/tasks/scheduled — accessed 2026-09-17.
32. Inngest pricing and execution accounting — https://www.inngest.com/pricing — accessed 2026-09-17.
33. Inngest platform/step limits — https://www.inngest.com/docs/usage-limits/inngest — accessed 2026-09-17.
34. R2 pricing — https://developers.cloudflare.com/r2/pricing/ — updated 2026-08-07; accessed 2026-09-17.
35. R2 limits — https://developers.cloudflare.com/r2/platform/limits/ — accessed 2026-09-17.
36. Sentry pricing — https://sentry.io/pricing/ — accessed 2026-09-17.
37. Langfuse pricing — https://langfuse.com/pricing — accessed 2026-09-17.
38. UptimeRobot Free features — https://help.uptimerobot.com/en/articles/11604710-who-should-use-uptimerobot-s-free-plan — accessed 2026-09-17.
39. Healthchecks pricing — https://healthchecks.io/pricing/ — accessed 2026-09-17.
40. OpenAI organization Usage/Costs API — https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage — accessed 2026-09-17.
41. OpenAI Admin API keys — https://platform.openai.com/docs/api-reference/admin-api-keys — accessed 2026-09-17.
42. pg-boss scheduling — https://raw.githubusercontent.com/timgit/pg-boss/master/docs/api/scheduling.md — current upstream, verify against installed release; accessed 2026-09-17.
43. pg-boss jobs, expiry and retries — https://github.com/timgit/pg-boss/blob/master/docs/api/jobs.md — accessed 2026-09-17.
44. pg-boss queue policies and heartbeats — https://raw.githubusercontent.com/timgit/pg-boss/master/docs/api/queues.md — accessed 2026-09-17.
45. Drizzle Kit overview — https://orm.drizzle.team/docs/kit-overview — accessed 2026-09-17.
46. Drizzle migrate — https://orm.drizzle.team/docs/drizzle-kit-migrate — accessed 2026-09-17.
47. Vercel Instant Rollback — https://vercel.com/docs/instant-rollback — accessed 2026-09-17.
48. Next.js ISR — https://nextjs.org/docs/app/guides/incremental-static-regeneration — accessed 2026-09-17.
49. Cloudflare Workers pricing — https://developers.cloudflare.com/workers/platform/pricing/ — accessed 2026-09-17.
50. Cloudflare Workers limits — https://developers.cloudflare.com/workers/platform/limits/ — accessed 2026-09-17.
51. Cloudflare Next.js/OpenNext deployment — https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/ — accessed 2026-09-17.
52. GNews monthly Essential pricing — https://gnews.io/pricing — accessed 2026-09-17.
53. GitHub Actions secure use — https://docs.github.com/en/actions/reference/security/secure-use — accessed 2026-09-17.
54. PostgreSQL SQL dumps — https://www.postgresql.org/docs/current/backup-dump.html — accessed 2026-09-17.
55. PostgreSQL continuous archiving/PITR — https://www.postgresql.org/docs/current/continuous-archiving.html — accessed 2026-09-17.
56. Supabase pricing — https://supabase.com/pricing — accessed 2026-09-17.
57. Supabase backups/PITR — https://supabase.com/docs/guides/platform/backups — accessed 2026-09-17.
58. Supabase regions — https://supabase.com/docs/guides/platform/regions — accessed 2026-09-17.
59. Supabase extension build manifest — https://raw.githubusercontent.com/supabase/postgres/develop/nix/ext/versions.json — build evidence, not regional deployment verification; accessed 2026-09-17.
60. Supabase extension pinning change — https://supabase.com/changelog/extension-version-pinning-ignored — announced 2026-07-22, effective 2026-08-05; accessed 2026-09-17.
61. Supabase compute and connections — https://supabase.com/docs/guides/platform/compute-and-disk ; https://supabase.com/docs/guides/platform/manage-your-usage/compute — accessed 2026-09-17.
62. Supabase PostgreSQL connection modes — https://supabase.com/docs/guides/database/connecting-to-postgres — accessed 2026-09-17.
63. Supabase branch billing — https://supabase.com/docs/guides/platform/manage-your-usage/branching — accessed 2026-09-17.
64. Neon pricing — https://neon.com/pricing — accessed 2026-09-17.
65. Neon extension version matrix — https://neon.com/docs/extensions/pg-extensions — accessed 2026-09-17.
66. Neon regions — https://neon.com/docs/introduction/regions — accessed 2026-09-17.
67. Neon project settings/restore window — https://neon.com/docs/manage/projects — accessed 2026-09-17.
68. Neon connection pooling — https://neon.com/docs/connect/connection-pooling — accessed 2026-09-17.
69. Railway PostgreSQL service ownership — https://docs.railway.com/databases/postgresql — accessed 2026-09-17.
70. Railway pgvector marketplace image — https://railway.com/deploy/pgvector--pgvector-railway — template evidence, not a provider-managed extension guarantee; accessed 2026-09-17.
71. Railway PITR requirements and restore — https://docs.railway.com/volumes/point-in-time-recovery — accessed 2026-09-17.
72. Fly Managed Postgres pricing/recovery — https://fly.io/docs/mpg/ ; https://fly.io/mpg/ — accessed 2026-09-17.
73. Fly MPG create/version/storage defaults — https://www.fly.io/docs/flyctl/mpg-create/ — accessed 2026-09-17.
74. Fly MPG extensions — https://fly.io/docs/mpg/extensions/ — accessed 2026-09-17.
75. Crunchy Bridge plans and region-qualified prices — https://docs.crunchybridge.com/concepts/plans-pricing — accessed 2026-09-17.
76. Crunchy Bridge vector — https://docs.crunchybridge.com/extensions-and-languages/vector — accessed 2026-09-17.
77. Crunchy Bridge backups — https://docs.crunchybridge.com/concepts/backups — accessed 2026-09-17.
78. Upstream pgvector versions, images and HNSW — https://github.com/pgvector/pgvector — accessed 2026-09-17.
79. Supabase hosted pgvector availability discussion — https://github.com/orgs/supabase/discussions/34760 — accepted answer 2025-04-05; accessed 2026-09-17; historical hosted evidence, not current tenant verification.
80. PostgreSQL pg_dump reference — https://www.postgresql.org/docs/current/app-pgdump.html — accessed 2026-09-17.
81. PostgreSQL pg_restore reference — https://www.postgresql.org/docs/current/app-pgrestore.html — accessed 2026-09-17.
82. Railway shared monorepos — https://docs.railway.com/deployments/monorepo — accessed 2026-09-17.
83. Vercel supported Node versions — https://vercel.com/docs/functions/runtimes/node-js/node-js-versions — accessed 2026-09-17.
84. Render Free limits — https://render.com/docs/free — accessed 2026-09-17.
85. Supabase HNSW — https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes — accessed 2026-09-17.
86. Fly MPG pooling configuration — https://fly.io/docs/mpg/cluster-configuration/ — accessed 2026-09-17.
87. Fly unmanaged DB/volume recovery responsibilities — https://www.fly.io/docs/apps/app-availability/ — accessed 2026-09-17.
88. pgvector changelog — https://github.com/pgvector/pgvector/blob/master/CHANGELOG.md — accessed 2026-09-17.
89. Vercel cron limits — https://vercel.com/docs/cron-jobs/usage-and-pricing — updated 2026-07-15; accessed 2026-09-17.
90. Inngest cron functions — https://www.inngest.com/docs/guides/scheduled-functions — accessed 2026-09-17.
91. Crunchy Bridge live provider/region catalog — https://api.crunchybridge.com/providers — unauthenticated read-only API; accessed 2026-09-17.
92. Crunchy Bridge changelog — https://docs.crunchybridge.com/changelog — accessed 2026-09-17; absence of a 0.8 entry is not proof that clusters run 0.7.
93. Fly free-trial limits — https://fly.io/docs/about/free-trial/ — accessed 2026-09-17.
94. Vercel Git organization integration restriction — https://vercel.com/docs/limits#connecting-a-project-to-a-git-repository — accessed 2026-09-17.
