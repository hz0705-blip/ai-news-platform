# 프로젝트

ai-news-platform. 두 에이전트가 공유하는 사실. 짧게 유지하고, 정본은 아래 경로에 둔다.

## 정본

- 결정과 범위, 마일스톤: `docs/spec/v1.md`. 여기에 없는 것은 구현하지 않고 티켓 코멘트로 묻는다.
- 용어: `CONTEXT.md`. 산출물(이슈·PR·테스트 이름)에서 피하라고 한 동의어를 쓰지 않는다.
- 되돌리기 어려운 결정: `docs/adr/0001~0006`.

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
- 배포 대상·스케줄러·관측은 리서치 #6 결과 뒤 확정.

## 명령어

루트 pnpm 스크립트 이름. M0 티켓이 실제로 만든다.

- 설치: `pnpm install`
- 개발 서버: `pnpm dev`
- 테스트: `pnpm test` (Vitest), `pnpm test:e2e` (Playwright, 웹 앱 아래)
- 린트·포맷: `pnpm lint`, `pnpm format` (Biome)
- 타입 검사: `pnpm typecheck`

## 컨벤션

- Biome으로 린트와 포맷. `any` 금지. TypeScript strict 전부.
- 커밋: Conventional Commits. 타입은 영어, 제목은 한국어, 스코프는 패키지명. 예: `feat(domain): 상충 상태 전이 규칙`.
- 브랜치 `codex/<이슈번호>-<slug>`. 티켓당 PR 하나, 스쿼시 머지.
- PR 본문: `Closes #N` + 무엇을 했나 / 어떻게 테스트했나 / 무엇을 남겼나. 400줄 이내, 하루 안에 리뷰 가능한 크기.
- 실측 뒤에만 정할 수 있는 값(유사도 임계, 게이트 임계, 튜닝값)은 결정 시점과 측정값을 PR에 남긴다.

## 테스트

- 이음새 둘. **파이프라인**: 파이프라인 패키지가 "배치 실행" 하나를 노출하고 모델·임베딩 클라이언트·시계를 주입받는다. 기록된 응답으로 실행하면 결정론적이므로 리플레이 테스트(같은 입력 → 같은 개정판)가 핵심. **웹**: 데모 사건이 시드된 DB 위에서 Playwright로 다섯 화면을 검증한다(핵심 루프, 로그인 흐름, 한도·중단 상태, axe, 키보드, 모바일·데스크톱 뷰포트).
- 보조: 도메인 규칙은 순수 함수라 픽스처만으로 단위 테스트. 경계 매퍼 단위 테스트. 수집 어댑터는 기록된 API 응답으로.
- 외부에서 관찰되는 행동만 검증한다. 내부 호출 순서나 DB 행 구조를 단언하지 않는다. 모델 호출은 실제 네트워크를 타지 않되 기록은 실제 응답에서 만든다.
- 테스트는 각 패키지에 병치. E2E는 웹 앱 아래. Codex는 테스트를 먼저 쓴다.
