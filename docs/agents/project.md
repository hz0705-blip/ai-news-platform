# 프로젝트

ai-news-platform. 두 에이전트가 공유하는 **사실**(환경·계정·명령·경로·함정). 규칙은 `CLAUDE.md`(Claude)와 `AGENTS.md`(Codex)에 있다. 짧게 유지한다.

## 정본

- 결정과 범위, 마일스톤: `docs/spec/v1.md`. 여기에 없는 것은 구현하지 않고 티켓 코멘트로 묻는다.
- 용어: `CONTEXT.md`. 산출물(이슈·PR·테스트 이름)에서 피하라고 한 동의어를 쓰지 않는다.
- 되돌리기 어려운 결정: `docs/adr/`. 제품 결정 0001~0006·0008·0009, 에이전트 사이클 0007.

## 이슈·라벨

- GitHub Issues를 `gh`로 쓴다. 이슈 본문이 곧 브리프다.
- 라벨 다섯: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. 부가 라벨 `research`(Codex 리서치), `ui`(화면 티켓, 아래 "UI 스킬").
- 차단은 GitHub 네이티브 이슈 의존성이 정본: `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<차단 이슈의 데이터베이스 id>`(id는 `gh api repos/<owner>/<repo>/issues/<n> --jq .id`).
- 외부 PR은 분류 대상이 아니다.

## 도메인 규칙

- 산출물(이슈 제목, PR, 테스트 이름, 코드 식별자)의 도메인 개념은 `CONTEXT.md` 용어를 쓴다. 필요한 개념이 용어집에 없으면 Claude는 `CONTEXT.md`에 추가해 쓰고(`CLAUDE.md` "Ruling"), Codex는 만들어 쓰지 말고 티켓 코멘트로 묻는다.
- 산출물이 ADR과 충돌하면 조용히 덮어쓰지 않고 "ADR-000N과 충돌한다. 이유는 …"으로 드러낸다.
- 공개 저장소에는 실제 기사 문장을 커밋하지 않는다. 실제 응답을 기록하는 픽스처 스크립트(`packages/pipeline/scripts/record-gnews.ts`·`record-gnews-recheck.ts`·`record-gdelt.ts`)는 본문·제목·설명·URL·매체를 그대로 저장하므로, 그 결과는 직접 쓴 가상 텍스트로 바꾼 뒤에만 커밋한다(`packages/pipeline/fixtures/LICENSE.md`).
- 기사 본문은 30일 뒤 삭제한다(`article_versions.body_expires_at`, 기사 발행 시각 기준·불명이면 수집 시각). 삭제 대상은 본문(`body`, null로 지운다 — 0016)이며, 근거(`evidence`)가 기사 버전을 FK로 참조하므로 행과 근거 구간·해시·URL·메타데이터는 남는다. 본문을 지운 기사 버전은 재수집·근거 추출·좌표 정렬 입력이 아니고, 그 기사는 재처리에서 출처 구획으로만 간다. 그 기사에만 근거가 있던 최신 개정판 주장은 새 개정판에 그대로 옮겨 싣는다(`carriedClaims`).
- `public` 스키마의 새 테이블은 같은 마이그레이션에서 RLS를 켠다(Drizzle 스키마 `.enableRLS()`, 정책 없음). `anon`·`authenticated`는 `public`의 테이블·시퀀스·함수에 권한이 없다 — 0013이 회수하고 `postgres`의 기본 권한도 회수했다(Supabase에만 있는 역할이라 없으면 건너뛴다). `packages/db/src/public-rls.test.ts`가 `public`의 모든 테이블을 질의해 RLS 꺼진 테이블을 잡는다. `supabase_admin` 소유 pgvector 함수의 anon 실행 권한과 그 역할의 기본 권한은 `postgres`가 바꿀 수 없어 남는다.

## 스택

- TypeScript 단일 런타임: Next.js + React, PostgreSQL + pgvector, Drizzle, pg-boss. Python·학습 없음. 모델은 OpenAI만. 근거는 ADR-0005, 구조 세부는 스펙 "시스템 구조".
- pnpm 워크스페이스, Node 24 LTS, Turborepo 없음. 패키지 다섯: `apps/web`, `apps/worker`, `packages/domain`(순수 TS, 의존성 0), `packages/db`(Drizzle 스키마·마이그레이션), `packages/pipeline`(OpenAI 호출·게이트·평가). 웹·워커는 도메인·DB·파이프라인을 import하고 서로는 import하지 않는다.
- 패키지 스코프는 임시로 `@newsplatform/*`. 서비스 이름 확정(M4 전) 시 일괄 변경.
- 경계마다 zod 스키마를 두고, 도메인 타입과 같은 모양이어야 하는 곳은 `z.ZodType<도메인타입>`으로 주석한다.

## 운영 환경

계정·자격은 사용자가 만들고 Claude가 확인해 적는다. 값은 적지 않는다.

- **Supabase**: 조직 Pro, 프로젝트 `ai-news-platform`(ref `dhmwspzugsxrahzkggxx`), 서울 `ap-northeast-2`, PostgreSQL 17, Micro, 일일 백업 7일, pgvector 0.8.x. 직접 연결 호스트는 IPv6 전용이라 IPv4 환경(개발 Mac, GitHub 러너)에서 쓸 수 없다. 풀러 호스트 `aws-0-ap-northeast-2.pooler.supabase.com`(사용자 `postgres.dhmwspzugsxrahzkggxx`)의 세션 모드 5432를 마이그레이션·백업에, 트랜잭션 모드 6543을 런타임에 쓴다. DB 비밀번호는 비밀번호 관리자에 없다. 재설정하면 아래 시크릿과 로컬 `.env`를 함께 갱신한다.
- **GitHub Actions `backup`**(야간 덤프·암호화·검증): 환경 `Production`(보호 규칙 없음). 환경 시크릿 `DATABASE_MIGRATION_URL`(세션 풀러 5432)·`BACKUP_ENCRYPTION_KEY`(`openssl rand -hex 32`). 저장소 시크릿은 쓰지 않는다. 시크릿은 다시 읽을 수 없으므로 키의 정본은 비밀번호 관리자 항목 "ai-news-platform BACKUP_ENCRYPTION_KEY"이고, 키를 교체하면 이전 키로 만든 아티팩트(보관 90일)가 만료될 때까지 이전 키를 함께 보관한다. 절차·함정의 정본은 YAML 머리 주석. 로컬 복구: 복원하기 **전에** 지금 DB에서 삭제 기록·대기 행을 뜬다(`ACCOUNT_DELETIONS_FILE=<절대경로> pnpm --filter @newsplatform/worker accounts:export-deletions`, 복원된 DB에는 백업 시점 뒤의 기록이 없다) → `gh run download <run id>` → `packages/db`에서 `node --env-file-if-exists=../../.env scripts/backup-decrypt.ts --in <절대경로>.enc --out <절대경로>`(pnpm 12의 `pnpm … -- --in`은 인자를 버린다) → 격리 DB(`docker run pgvector/pgvector:pg17`)에 `create extension vector`(덤프는 확장을 담지 않고 `public.vector`를 참조) → `pg_restore --no-owner --no-privileges`(덤프의 소유자·ACL 역할이 격리 DB에 없으므로 복원에서 버린다). 덤프의 `CREATE SCHEMA public` 한 줄이 빈 DB에서도 실패하므로 `--exit-on-error` 없이 "errors ignored on restore: 1"만 허용한다. 복원된 DB에는 워커·스케줄을 붙이지 않는다. 복원한 뒤 서비스를 열기 전에 그 DB를 `DATABASE_MIGRATION_URL`로 두고 같은 파일로 `ACCOUNT_DELETIONS_FILE=<절대경로> pnpm --filter @newsplatform/worker accounts:replay-deletions`를 돌려 삭제를 다시 적용한 뒤 파일을 지운다(복원 전 내보내기 → 복원 뒤 적용. Supabase 백업 복원도 같다).
- **GitHub Actions `ci`**(PR 체크, main push): 시크릿·환경을 읽지 않는다. 절차·함정의 정본은 YAML 머리 주석.
- **Vercel**: 팀 `hz`(슬러그 `hz23`) Hobby, 프로젝트 `ai-news-platform`, Root Directory `apps/web`, Node 24, 리전 `icn1`. 환경변수 `DATABASE_URL`·`REVALIDATE_SECRET`(Production만, 워커의 값과 같다)·`NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`·`SUPABASE_SECRET_KEY`·`KAKAO_ADMIN_KEY`·`KAKAO_REST_API_KEY`·`KAKAO_CLIENT_SECRET`(Production만, 아래 Supabase Auth·계정 삭제 줄)·`OPENAI_API_KEY`·`ANON_REQUEST_SECRET`(Production만, 아래 검색 줄)·`CONTACT_EMAIL`(Production만, 소개의 정정·삭제 요청 메일. 소개는 정적이라 빌드 때 들어가고 비우면 "연락처 준비 중". 모든 변수는 바꾸면 프로덕션 재배포 `vercel redeploy https://ai-news-platform-six.vercel.app --scope hz23`가 있어야 반영된다). 자동 도메인 `ai-news-platform-six.vercel.app`. `main` 푸시마다 자동 배포. PR 프리뷰는 자격 없이 빌드되고 Deployment Protection이 켜져 있어 익명 요청은 302로 SSO에 간다(자동 검사가 프리뷰를 열려면 우회 토큰 필요).
- **Railway**: 워크스페이스 `hz0705-blip's Projects`(Free 플랜, 월 크레딧 $1 — 요금제·월말 정지 허용은 스펙 "개발 중 결정 항목" 토큰 계량 줄, 사용량 `railway usage`·`railway metrics --service worker`), 프로젝트 `ai-news-platform`, 환경 `production`, 서비스 `worker` 하나(웹은 Vercel). 리전 싱가포르 `asia-southeast1-eqsg3a`, 복제 1, 슬립 끔, Railpack 빌더, 시작 명령 `node apps/worker/src/index.ts`(저장소 루트, pnpm 래퍼를 거치면 SIGTERM 종료가 `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`로 CRASHED가 된다), 소스는 GitHub `main` 자동 배포(watch 경로: `apps/worker`·`packages`·루트 매니페스트·`.railway`). 설정의 정본은 `.railway/railway.ts`(IaC, 루트 devDependency `railway`): 바꾸면 `railway config plan` → `railway config apply` → `railway config plan --detailed-exit-code`가 0(차이 없음)이어야 한다. 2면 파일과 실제가 어긋난 것이다. Railway는 기본값과 같은 필드(재시작 실패 시 10회, 슬립 끔)와 `deploy.region`(리전은 `replicas`)을 저장하지 않으므로 파일에 적지 않는다. `railway.json`은 폐기 예정이라 쓰지 않는다. 변수 `WORKER_DATABASE_URL`(세션 풀러 5432)·`OPENAI_API_KEY`·`GNEWS_API_KEY`·`WEB_REVALIDATE_URL`·`REVALIDATE_SECRET`·`KAKAO_ADMIN_KEY`(계정 삭제 줄), 값은 `railway variable set <이름> --stdin --service worker`로 넣고 파일에는 `preserve()`만 둔다. CLI는 `railway link -p <프로젝트 id> -e production` 뒤 `railway logs --service worker`·`railway deployment list`. 워커는 시작 시 24시간 안의 누락 슬롯을 즉시 회복하므로 재배포 직후 배치가 돌 수 있다.
- **Supabase Auth(웹)**: `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`(빌드 때 들어간다 — 바꾸면 재빌드), `SUPABASE_SECRET_KEY`(서버 전용). 비어 있으면 공개 화면은 그대로이고 로그인만 "지금은 로그인할 수 없습니다"가 된다. 세션 갱신 `apps/web/proxy.ts`는 인증·개인 경로 `/auth/*`·`/follows`·`/account/*`에만 매칭한다(공개 응답에 `Set-Cookie`가 없다). 로그인 시작 `/auth/login/start?provider=kakao|google&next=`, Google 콜백 `/auth/callback`(Supabase 허용 목록에는 질의 없이 이 경로, 돌아갈 주소는 쿠키 `auth-return-path`), Kakao 콜백 `/auth/callback/kakao`(앱 직접 OIDC → `signInWithIdToken`, `apps/web/lib/auth/kakao.ts`; Kakao Redirect URI에 이 경로, 쿠키 `kakao-oidc-state`·`kakao-oidc-nonce` 경로 `/auth` 10분; 변수 `KAKAO_REST_API_KEY`·`KAKAO_CLIENT_SECRET` 서버 전용, 비면 Kakao 로그인만 "지금은 로그인할 수 없습니다", REST API 키는 Supabase Kakao 제공자 Client ID와 같아야 한다 — `id_token` `aud`), 로그아웃 `POST /auth/logout`, 로그인 화면 `/auth/login?next=`, 요청 시점 상태 `GET /auth/session`. 사건 페이지 개인 영역은 공개 캐시 HTML 뒤에서 `POST /api/me/story-visit`(마지막으로 본 개정판 갱신·팔로우 상태)·`POST /api/me/story-follow`를 부른다(같은 출처 `Origin`만, `private, no-store`). 팔로우 화면 `/follows`와 계정 화면 `/account`(팔로우 화면 머리에서 링크)는 요청 시점 렌더링이다.
- **인증 제공자 콘솔**: Kakao Developers 앱 "Newstrail"(앱 ID 1591923, 이름·아이콘은 서비스 이름 확정 전 임시) — 개인 개발자 비즈 앱, 동의 항목 닉네임 필수·이메일 선택·프로필 사진 사용 안 함, OpenID Connect 켬, Redirect URI `https://ai-news-platform-six.vercel.app/auth/callback/kakao`. Google Cloud 프로젝트 "newstrail", OAuth 웹 클라이언트 "newstrail-web", 게시 상태 "테스트 중"(개인정보처리방침 URL·소유 도메인이 없어 게시할 수 없다 — 테스트 사용자로 등록된 계정만 로그인된다, 게시는 M5 처리방침·도메인 티켓). Supabase Auth(프로덕션 프로젝트): 제공자 Kakao·Google 켬, Email 끔, Kakao "Allow users without an email" 켬, Site URL `https://ai-news-platform-six.vercel.app`, Redirect URLs `https://ai-news-platform-six.vercel.app/auth/callback`. 실제 요청 scope는 Kakao `openid,profile_nickname,account_email`(`KAKAO_SCOPE`), Google `email profile`.
- **계정 데이터 테이블**(`story_follows`·`topic_follows`·`last_seen_revisions`): `user_id → auth.users(id) ON DELETE CASCADE`는 마이그레이션 0011이 `auth.users`가 있는 DB(프로덕션 Supabase)에만 건다. 테스트·CI·E2E의 앱 DB(pgvector 컨테이너)에는 auth 스키마가 없어 FK가 없고, 로컬 Supabase Auth가 만든 E2E 사용자 ID도 그대로 들어간다 — 그 DB에서는 사용자 삭제가 행을 지우지 않는다. 연쇄 삭제는 `packages/db/src/follows.test.ts`가 트랜잭션 안의 임시 `auth.users`로 0011을 돌려 검증한다. 세 테이블은 RLS를 켜고 정책을 두지 않아 Supabase Data API(anon·authenticated)로는 닿지 않는다. 앱 연결(런타임·마이그레이션 모두 테이블 소유자 `postgres.<ref>`)은 RLS를 거치지 않으므로, 런타임을 소유자가 아닌 역할로 바꾸면 정책이 먼저 있어야 한다.
- **계정 삭제**(#106): 계정 화면 `POST /account/delete`(확인 필드 하나만 받는다) → Kakao·Google 계정은 그 제공자로 재로그인(Google `access_type=offline`·`prompt=consent`로 해제용 토큰, Kakao `prompt=login`) → `/auth/callback`(Kakao는 `/auth/callback/kakao`)이 서명한 의도 쿠키(`account-deletion-intent`, 경로 `/auth`, 10분, `SUPABASE_SECRET_KEY`로 HMAC)의 사용자와 같을 때만 삭제 → 결과 화면 `/account/deleted`(멱등 키 쿠키 `account-deletion-key`로 대기 행을 보고 처리 중·완료). 제공자 연결이 없는 사용자(로컬·E2E 이메일)는 JWT `amr` 인증 시각이 10분 안일 때만 바로 삭제한다. 운영 기록 표 `account_deletion_pending`(삭제 대기 행, PK 제공자 × 제공자 ID)·`account_deletions`(삭제 기록, 인증 사용자 ID·삭제 시각)는 RLS 켜고 정책 없음. 삭제 트랜잭션이 계정 데이터 세 테이블을 직접 지우므로 FK가 없는 앱 DB(테스트·E2E)에서도 결과가 같다. 워커는 pg-boss 큐 `account-unlink`(매분, `exclusive`)로 다음 시도 시각이 된 대기 행을 재시도하고(1분·5분·30분, 이후 매시), 같은 잡에서 90일 지난 삭제 기록을 지운다. 72시간이 지난 대기 행은 잡 로그 `stage: "account-unlink"`의 `result: "warning"`·`overdue`. 변수: 웹 `SUPABASE_SECRET_KEY`·`KAKAO_ADMIN_KEY`(Kakao 계정 삭제에 필요, 없으면 "지금은 삭제할 수 없음"), 워커 `KAKAO_ADMIN_KEY`(없으면 Kakao 행이 `kakao-admin-key-missing`으로 남는다). 대기 행이 있는 제공자 ID로 로그인하면 콜백이 세션을 끝내고 `/auth/login?error=pending-deletion`으로 보낸다.
- **검색**(#125): 실행 경로 `POST /api/search`(본문 `{ query }`, 같은 출처 `Origin`만, `private, no-store`, 요청·응답 모양 `apps/web/lib/search/api.ts`). 좁은 인터페이스 `createStorySearch`(`apps/web/lib/search/search.ts`) → DB `searchStoriesByEmbedding`(`packages/db/src/search.ts`), 질의 임베딩은 `@newsplatform/pipeline/embedding` 서브패스(패키지 루트는 픽스처 경로를 읽어 웹 번들에서 쓰지 않는다). 남용 방지는 `apps/web/lib/search/guard.ts`(쿠키 `__Host-anon-id`는 이 경로 응답에서만 발급 — 공개 캐시 응답에는 `Set-Cookie`가 없고 `proxy.ts` 매칭 범위도 그대로다, IP는 `x-vercel-forwarded-for`만) + `packages/db/src/request-limits.ts`(표 `request_counters`·`request_leases`·`request_budgets`, 0015, RLS 켜고 정책 없음). 변수 웹 `ANON_REQUEST_SECRET`·`OPENAI_API_KEY`(둘 중 하나라도 없으면 503). 워커 pg-boss 큐 `request-counter-purge`(매시 7분, `exclusive`)가 창이 끝난 카운터를 지운다. 숫자·Ruling은 스펙 "개발 중 결정 항목" 익명 요청 한도 숫자·토큰 계량 줄.
- **로컬**: `.env.example`이 변수 이름을 정의한다. `pnpm db:migrate`·`pnpm db:gate`·`demo:load`는 `.env`의 `DATABASE_MIGRATION_URL`만 읽는다. `pnpm test:db`는 `.env`를 읽지 않는다.

## 명령어

- 설치: `pnpm install --frozen-lockfile`. npm·yarn은 쓰지 않는다. pnpm 12는 의존성 빌드 스크립트를 승인 없이 막는다(`ERR_PNPM_IGNORED_BUILDS`) — `pnpm approve-builds`로 승인하고 `pnpm-workspace.yaml`의 `allowBuilds`를 커밋한다.
- 개발 서버 `pnpm dev`. 린트·포맷 `pnpm lint`, `pnpm format`(Biome). 타입 `pnpm typecheck`.
- 테스트 `pnpm test`(Vitest). 패키지 하나는 `pnpm test --project <domain|db|pipeline|worker|web>`(**`--`를 넣으면 pnpm 12가 필터를 버리고 전체가 돈다**). E2E `pnpm --filter @newsplatform/web test:e2e`(Playwright).
- 실 DB 테스트 `pnpm test:db`(`scripts/test-db`, docker 필요) — 로컬 컨테이너 `newsplatform-test-db`(CI와 같은 `pgvector/pgvector:0.8.6-pg17` image@digest, `127.0.0.1:54329`)를 없으면 만들고 있으면 시작해 마이그레이션을 적용한 뒤 `db`·`worker` 프로젝트만 돈다(파일들이 advisory lock으로 직렬화되므로 두 프로젝트의 `testTimeout`은 60초). 테스트는 `DATABASE_TEST_URL`만 읽고(없으면 skip) 그 DB를 truncate한다. 연결된 워크트리에서는 DB 이름이 `newsplatform_test_<워크트리 이름>`이다("사이클 값" 워크트리). 호스트가 `localhost`·`127.0.0.1`이 아니거나 `supabase`를 담은 URL은 비우기 전에 거부한다. 컨테이너를 지우려면 `docker rm -f newsplatform-test-db`.
- 마이그레이션 `pnpm db:migrate`, pgvector 게이트 `pnpm db:gate`.
- 로컬 Supabase(Auth 전용, docker 필요): `pnpm exec supabase start`(루트 devDependency로 버전 고정, 설정 `supabase/config.toml` — 이메일·비밀번호만, Kakao·Google 끔, API `127.0.0.1:54321`, 스택 DB `54322`), 중지 `pnpm exec supabase stop`. 앱 데이터는 이 스택이 아니라 pgvector 컨테이너에 둔다. 웹·E2E 환경변수는 `pnpm exec supabase status -o env --override-name api.url=NEXT_PUBLIC_SUPABASE_URL --override-name auth.publishable_key=NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY --override-name auth.secret_key=SUPABASE_SECRET_KEY`의 세 줄을 내보낸 뒤 웹을 빌드한다. E2E `auth.spec.ts`는 이 값이 없으면 로컬에서 skip, CI에서 실패한다. 로컬 E2E의 사건 데이터는 `DATABASE_URL`(프로덕션 `.env` 대신 `pnpm test:db` 컨테이너 `postgresql://test:test@127.0.0.1:54329/newsplatform_test`에 `db:migrate`·`demo:load`를 적용해 쓸 수 있다).
- 출처 표: `pnpm --filter @newsplatform/worker sources:sync`(`packages/db/sources/sources.json` → `sources` upsert + 옛 `gnews:*` 기사 재지정 + 옛 `gnews:*`에 남은 근거의 출처 식별자를 기사의 현재 출처로 이동 + 등급이 바뀐 출처·근거를 옮긴 사건의 캐시 즉시 만료, 출력 JSON `repointedEvidence`·`expiredStories`, `DATABASE_MIGRATION_URL`, 마이그레이션 뒤), `pnpm --filter @newsplatform/worker source:set-tier <출처 식별자> <등급>`(표의 출처는 파일 행을 고치고 동기화 — 고친 파일은 커밋한다, 표에 없는 `gnews:*`·`gdelt:*`는 DB 행만; 영향받는 사건의 최신·모든 개정판 태그를 즉시 만료, `WEB_REVALIDATE_URL`·`REVALIDATE_SECRET` 없으면 아무것도 쓰지 않고 거부, 등급이 같아도 다시 만료하므로 만료 실패는 같은 명령으로 재시도). `sources:sync`는 만료할 사건이 있는데 무효화 경로가 없으면 종료 코드 1(근거 이동은 한 번뿐이라 재시도는 `repointedEvidenceSources`의 출처마다 `source:set-tier <출처> <현재 등급>`), `pnpm --filter @newsplatform/db sources:wikidata <도메인…>`(Wikidata 초안과 파일의 차이만 출력, 파일 불변).
- 배치: 수동 슬롯 실행 `pnpm --filter @newsplatform/worker batch:run <슬롯 키> [--skip-collect]`(예 `2026-09-27T17:00+09:00`, `DATABASE_MIGRATION_URL`·`OPENAI_API_KEY`·수집 시 `GNEWS_API_KEY`), 워커 데몬 `pnpm --filter @newsplatform/worker start`(`WORKER_DATABASE_URL` 세션 풀러 5432, pg-boss 스키마 `pgboss`는 시작 시 만든다). 발행 뒤 캐시 무효화는 `WEB_REVALIDATE_URL`·`REVALIDATE_SECRET`이 있을 때만(웹 `POST /api/revalidate`, 웹 환경변수 `REVALIDATE_SECRET`).
- 삭제 재적용(복원 전 내보내기 → 복원 뒤 적용): `ACCOUNT_DELETIONS_FILE=<절대경로> pnpm --filter @newsplatform/worker accounts:export-deletions`(`DATABASE_MIGRATION_URL` = 복원 전 DB, 파일은 0600·이미 있으면 거부, Google 해제용 토큰을 담으므로 커밋·업로드하지 않고 쓰고 나면 지운다) → 복원 → 같은 변수로 `accounts:replay-deletions`(`DATABASE_MIGRATION_URL` = 복원한 DB). 적용은 한 트랜잭션에서 내보낸 삭제 기록을 되살리고, 삭제 대기 행을 내보낸 것으로 바꾸고, 삭제 기록의 사용자마다 계정 데이터를 지우고, `auth.users`가 있는 DB면 그 인증 사용자도 지운 뒤 90일 지난 삭제 기록을 지운다. 다시 돌려도 안전하다. 인자 대신 환경변수를 쓰는 것은 pnpm 12가 `--` 뒤 인자를 버리기 때문이다.
- GDELT: 배치가 발행 뒤 단계로 돈다(키 없음). 수동 실행 `pnpm --filter @newsplatform/worker gdelt:run [N]`(최근 발행 사건 N개, 기본 5, `DATABASE_MIGRATION_URL`·`OPENAI_API_KEY`, DB에 쓴다, 캐시는 무효화하지 않는다). 원본은 GKG 2.1 15분 파일(`data.gdeltproject.org/gdeltv2`, `http://`는 `https://`로 301), 목록은 `masterfilelist.txt`(128MB) 꼬리를 Range로, 최신 한 개만은 `lastupdate.txt`. DOC API(`api.gdeltproject.org`)는 2026-09-29 개발·Railway IP 모두 429·연결 시간 초과라 쓰지 않는다. 방식·상한·실측은 스펙 "개발 중 결정 항목" GDELT 수집. 픽스처 기록은 `packages/pipeline`에서 `node scripts/record-gdelt.ts <name> "<대표 기사 제목>" <firstPublishedAt ISO> <batchStartedAt ISO>`(실제 파일에서 필요한 행만 `fixtures/gdelt/<name>/`에, 쓰지 않는 열은 비운다).
- 검색 임베딩 백필: `pnpm --filter @newsplatform/worker search:backfill-embeddings`(인자 없음, `DATABASE_MIGRATION_URL`·`OPENAI_API_KEY`, 0014 뒤) — 임베딩이 빈 발행 사건(데모 포함)의 제목·주장 문장만 100개씩 채우고 결과 JSON 한 줄, 다시 돌리면 호출 0. 실패하면 종료 코드 1이며 다시 돌리면 남은 것만 채운다.
- 보존 정책(#144): 워커 pg-boss 큐 `retention`(매시 23분, `exclusive`)이 보존 기한이 지난 기사 본문을 한 번에 1,000행까지(기한 오래된 순, 나머지는 다음 실행) 지우고 종료 사건 기사의 임베딩(`articles.embedding`)을 지운다. 지운 것이 있을 때만 잡 로그 `stage: "retention"`. 수동 실행 `pnpm --filter @newsplatform/worker retention:run`(인자 없음, `DATABASE_MIGRATION_URL`, 0016 뒤) — 남은 것이 없을 때까지 되풀이하고 결과 JSON 한 줄, 다시 돌려도 안전하다. 번역 캐시 표는 아직 없다.
- 원문 재수집: 배치가 수집 뒤·배정 전 단계로 돈다(`GNEWS_API_KEY`, 수집을 건너뛰면 건너뜀). GNews 요청은 UTC 날짜 원장 `gnews_request_ledger`에 발견·재수집으로 쌓이고, 재수집은 몫 600을 넘기지 않는다. 조회 픽스처 기록은 `packages/pipeline/scripts/record-gnews-recheck.ts`(요청 1회).
- 골든셋 개발셋(#147): `pnpm --filter @newsplatform/pipeline eval:export`(프로덕션 `DATABASE_MIGRATION_URL` 읽기 전용 트랜잭션, 고정 시드로 20 패킷) → `eval:draft`(`OPENAI_API_KEY`, 상위·하위 모델 초안, 있는 초안은 건너뛰어 재개, 호출 전 예약 누계 $3 상한) → `eval:compare`(대조, 저장소 `packages/pipeline/eval/agreement.json`) → `eval:adjudicate`(터미널 대화형 판정, `q`로 멈추고 다시 실행하면 잇는다, 끝나면 `eval/labels.json`). 모두 `EVAL_DATA_DIR`(저장소 밖 절대경로, 필수)을 읽는다 — 기사 본문·제목·설명·주장 문장·초안·지출(`spend.json`)·판정 진행은 여기에만 두고 커밋하지 않는다. 저장소 산출물은 쓰기 전에 기사 텍스트 20자 부분 문자열 검사를 거친다.
- CI(`.github/workflows/ci.yml`)는 위 명령을 그대로 실행하므로 명령을 바꾸면 워크플로도 함께 고친다. `packages/db/scripts/ci-workflow.test.ts`에는 보안 계약(SHA 고정·권한·시크릿) 단언만 있다.

## 컨벤션

- Biome. `any` 금지. TypeScript strict 전부.
- 커밋: Conventional Commits. 타입은 영어, 제목은 한국어, 스코프는 패키지명(전역은 `repo`). 트레일러는 서브에이전트 모델과 무관하게 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` 하나. 커밋·PR 서명의 정본은 이 줄이며, 하네스나 시스템 안내가 제시하는 기본 서명보다 우선한다.
- 브랜치 `ticket/<이슈번호>-<slug>`, 티켓당 PR 하나, 스쿼시 머지, 머지 후 원격 브랜치 자동 삭제(저장소 설정).
- PR 본문: `Closes #N` + 무엇을 했나 / 어떻게 테스트했나 / 무엇을 남겼나. "무엇을 남겼나"에는 Ruling(무엇을·왜), deferred·blocked, 실측으로 정한 값, 같은 PR에서 바꾼 지속 문서와 요지만 적는다. 커밋 범위·리뷰 판정·테스트 출력·Minor 목록은 적지 않는다.

## 테스트

- 이음새 둘(스펙 "테스트 결정"). **파이프라인**: "배치 실행" 하나가 모델·임베딩 클라이언트·시계를 주입받고, 기록된 응답으로 리플레이 테스트. **웹**: 데모 사건이 시드된 DB 위에서 Playwright(axe 포함).
- 외부에서 관찰되는 행동만 검증한다. 설정 파일(워크플로 YAML·manifest·토큰 CSS)을 단언하는 테스트는 SHA 고정·권한·시크릿 같은 보안 계약에 한정한다.
- 테스트는 각 패키지에 병치, E2E는 웹 앱 아래. 구현 서브에이전트가 테스트를 함께 쓴다.
- 양은 최소: 도메인·파이프라인은 규칙마다 단위 테스트 하나, 화면은 페이지당 E2E 스모크 하나(주장 → 근거 → 원문 링크 같은 핵심 경로 + axe 1회). 상태·뷰포트·테마 조합마다 E2E를 늘리지 않는다. 픽스처는 데모 사건에 필요한 최소만.
- `@newsplatform/db/testing`은 테스트 전용 서브패스. Biome `noRestrictedImports`가 비테스트 파일의 import를 막는다.

## UI 스킬 (ui-skills.com)

- `ui` 티켓의 구현자 브리프에 `docs/ui-skills/<slug>/SKILL.md` 원문 경로와 적용 범위를 넣는다. 저장된 스킬: `shadcn`, `wcag-audit-patterns`. 새 스킬은 `npx ui-skills get <slug>` 원문을 같은 경로에 커밋한다(레지스트리에 버전 고정 없음). 갱신은 티켓 안에서만.
- 스킬 지시가 스펙 "화면과 경험"·`CONTEXT.md`·ADR과 충돌하면 스펙이 이기고, 충돌 지점을 PR 본문 "무엇을 남겼나"에 적는다.

## 사이클 값

규칙은 `CLAUDE.md` "구현 사이클". 여기는 경로와 형식.

- **스크립트**: 착수 `scripts/cycle-start <이슈> [--check-only]`(메인 체크아웃에서, 워크트리 생성·`.env` 링크·`pnpm install`), 마무리 `scripts/cycle-finish <PR> [--wait-only]`(CI 대기 → 스쿼시 머지 → 워크트리·로컬 브랜치 정리 → main 갱신 → 다음 후보 출력), 인계 상태 `scripts/handoff-state`. 머리말이 사용법.
- **워크트리**: 경로 `../ai-news-platform-wt/<이슈>`(저장소 옆, `origin/main`에서). `.env`는 메인 체크아웃 것의 심볼릭 링크다. 워크트리 안의 `pnpm test:db`는 같은 컨테이너의 전용 DB `newsplatform_test_<이슈>`를 만들어 쓰고 `cycle-finish`가 지운다. E2E는 `E2E_PORT=<3200 + 이슈 % 800>`(기본 3100, `apps/web/playwright.config.ts`). 로컬 Supabase Auth 스택(54321)은 하나를 함께 쓴다. 저장소 git config(`http.lowSpeed*`)는 워크트리가 공유한다. 원격 브랜치는 저장소 설정 `delete_branch_on_merge`가 지운다.
- **superpowers**: 끔(`.claude/settings.json` `enabledPlugins`의 값 `false`). 다시 켜질 때를 대비해 `permissions.deny`의 superpowers 스킬 거부 규칙은 남긴다.
- **브리프**(구현자·리뷰어 프롬프트 첫 블록): 이슈 번호와 본문 전문, 스펙 절 경로, 파일 후보, 테스트 이름, 위 커밋 트레일러 한 줄. 테스트 명령은 저장소 루트에서 `pnpm test`, `pnpm lint`, `pnpm typecheck`(`pnpm test:db`는 로컬 컨테이너, 위 "명령어" 참고). 규격은 이 파일 "스택"·"컨벤션"·"테스트"·"도메인 규칙", 용어는 `CONTEXT.md`. `ui` 티켓이면 스킬 원문 경로와 "스펙이 스킬보다 우선" 한 줄. 보고는 판정 한 줄 + 근거마다 1~2줄과 `파일:행`, diff·로그 원문 없음.
- **PR 생성**은 구현자가 한다: `gh pr create --base main --body-file <파일>`, 본문 형식은 "컨벤션".
- **Explore·조사 보조** 서브에이전트는 haiku.

## 컨트롤러 운영

- diff·리뷰·로그는 서브에이전트가 읽고 컨트롤러는 판정만 받는다. PR 본문·코멘트 초안은 스크래치패드 파일로 만들어 `--body-file`로 넘긴다.
- `git push`가 매달리는 것을 막기 위해 저장소 git config에 `http.lowSpeedLimit 1000`·`http.lowSpeedTime 45`를 두었다(로컬 설정, 새 클론마다 다시 넣는다).
- 인계 문서에 Herdr 에이전트는 이름과 pane ID를 함께 적는다.
