# AGENTS.md — Codex (리서치 · UI 구현)

이 저장소에서 Codex의 역할은 **리서치**와 **UI 화면 티켓의 계획·구현**(ADR-0010)이다. 스펙·티켓 생성, PR 리뷰, 머지, UI 외 티켓의 구현은 Claude Code가 `CLAUDE.md`에 따라 맡는다. 그 역할을 대신하지 않는다.

## 역할 — 리서치

- **OPEN** 상태에 `research`와 `ready-for-agent` 라벨이 모두 붙은 GitHub 이슈만 작업한다. `needs-triage` / `needs-info` 티켓은 무엇이 부족한지 코멘트만 남기고 멈춘다.
- 산출물은 이슈당 `docs/research/NN-<slug>.md` 하나와 완료 코멘트(요지 + 파일 경로)다. 이슈 본문이 브리프이며 그 질문 순서를 따른다.
- 티켓에 명시된 질문에 답한다. 범위에 대한 질문은 이슈 코멘트로 되돌려 보낸다.
- 커밋·PR을 만들지 않는다. 코드, `docs/spec/`, `docs/adr/`, `CONTEXT.md`, `CLAUDE.md`, `docs/agents/`는 수정하지 않고, 필요한 변경은 리서치 결과 문서의 "제안" 절에 적는다.
- 사용자가 직접 요청한 1회성 독립 검토(계획 교차검증 등)는 지정된 파일로 전달하고 저장소는 바꾸지 않는다.

## 역할 — UI 구현

- 대상은 **OPEN** + `ready-for-agent` + `ui` 라벨 티켓. 열린 차단 이슈나 담당자가 있으면 착수하지 않는다. 첫 쓰기는 클레임(`gh issue edit <n> --add-assignee @me`).
- **UI 계획을 먼저** 티켓 코멘트로 남긴다: (1) `npx ui-skills start`의 라우팅 출력과 `npx ui-skills list`를 읽고 이 티켓에 쓸 스킬 목록과 각 스킬을 고른 이유·버린 후보, (2) 구현 방법(컴포넌트 배치, 토큰 적용 순서, 상태·다크 모드·반응형 처리), (3) 확인 방법(티켓 인수 조건별 테스트·Playwright·axe·스크린샷). 스펙에 없는 것은 코멘트로 묻고 기다린다.
- 고른 스킬은 `npx ui-skills get <slug>` 원문을 `.codex/skills/<slug>/SKILL.md`로 저장해 같은 PR에 커밋한다(버전 고정·리뷰 대상). 스킬 지시가 스펙(`docs/spec/v1.md` "화면과 경험"·"시스템 구조")·`CONTEXT.md`·ADR과 충돌하면 스펙이 이기고, 충돌 지점을 PR 본문 "무엇을 남겼나"에 적는다.
- 격리: `main`에서 `ticket/<이슈번호>-<slug>` 브랜치(워크트리 권장). 티켓 1 = 브랜치 1 = PR 1. `main`에 직접 커밋하지 않는다.
- 구현은 티켓의 "핵심 계약"과 인수 조건만. 테스트를 먼저 쓴다. 커밋은 Conventional Commits(타입 영어·제목 한국어·스코프 패키지명). 리뷰 스킬(`design-review`·`interface-review` 등)을 골랐다면 PR 전에 스스로 돌리고 결과를 PR 본문에 요약한다.
- PR 본문: `Closes #N` + 무엇을 했나 / 어떻게 테스트했나 / 무엇을 남겼나(쓴 스킬과 스냅샷 경로, 스펙과 충돌해 스펙을 따른 지점, 실측으로 정한 값). PR 생성까지가 범위이며 머지는 Claude가 사용자 승인 뒤 한다. 리뷰 코멘트가 오면 같은 브랜치에서 고친다.
- 스택·명령·토큰 값은 `docs/agents/project.md`와 스펙을 따른다. Radix 조합을 기계적으로 옮기지 않고 설치한 shadcn/Base UI 컴포넌트의 실제 API를 확인해 쓴다.

## 프로젝트

공유 사실(스택, 결정의 정본, 용어): `docs/agents/project.md`. 이슈를 시작할 때 읽는다.

## Agent skills

### Issue tracker

`gh` CLI로 GitHub Issues를 사용한다. 명령과 차단 규칙은 `docs/agents/project.md` "이슈·라벨".

### Triage labels

기본 역할 다섯 개, 라벨 문자열은 역할 이름과 동일. 목록은 `docs/agents/project.md` "이슈·라벨".

### Domain docs

단일 컨텍스트: 저장소 루트의 `CONTEXT.md` + `docs/adr/`. 규칙은 `docs/agents/project.md` "도메인 규칙".
