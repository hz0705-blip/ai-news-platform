# 프로젝트

ai-news-platform. 두 에이전트가 공유하는 사실. 짧게 유지하고, 정본은 아래 경로에 둔다.

## 정본

- 결정과 범위, 마일스톤: `docs/spec/v1.md`. 여기에 없는 것은 구현하지 않고 티켓 코멘트로 묻는다.
- 용어: `CONTEXT.md`. 산출물(이슈·PR·테스트 이름)에서 피하라고 한 동의어를 쓰지 않는다.
- 되돌리기 어려운 결정: `docs/adr/0001~0011`. 구현 방식(superpowers 사이클, 역할 분담)은 0007, 호스팅·복구는 0008, UI 티켓의 Codex 계획·구현은 0010, 서브에이전트 모델 티어는 0011.
- 개발 중 알게 된 사실과 결정은 반드시 기록한다. 단, 새 파일 대신 기존 파일에 넣는다: 환경·계정·명령 같은 사실은 이 파일, 결정과 측정값은 스펙·ADR, 용어는 `CONTEXT.md`, 작업 증거는 PR 본문·이슈 코멘트.

## 이슈·라벨

- GitHub Issues를 `gh`로 쓴다: `gh issue create/view --comments/list --label/comment/edit --add-label --add-assignee/close --comment`. 이슈 본문이 곧 브리프다.
- 라벨 다섯: `needs-triage`(평가 필요), `needs-info`(보고자 정보 대기), `ready-for-agent`(명세 완료, 에이전트 착수 가능), `ready-for-human`(사람이 함), `wontfix`. 스킬이 말하는 역할 이름과 라벨 문자열이 같다. `research`는 Codex 리서치, `ui`는 Codex UI 계획·구현 표시(ADR-0010).
- 차단은 GitHub 네이티브 이슈 의존성이 정본: `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<차단 이슈의 데이터베이스 id>`(id는 `gh api repos/<owner>/<repo>/issues/<n> --jq .id`). 열린 차단자가 있거나 담당자가 있는 이슈는 착수하지 않는다.
- 외부 PR은 분류 대상이 아니다.

## 도메인 규칙

- 산출물(이슈 제목, PR, 테스트 이름, 코드 식별자)의 도메인 개념은 `CONTEXT.md` 용어를 쓰고, 용어집이 피하라는 동의어는 쓰지 않는다. 필요한 개념이 용어집에 없으면 만들어 쓰지 말고 티켓 코멘트로 묻는다.
- 산출물이 ADR과 충돌하면 조용히 덮어쓰지 않고 "ADR-000N과 충돌한다. 이유는 …"으로 드러낸다.

## 스택

- TypeScript 단일 런타임. Next.js + React, PostgreSQL + pgvector, Drizzle, pg-boss. Python 없음, 학습 없음. 모델은 OpenAI만.
- pnpm 워크스페이스 모노레포, Node 24 LTS, Turborepo 없음. 패키지 다섯:
  - `apps/web` 웹 앱, `apps/worker` 워커 앱
  - `packages/domain` 순수 TS, 외부 의존성 0
  - `packages/db` Drizzle 스키마·마이그레이션
  - `packages/pipeline` OpenAI 호출·게이트·평가 하네스
- 의존 방향: 웹과 워커는 도메인·DB·파이프라인을 import한다. 웹 ↔ 워커는 서로 import하지 않는다.
- 패키지 스코프는 임시로 `@newsplatform/*`. 서비스 이름 확정(M4 전) 시 일괄 변경.
- 경계마다 zod 스키마를 두고, 도메인 타입과 같은 모양이어야 하는 곳은 `z.ZodType<도메인타입>`으로 주석한다.
- 배포 대상·스케줄러·관측: 스펙 "배포와 운영"과 ADR-0008. 실제 계정 사실은 아래 "운영 환경".

## 운영 환경

계정·자격은 사용자가 만들고 Claude가 확인해 적는다(2026-09-19, #15). 값은 적지 않는다.

- **Supabase**: 조직 Pro, 프로젝트 `ai-news-platform`(ref `dhmwspzugsxrahzkggxx`), 서울 `ap-northeast-2`, PostgreSQL 17.6, Micro. 일일 백업 7일. pgvector 0.8.2 활성(2026-09-19 #16 첫 마이그레이션 `0000_enable_pgvector`, HNSW 게이트 통과). 직접 연결 호스트 `db.dhmwspzugsxrahzkggxx.supabase.co`는 IPv6 전용(AAAA만, A 없음)이라 IPv4 전용 환경(개발 Mac, GitHub 호스티드 러너)에서 쓸 수 없다. 대신 풀러 호스트 `aws-0-ap-northeast-2.pooler.supabase.com`(IPv4, 사용자 `postgres.dhmwspzugsxrahzkggxx`)의 세션 모드 5432를 마이그레이션·백업에, 트랜잭션 모드 6543을 런타임에 쓴다.
- **GitHub Actions**: 환경 이름 `Production`(대문자 P, 보호 규칙 없음). 환경 시크릿 `DATABASE_MIGRATION_URL`(세션 풀러 5432)·`BACKUP_ENCRYPTION_KEY`(32바이트를 64자 hex로, `openssl rand -hex 32`. 2026-09-19 #18). GitHub 환경 시크릿은 다시 읽을 수 없으므로 정본은 비밀번호 관리자 항목 "ai-news-platform BACKUP_ENCRYPTION_KEY"이고, 키를 교체하면 이전 키로 만든 아티팩트는 이전 키로만 열리므로 보관 기간(90일)이 끝날 때까지 이전 키를 함께 보관한다. 로컬 `.env`의 사본은 복구 훈련 전용. 워크플로는 `environment: Production`을 선언해야 읽는다. 저장소 시크릿은 쓰지 않는다. 워크플로 `backup`(`.github/workflows/backup.yml`): ubuntu-24.04 런너는 PostgreSQL 16 클라이언트가 선설치돼 `/usr/bin/pg_dump`(pg_wrapper)가 16을 고르므로 `/usr/lib/postgresql/17/bin`을 `GITHUB_PATH`에 넣고 덤프 전 메이저를 확인한다(2026-09-19 첫 실행 실패 원인). 매일 UTC 18:30(KST 03:30) + 수동 + `workflow_call`. `pg_dump --format=custom --no-owner --no-privileges --schema=public --schema=drizzle` → NPBK1(AES-256-GCM, `packages/db/scripts/backup-crypto.ts`) → 아티팩트 `db-backup-<YYYYMMDD>T<HHMMSS>Z-<run_id>`(`newsplatform.dump.enc`·`.sha256`·`manifest.json`, 보관 90일 = 공개 저장소 최대). 검증 잡이 `sha256sum -c` → `backup-decrypt.ts` → `pg_restore --list`. 공개 저장소는 Actions 실행·아티팩트 저장이 무료이며 아티팩트는 v4+에서 불변. 로컬 복구 첫 단계: `pnpm --filter @newsplatform/db backup:decrypt -- --in <절대경로>.enc --out <절대경로>`. 덤프는 스키마 한정(`--schema`)이라 확장 정의를 담지 않으므로 격리 DB 복원 전에 마이그레이션(`pnpm db:migrate`) 또는 `create extension if not exists vector`를 먼저 적용한다. 덤프 시점 `--no-owner --no-privileges`는 ACL을 아카이브에서 제거하므로 역할 권한은 복원 뒤 마이그레이션·설정으로 다시 부여한다(M2a 복구 훈련에서 확정). 암호화는 파일을 메모리에 한 번에 읽으며 상한 1 GiB(`MAX_PLAIN_BYTES`)를 넘으면 실패한다. 스트리밍 암호화는 후속 티켓. 워크플로 `ci`(`.github/workflows/ci.yml`, 2026-09-20 #19): `pull_request`·수동 실행. 잡 `checks`(고정 설치·`pnpm lint`·`pnpm typecheck`·`pnpm test`·`pnpm --filter @newsplatform/web build`)와 `migration-smoke`(서비스 컨테이너 `pgvector/pgvector:0.8.6-pg17` digest 고정, 자격은 `ci`/`ci-<run_id>`로 워크플로 안에서 생성, `pnpm db:migrate` → `pnpm db:gate`), `e2e`(2026-09-22 #20 추가: 고정 설치 → `playwright install --with-deps chromium firefox webkit` → `pnpm --filter @newsplatform/web build` → `pnpm --filter @newsplatform/web test:e2e`. 실패해도 아티팩트 `web-e2e`(`apps/web/playwright-report/`·`apps/web/test-results/`, 보관 7일)를 올린다. 타임아웃 15분)가 병렬로 돈다. 시크릿·환경을 읽지 않으므로 포크 PR에서도 돈다. 캐시는 `actions/setup-node`의 `cache: pnpm`. 이전 릴리스 픽스처 DB 마이그레이션 검사는 M2a.
- **Vercel**: 팀 `hz`(슬러그 `hz23`) Hobby, 프로젝트 `ai-news-platform`, Git `hz0705-blip/ai-news-platform` `main`, Root Directory `apps/web`, Next.js, Node 24, 함수 리전 `icn1`. 환경변수 `DATABASE_URL`(Production만, Sensitive). 자동 도메인 `ai-news-platform-six.vercel.app`. 배포는 `main` 푸시마다 Git 연동이 자동 수행(빌드 `next build`, 설치 `pnpm install --frozen-lockfile`). 첫 성공 배포는 #17(2026-09-19). PR 브랜치는 자격 없는 프리뷰로 빌드된다. 프리뷰 URL은 Deployment Protection(Vercel Authentication)이 켜져 있어 익명 요청이 302로 SSO에 보내진다. 자동 검사(Playwright 등)가 프리뷰를 열어야 하면 보호 우회 토큰이 필요하다(2026-09-19 #17 관찰).
- **프리뷰 자격 없음**: 프리뷰는 프로덕션 DB 자격을 쓰지 않는다. 필요해지면 별도 결정.
- **로컬**: `.gitignore`가 `.env*`를 무시하고 `.env.example`만 허용. 루트 `.env.example`이 변수 이름을 정의한다. 마이그레이션·게이트: `pnpm db:migrate`, `pnpm db:gate`(둘 다 `.env`의 `DATABASE_MIGRATION_URL`만 읽음).
- DB 비밀번호는 비밀번호 관리자에 없다. 재설정하면 위 두 시크릿을 함께 갱신한다.

## 명령어

루트 pnpm 스크립트 이름. M0 티켓이 실제로 만든다. M0 이전에는 manifest·테스트 실행 기반이 없으므로 "테스트 없음"은 미구축이며 PASS가 아니다. PR CI(`.github/workflows/ci.yml`)는 아래 설치·테스트·린트·타입 검사 명령과 `db:migrate`·`db:gate`를 그대로 실행하므로, 명령을 바꾸면 워크플로와 `packages/db/scripts/ci-workflow.test.ts`도 함께 고친다.

- 설치: `pnpm install`. npm·yarn은 쓰지 않는다. lockfile이 생긴 뒤에는 `pnpm install --frozen-lockfile`.
- 의존성 빌드 스크립트: pnpm 12는 승인 없이 막는다(`ERR_PNPM_IGNORED_BUILDS`). `drizzle-kit`의 `esbuild`는 `pnpm approve-builds`로 승인했고 결과가 `pnpm-workspace.yaml`의 `allowBuilds`에 있다. 새 패키지가 같은 오류를 내면 같은 방법으로 승인하고 커밋한다.
- 개발 서버: `pnpm dev`
- 테스트: `pnpm test` (Vitest), `pnpm test:e2e` (Playwright, 웹 앱 아래)
- 린트·포맷: `pnpm lint`, `pnpm format` (Biome)
- 타입 검사: `pnpm typecheck`

## 컨벤션

- Biome으로 린트와 포맷. `any` 금지. TypeScript strict 전부.
- 커밋: Conventional Commits. 타입은 영어, 제목은 한국어, 스코프는 패키지명. 패키지에 속하지 않는 저장소 전역 변경의 스코프는 `repo`. 예: `feat(domain): 상충 상태 전이 규칙`, `chore(repo): 루트 Biome 설정`.
- 브랜치 `ticket/<이슈번호>-<slug>`. 티켓당 PR 하나, 스쿼시 머지.
- PR 본문: `Closes #N` + 무엇을 했나 / 어떻게 테스트했나 / 무엇을 남겼나. 400줄 이내, 하루 안에 리뷰 가능한 크기.
- "무엇을 남겼나"에 원장에서 옮기는 것: Ruling(무엇을·왜), deferred Minor, parked, blocked, 실측으로 정한 값과 결정 시점. 커밋 범위·리뷰 판정·테스트 출력은 `git log`·CI·원장에 있으므로 옮기지 않는다.

## 테스트

- 이음새 둘. **파이프라인**: 파이프라인 패키지가 "배치 실행" 하나를 노출하고 모델·임베딩 클라이언트·시계를 주입받는다. 기록된 응답으로 실행하면 결정론적이므로 리플레이 테스트(같은 입력 → 같은 개정판)가 핵심. **웹**: 데모 사건이 시드된 DB 위에서 Playwright로 다섯 화면을 검증한다(핵심 루프, 로그인 흐름, 한도·중단 상태, axe, 키보드, 모바일·데스크톱 뷰포트).
- 보조: 도메인 규칙은 순수 함수라 픽스처만으로 단위 테스트. 경계 매퍼 단위 테스트. 수집 어댑터는 기록된 API 응답으로.
- 외부에서 관찰되는 행동만 검증한다. 내부 호출 순서나 DB 행 구조를 단언하지 않는다. 모델 호출은 실제 네트워크를 타지 않되 기록은 실제 응답에서 만든다.
- 테스트는 각 패키지에 병치. E2E는 웹 앱 아래. 구현 서브에이전트는 테스트를 먼저 쓴다.

## UI 스킬 (ui-skills.com)

- `ui` 라벨 티켓의 계획·구현은 Codex(GPT-6 Astra)가 ui-skills.com 레지스트리 스킬로 한다. 절차는 `AGENTS.md` "역할 — UI 구현", 결정은 ADR-0010.
- CLI: `npx ui-skills start`(라우팅 스킬), `npx ui-skills categories`, `npx ui-skills list [--category <name>]`, `npx ui-skills get <slug>`(스킬 마크다운). MCP: `https://www.ui-skills.com/mcp`(`list_skills`·`get_skill`). 기본 설치 경로는 Codex `.codex/skills`, Claude Code `.claude/skills`.
- 고른 스킬 원문은 `.codex/skills/<slug>/SKILL.md`로 저장소에 커밋한다(레지스트리에 버전 고정이 없음). 갱신은 티켓 안에서만.
- 2026-09-19 기준 스택과 맞는 후보: 구현 `shadcn`, `ui-styling`(shadcn+Tailwind), `frontend-design`(Anthropic), `better-colors`(Tailwind v4·다크 모드), `better-accessibility`, `migrate-radix-to-base`(Base UI), `next-cache-components`, `animate`. 읽기 전용 리뷰 `design-review`, `improve-ui`, `interface-review`, `wcag-audit-patterns`. 한국어 타이포 전용 스킬은 없어 스펙 타이포 항목이 정본.

## 구현 사이클

`ready-for-agent`가 붙은 구현 티켓을 Claude가 superpowers로 돈다. 규칙은 `CLAUDE.md`, 여기는 절차와 값. 절차 명령은 저장소 `scripts/`에 있고 각 스크립트 머리말이 사용법이다.

- **승인 버전**: superpowers 6.3.0, 소스 SHA `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`. 프로젝트 스코프 플러그인(`.claude/settings.json`의 `enabledPlugins`), `claude-plugins-official` 마켓플레이스 자동 갱신 끔.
- **대조 절차**(사이클 시작마다): `scripts/cycle-start`가 `claude plugin list`의 superpowers 버전과 `~/.claude/plugins/marketplaces/claude-plugins-official/.claude-plugin/marketplace.json`의 `source.sha`를 위 줄과 대조한다(스크립트가 위 '승인 버전' 줄을 파싱하므로 줄 형식을 바꾸지 않는다). 갱신은 수동으로 하고 스킬 원문을 다시 검토한 뒤 이 값을 고친다.
- **단계**:
  1. `scripts/cycle-start <이슈>` — 버전 대조 + 티켓 게이트(OPEN, `ready-for-agent`, `research`·`ui`·`needs-triage`·`needs-info` 없음, 담당자 없음, 열린 차단 이슈·"리서치 대기 #N" 없음) + 클레임 + 브랜치명 제안. FAIL이면 시작하지 않는다. `--check-only`는 클레임 없이 확인만.
  2. using-git-worktrees Step 0 → `EnterWorktree` → 워크트리 안에서 `scripts/cycle-worktree <이슈> <slug>`(브랜치 이름 변경, `.claude/settings.json`·`.gitignore` 확인, 메인 체크아웃 `.env` 복사).
  3. writing-plans. 태스크마다 `**모델:**` 태그(아래 "서브에이전트 모델").
  4. subagent-driven-development(`scripts/sdd-workspace`, `scripts/task-brief`는 superpowers 것, 워크트리 안에서). 브리프 첫 블록은 아래 "브리프 표준 문구".
  5. finishing-a-development-branch "Push and Create PR".
  6. `/code-review <merge-base> #<이슈>` → 결과를 PR 코멘트로 게시.
  7. 사용자 승인 → 스쿼시 머지 → `scripts/cycle-finish <이슈>`(삭제 대상 출력) → 사용자 확인 → `--yes`(워크트리·로컬·원격 브랜치·SDD 워크스페이스 삭제).
- **격리**: `EnterWorktree`는 `.claude/worktrees/<name>/`에 `worktree-<name>` 브랜치를 저장소 기본 브랜치에서 만든다. `.claude/settings.json`·`.gitignore`가 main에 있어야 워크트리에 들어온다. `.env`는 미추적이라 워크트리에 없으므로 `cycle-worktree`가 메인 체크아웃에서 복사한다(`db:migrate`·`db:gate`에 필요). 같은 워크트리에 구현자 동시 실행 없음.
- **계획 파일**: `docs/superpowers/plans/YYYY-MM-DD-<이슈번호>-<slug>.md`. `**Spec:**`에 `docs/spec/v1.md` 해당 절 + 이슈 번호. 설명은 한국어, 코드는 TypeScript. 구조 표식은 영문 유지: `## Global Constraints`, `### Task N:`, `**Files:**`, `**Interfaces:**`(task-brief가 `Task N` 헤딩으로 추출). 미추적(`.gitignore`)이며 워크트리 안에서 쓰고 워크트리와 함께 사라진다. 남길 내용은 PR 본문에 둔다.
- **원장**: `.superpowers/sdd/<계획 파일명>/progress.md`. 첫 줄이 계획 파일 경로. `Task N: complete`는 완료, 마지막 줄이 fix round면 그 다음 회차부터 재개. PR 이관 확인과 `/code-review` 종료 뒤 삭제(`cycle-finish`가 지운다).
- **기준 커밋**: `/code-review`에 넘기는 기준은 `git merge-base origin/main HEAD`.
- **첫 사이클(M0)**: Task 1은 manifest·pnpm 워크스페이스·Vitest 실행 기반 구축. 이후 태스크부터 실패 테스트 → 구현.

## 서브에이전트 모델 (ADR-0011)

superpowers SDD는 티어를 fast/standard/most-capable로만 말하고 브리프마다 모델을 명시하라고 한다. 이 프로젝트의 매핑(Agent 도구 `model` 값 `haiku`·`sonnet`·`opus`·`fable`):

| 역할 | light | standard | heavy |
|---|---|---|---|
| 구현자 | haiku | sonnet | opus |
| 태스크 리뷰어 | sonnet | sonnet | opus |
| 최종 리뷰(브랜치 전체) | opus | opus | opus, 민감 티켓은 fable |
| 수정 4~5회차 | 한 티어 위(haiku → sonnet → opus → fable) | | |
| Explore·조사 보조 | haiku | | |

- 등급은 writing-plans 단계에서 계획 파일 `### Task N:` 아래 첫 줄에 `**모델:** light|standard|heavy`로 적는다. SDD는 이 값을 읽고 바꾸지 않는다. 바꾸면 원장에 Ruling으로 남긴다.
- light: 문서·YAML·설정·단순 테스트, 예상 변경 50줄 이하, 브리프에 정답이 다 있음. standard: 기능 + 테스트, 모듈 1~2개, 스펙 해석 여지 작음. heavy: 스키마·마이그레이션, 암호화·인증, 동시성, 3개 이상 모듈 교차, Ruling이 필요한 태스크.
- 민감 티켓: 라벨·본문에 비밀·인증·백업·복구·마이그레이션이 있으면 최종 리뷰를 fable로.
- 컨트롤러 세션: 구현 사이클은 Fable 5.1. `/code-review`+머지만 하는 UI 티켓 세션과 `/triage`·문서 세션은 Opus 5로 시작해도 된다.

## 브리프 표준 문구

구현자·리뷰어 브리프의 첫 블록에 그대로 넣는다.

- 커밋 트레일러는 서브에이전트 모델과 무관하게 이 줄 하나: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- 테스트 명령은 워크트리 루트에서 `pnpm test`, `pnpm lint`, `pnpm typecheck`. DB가 필요한 검사는 `.env`의 `DATABASE_MIGRATION_URL`.
- 보고 형식: 판정 한 줄, 근거 항목마다 1~2줄과 `파일:행`. diff·로그 원문은 붙이지 않는다. 컨트롤러는 판정만 읽는다.
- 용어는 `CONTEXT.md`, 산출물 규칙은 이 파일 "도메인 규칙".

## 컨트롤러 운영

- 확인 명령은 스크립트 하나로: 시작 `scripts/cycle-start`, 상태 `scripts/handoff-state`, 정리 `scripts/cycle-finish`.
- diff·리뷰·로그는 서브에이전트가 읽고 컨트롤러는 판정만 받는다. PR 본문·코멘트 초안은 스크래치패드 파일로 만들어 `--body-file`로 넘긴다.
- 세션당 작업 단위 하나. 예산 30%를 넘길 것 같으면 다음 경계(태스크 완료·PR 생성·머지)에서 `.scratch/.task-done`을 만들고 인계한다.
- Herdr 안에서는 PreToolUse(`Agent`, 또는 `run_in_background`인 `Bash`) 훅 `.claude/hooks/agent-monitor-start.sh`가 오른쪽 pane(메인 50 : 모니터 50, id는 `.scratch/.agent-monitor-pane`)에 `scripts/agent-monitor <스크래치패드>/tasks --idle-exit 90`을 띄워 서브에이전트·백그라운드 작업(프롬프트 첫 줄, 마지막 도구 호출, 마지막 응답, done 여부)을 실시간으로 보인다. 모든 태스크가 done이거나 300초 이상 갱신이 없는 상태가 90초 지속되면 모니터가 종료되고 pane도 닫힌다(다음 호출 때 다시 열림). Herdr 밖, 서브에이전트 세션, 포그라운드 Bash에서는 아무것도 하지 않는다.
