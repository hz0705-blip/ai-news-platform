# 프로젝트

ai-news-platform. 두 에이전트가 공유하는 사실. 짧게 유지하고, 정본은 아래 경로에 둔다.

## 정본

- 결정과 범위, 마일스톤: `docs/spec/v1.md`. 여기에 없는 것은 구현하지 않고 티켓 코멘트로 묻는다.
- 용어: `CONTEXT.md`. 산출물(이슈·PR·테스트 이름)에서 피하라고 한 동의어를 쓰지 않는다.
- 되돌리기 어려운 결정: `docs/adr/0001~0010`. 구현 방식(superpowers 사이클, 역할 분담)은 0007, 호스팅·복구는 0008, UI 티켓의 Codex 계획·구현은 0010.
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
- **GitHub Actions**: 환경 이름 `Production`(대문자 P, 보호 규칙 없음). 환경 시크릿 `DATABASE_MIGRATION_URL`(세션 풀러 5432). 워크플로는 `environment: Production`을 선언해야 읽는다. `BACKUP_ENCRYPTION_KEY`는 #18이 형식을 정한 뒤 같은 환경에 등록. 저장소 시크릿은 쓰지 않는다.
- **Vercel**: 팀 `hz`(슬러그 `hz23`) Hobby, 프로젝트 `ai-news-platform`, Git `hz0705-blip/ai-news-platform` `main`, Root Directory `apps/web`, Next.js, Node 24, 함수 리전 `icn1`. 환경변수 `DATABASE_URL`(Production만, Sensitive). 자동 도메인 `ai-news-platform-six.vercel.app`. 배포는 `main` 푸시마다 Git 연동이 자동 수행(빌드 `next build`, 설치 `pnpm install --frozen-lockfile`). 첫 성공 배포는 #17(2026-09-19). PR 브랜치는 자격 없는 프리뷰로 빌드된다. 프리뷰 URL은 Deployment Protection(Vercel Authentication)이 켜져 있어 익명 요청이 302로 SSO에 보내진다. 자동 검사(Playwright 등)가 프리뷰를 열어야 하면 보호 우회 토큰이 필요하다(2026-09-19 #17 관찰).
- **프리뷰 자격 없음**: 프리뷰는 프로덕션 DB 자격을 쓰지 않는다. 필요해지면 별도 결정.
- **로컬**: `.gitignore`가 `.env*`를 무시하고 `.env.example`만 허용. 루트 `.env.example`이 변수 이름을 정의한다. 마이그레이션·게이트: `pnpm db:migrate`, `pnpm db:gate`(둘 다 `.env`의 `DATABASE_MIGRATION_URL`만 읽음).
- DB 비밀번호는 비밀번호 관리자에 없다. 재설정하면 위 두 시크릿을 함께 갱신한다.

## 명령어

루트 pnpm 스크립트 이름. M0 티켓이 실제로 만든다. M0 이전에는 manifest·테스트 실행 기반이 없으므로 "테스트 없음"은 미구축이며 PASS가 아니다.

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

`ready-for-agent`가 붙은 구현 티켓을 Claude가 superpowers로 돈다. 규칙은 `CLAUDE.md`, 여기는 절차와 값.

- **승인 버전**: superpowers 6.3.0, 소스 SHA `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`. 프로젝트 스코프 플러그인(`.claude/settings.json`의 `enabledPlugins`), `claude-plugins-official` 마켓플레이스 자동 갱신 끔.
- **대조 절차**(사이클 시작마다): `claude plugin list`에서 superpowers 버전 = 6.3.0, `~/.claude/plugins/marketplaces/claude-plugins-official/.claude-plugin/marketplace.json`의 superpowers `source.sha` = 위 SHA. 갱신은 수동으로 하고 스킬 원문을 다시 검토한 뒤 이 값을 고친다.
- **단계**: 버전 대조 → 격리(Step 0 → `EnterWorktree` → 브랜치 이름 변경 → 설정 존재 확인) → writing-plans → subagent-driven-development(`scripts/sdd-workspace`, `scripts/task-brief`는 워크트리 안에서) → finishing-a-development-branch "Push and Create PR" → `/code-review <merge-base> #<이슈>` → 코멘트 게시 → 사용자 승인 → 스쿼시 머지 → `git worktree remove` + 원격 브랜치 삭제 → 워크스페이스 삭제.
- **격리**: `EnterWorktree`는 `.claude/worktrees/<name>/`에 `worktree-<name>` 브랜치를 저장소 기본 브랜치에서 만든다. `.claude/settings.json`·`.gitignore`가 main에 있어야 워크트리에 들어온다. 같은 워크트리에 구현자 동시 실행 없음.
- **계획 파일**: `docs/superpowers/plans/YYYY-MM-DD-<이슈번호>-<slug>.md`. `**Spec:**`에 `docs/spec/v1.md` 해당 절 + 이슈 번호. 설명은 한국어, 코드는 TypeScript. 구조 표식은 영문 유지: `## Global Constraints`, `### Task N:`, `**Files:**`, `**Interfaces:**`(task-brief가 `Task N` 헤딩으로 추출). 미추적(`.gitignore`)이며 워크트리 안에서 쓰고 워크트리와 함께 사라진다. 남길 내용은 PR 본문에 둔다.
- **원장**: `.superpowers/sdd/<계획 파일명>/progress.md`. 첫 줄이 계획 파일 경로. `Task N: complete`는 완료, 마지막 줄이 fix round면 그 다음 회차부터 재개. PR 이관 확인과 `/code-review` 종료 뒤 삭제.
- **기준 커밋**: `/code-review`에 넘기는 기준은 `git merge-base origin/main HEAD`.
- **첫 사이클(M0)**: Task 1은 manifest·pnpm 워크스페이스·Vitest 실행 기반 구축. 이후 태스크부터 실패 테스트 → 구현.

