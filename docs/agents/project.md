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

- 산출물(이슈 제목, PR, 테스트 이름, 코드 식별자)의 도메인 개념은 `CONTEXT.md` 용어를 쓴다. 필요한 개념이 용어집에 없으면 만들어 쓰지 말고 티켓 코멘트로 묻는다.
- 산출물이 ADR과 충돌하면 조용히 덮어쓰지 않고 "ADR-000N과 충돌한다. 이유는 …"으로 드러낸다.
- 기사 본문은 30일 뒤 삭제한다(`article_versions.body_expires_at`, 기사 발행 시각 기준·불명이면 수집 시각). 삭제 대상은 본문(`body`)이며, 근거(`evidence`)가 기사 버전을 FK로 참조하므로 행과 근거 구간·해시·URL·메타데이터는 남는다.

## 스택

- TypeScript 단일 런타임: Next.js + React, PostgreSQL + pgvector, Drizzle, pg-boss. Python·학습 없음. 모델은 OpenAI만. 근거는 ADR-0005, 구조 세부는 스펙 "시스템 구조".
- pnpm 워크스페이스, Node 24 LTS, Turborepo 없음. 패키지 다섯: `apps/web`, `apps/worker`, `packages/domain`(순수 TS, 의존성 0), `packages/db`(Drizzle 스키마·마이그레이션), `packages/pipeline`(OpenAI 호출·게이트·평가). 웹·워커는 도메인·DB·파이프라인을 import하고 서로는 import하지 않는다.
- 패키지 스코프는 임시로 `@newsplatform/*`. 서비스 이름 확정(M4 전) 시 일괄 변경.
- 경계마다 zod 스키마를 두고, 도메인 타입과 같은 모양이어야 하는 곳은 `z.ZodType<도메인타입>`으로 주석한다.

## 운영 환경

계정·자격은 사용자가 만들고 Claude가 확인해 적는다. 값은 적지 않는다.

- **Supabase**: 조직 Pro, 프로젝트 `ai-news-platform`(ref `dhmwspzugsxrahzkggxx`), 서울 `ap-northeast-2`, PostgreSQL 17, Micro, 일일 백업 7일, pgvector 0.8.x. 직접 연결 호스트는 IPv6 전용이라 IPv4 환경(개발 Mac, GitHub 러너)에서 쓸 수 없다. 풀러 호스트 `aws-0-ap-northeast-2.pooler.supabase.com`(사용자 `postgres.dhmwspzugsxrahzkggxx`)의 세션 모드 5432를 마이그레이션·백업에, 트랜잭션 모드 6543을 런타임에 쓴다. DB 비밀번호는 비밀번호 관리자에 없다. 재설정하면 아래 시크릿과 로컬 `.env`를 함께 갱신한다.
- **GitHub Actions**: 환경 `Production`(보호 규칙 없음). 환경 시크릿 `DATABASE_MIGRATION_URL`(세션 풀러 5432)·`BACKUP_ENCRYPTION_KEY`(`openssl rand -hex 32`). 시크릿은 다시 읽을 수 없으므로 키의 정본은 비밀번호 관리자 항목 "ai-news-platform BACKUP_ENCRYPTION_KEY"이고, 키를 교체하면 이전 키로 만든 아티팩트(보관 90일)가 만료될 때까지 이전 키를 함께 보관한다. 저장소 시크릿은 쓰지 않는다. 워크플로는 `backup`(야간 덤프·암호화·검증)과 `ci`(PR 체크)이며 각 YAML 머리 주석이 절차·함정의 정본이다. 로컬 복구 첫 단계: `pnpm --filter @newsplatform/db backup:decrypt -- --in <절대경로>.enc --out <절대경로>`, 복원 전 `pnpm db:migrate` 또는 `create extension if not exists vector`.
- **Vercel**: 팀 `hz`(슬러그 `hz23`) Hobby, 프로젝트 `ai-news-platform`, Root Directory `apps/web`, Node 24, 리전 `icn1`. 환경변수 `DATABASE_URL`(Production만). 자동 도메인 `ai-news-platform-six.vercel.app`. `main` 푸시마다 자동 배포. PR 프리뷰는 자격 없이 빌드되고 Deployment Protection이 켜져 있어 익명 요청은 302로 SSO에 간다(자동 검사가 프리뷰를 열려면 우회 토큰 필요).
- **로컬**: `.env.example`이 변수 이름을 정의한다. `pnpm db:migrate`·`pnpm db:gate`·`pnpm test:db`·`demo:load`는 `.env`의 `DATABASE_MIGRATION_URL`만 읽는다.

## 명령어

- 설치: `pnpm install --frozen-lockfile`. npm·yarn은 쓰지 않는다. pnpm 12는 의존성 빌드 스크립트를 승인 없이 막는다(`ERR_PNPM_IGNORED_BUILDS`) — `pnpm approve-builds`로 승인하고 `pnpm-workspace.yaml`의 `allowBuilds`를 커밋한다.
- 개발 서버 `pnpm dev`. 린트·포맷 `pnpm lint`, `pnpm format`(Biome). 타입 `pnpm typecheck`.
- 테스트 `pnpm test`(Vitest). 패키지 하나는 `pnpm test --project <domain|db|pipeline|worker|web>`(**`--`를 넣으면 pnpm 12가 필터를 버리고 전체가 돈다**). E2E `pnpm --filter @newsplatform/web test:e2e`(Playwright).
- 실 DB 테스트 `pnpm test:db` — `db`·`worker` 프로젝트만, dev DB를 truncate하므로 끝나면 `pnpm --filter @newsplatform/worker demo:load`(데모 사건 재적재, 멱등). 테스트 전용 컨테이너 분리는 이슈 #42.
- 마이그레이션 `pnpm db:migrate`, pgvector 게이트 `pnpm db:gate`.
- CI(`.github/workflows/ci.yml`)는 위 명령을 그대로 실행하므로 명령을 바꾸면 워크플로도 함께 고친다. `packages/db/scripts/ci-workflow.test.ts`에는 보안 계약(SHA 고정·권한·시크릿) 단언만 있다.

## 컨벤션

- Biome. `any` 금지. TypeScript strict 전부.
- 커밋: Conventional Commits. 타입은 영어, 제목은 한국어, 스코프는 패키지명(전역은 `repo`). 트레일러는 서브에이전트 모델과 무관하게 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` 하나.
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

- **스크립트**: 착수 `scripts/cycle-start <이슈> [--check-only]`, 마무리 `scripts/cycle-finish <PR> [--wait-only]`(CI 대기 → 스쿼시 머지 → 로컬 정리 → main 갱신 → 다음 티켓 출력), 인계 상태 `scripts/handoff-state`. 머리말이 사용법.
- **superpowers**: 프로젝트 스코프 플러그인(`.claude/settings.json` `enabledPlugins`), 마켓플레이스 자동 갱신 끔. 쓰는 것은 SessionStart 주입뿐이다.
- **브리프**(구현자·리뷰어 프롬프트 첫 블록): 이슈 번호와 본문 전문, 스펙 절 경로, 파일 후보, 테스트 이름, 위 커밋 트레일러 한 줄. 테스트 명령은 저장소 루트에서 `pnpm test`, `pnpm lint`, `pnpm typecheck`(실 DB는 `pnpm test:db`). 규격은 이 파일 "스택"·"컨벤션"·"테스트"·"도메인 규칙", 용어는 `CONTEXT.md`. `ui` 티켓이면 스킬 원문 경로와 "스펙이 스킬보다 우선" 한 줄. 보고는 판정 한 줄 + 근거마다 1~2줄과 `파일:행`, diff·로그 원문 없음.
- **PR 생성**은 구현자가 한다: `gh pr create --base main --body-file <파일>`, 본문 형식은 "컨벤션".
- **Explore·조사 보조** 서브에이전트는 haiku.

## 컨트롤러 운영

- diff·리뷰·로그는 서브에이전트가 읽고 컨트롤러는 판정만 받는다. PR 본문·코멘트 초안은 스크래치패드 파일로 만들어 `--body-file`로 넘긴다.
- `git push`가 매달리는 것을 막기 위해 저장소 git config에 `http.lowSpeedLimit 1000`·`http.lowSpeedTime 45`를 두었다(로컬 설정, 새 클론마다 다시 넣는다).
- Herdr 안에서는 PreToolUse(`Agent`, 백그라운드 `Bash`) 훅 `.claude/hooks/agent-monitor-start.sh`가 오른쪽 pane에 `scripts/agent-monitor`를 띄워 서브에이전트 진행을 보인다. 모든 태스크가 끝나거나 300초 이상 갱신이 없는 상태가 90초 지속되면 pane이 닫힌다. Herdr 밖·서브에이전트 세션·포그라운드 Bash에서는 아무것도 하지 않는다.
- 인계 문서에 Herdr 에이전트는 이름과 pane ID를 함께 적는다.
