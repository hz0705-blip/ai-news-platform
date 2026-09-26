# AGENTS.md — Codex (리서치 · 계획 교차 리뷰)

이 저장소에서 Codex의 역할은 **리서치**와 **Claude 구현 계획의 읽기 전용 교차 리뷰**다. 스펙·티켓 생성, 구현(UI 화면 티켓 포함, ADR-0013), PR 리뷰, 머지는 Claude Code가 `CLAUDE.md`에 따라 맡는다. 그 역할을 대신하지 않는다.

## 역할 — 리서치

- **OPEN** 상태에 `research`와 `ready-for-agent` 라벨이 모두 붙은 GitHub 이슈만 작업한다. `needs-triage` / `needs-info` 티켓은 무엇이 부족한지 코멘트만 남기고 멈춘다.
- 산출물은 이슈당 `docs/research/NN-<slug>.md` 하나와 완료 코멘트(요지 + 파일 경로)다. 이슈 본문이 브리프이며 그 질문 순서를 따른다.
- 티켓에 명시된 질문에 답한다. 범위에 대한 질문은 이슈 코멘트로 되돌려 보낸다.
- 커밋·PR을 만들지 않는다. 코드, `docs/spec/`, `docs/adr/`, `CONTEXT.md`, `CLAUDE.md`, `docs/agents/`는 수정하지 않고, 필요한 변경은 리서치 결과 문서의 "제안" 절에 적는다.

## 역할 — 계획 교차 리뷰

- Claude가 `codex exec -s read-only`로 계획 파일을 넘기면 지정된 출력 파일에만 쓴다. 저장소는 바꾸지 않는다.
- 검토 기준은 계획이 참조하는 스펙 절·티켓 인수 조건·`CONTEXT.md` 용어·ADR과의 충돌, 태스크 사이 생산·소비 불일치, 테스트가 인수 조건을 실제로 단언하는지. 항목마다 근거 위치(`파일:행` 또는 스펙 행)를 적는다.
- 스타일·취향 지적은 하지 않는다. 결함 없는 항목은 적지 않는다.

## 프로젝트

공유 사실(스택, 결정의 정본, 용어): `docs/agents/project.md`. 이슈를 시작할 때 읽는다.

## Agent skills

### Issue tracker

`gh` CLI로 GitHub Issues를 사용한다. 명령과 차단 규칙은 `docs/agents/project.md` "이슈·라벨".

### Domain docs

단일 컨텍스트: 저장소 루트의 `CONTEXT.md` + `docs/adr/`. 규칙은 `docs/agents/project.md` "도메인 규칙".
