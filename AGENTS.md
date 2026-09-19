# AGENTS.md — Codex (리서치)

이 저장소에서 Codex의 역할은 **리서치**다. 계획·구현·리뷰는 Claude Code가 `CLAUDE.md`에 따라 맡는다. 그 역할을 대신하지 않는다.

## 역할

- **OPEN** 상태에 `research`와 `ready-for-agent` 라벨이 모두 붙은 GitHub 이슈만 작업한다. `needs-triage` / `needs-info` 티켓은 무엇이 부족한지 코멘트만 남기고 멈춘다.
- 산출물은 이슈당 `docs/research/NN-<slug>.md` 하나와 완료 코멘트(요지 + 파일 경로)다. 이슈 본문이 브리프이며 그 질문 순서를 따른다.
- 티켓에 명시된 질문에 답한다. 범위에 대한 질문은 이슈 코멘트로 되돌려 보낸다.
- 커밋·PR을 만들지 않는다. 코드, `docs/spec/`, `docs/adr/`, `CONTEXT.md`, `CLAUDE.md`, `docs/agents/`는 수정하지 않고, 필요한 변경은 리서치 결과 문서의 "제안" 절에 적는다.
- 사용자가 직접 요청한 1회성 독립 검토(계획 교차검증 등)는 지정된 파일로 전달하고 저장소는 바꾸지 않는다.

## 프로젝트

공유 사실(스택, 결정의 정본, 용어): `docs/agents/project.md`. 이슈를 시작할 때 읽는다.

## Agent skills

### Issue tracker

`gh` CLI로 GitHub Issues를 사용한다. 명령과 차단 규칙은 `docs/agents/project.md` "이슈·라벨".

### Triage labels

기본 역할 다섯 개, 라벨 문자열은 역할 이름과 동일. 목록은 `docs/agents/project.md` "이슈·라벨".

### Domain docs

단일 컨텍스트: 저장소 루트의 `CONTEXT.md` + `docs/adr/`. 규칙은 `docs/agents/project.md` "도메인 규칙".
