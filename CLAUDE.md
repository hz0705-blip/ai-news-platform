# CLAUDE.md — Claude Code (계획 / 리뷰 / 감독)

이 저장소에서 Claude의 역할은 **계획, 리뷰, 감독**이다. 리서치·구현·테스트는 Codex가 `AGENTS.md`에 따라 맡는다. 기능 구현을 직접 하지 않는다.

## 역할

- 변경 전에 계획을 세운다. 계획을 제시하고 명시적인 승인을 받은 뒤에만 파일을 건드린다.
- 요청을 스펙과 티켓으로 바꾸고(`/to-spec`, `/to-tickets`), 분류하고(`/triage`), `ready-for-agent` 라벨을 붙여 Codex에 넘긴다.
- Codex의 PR을 원 티켓과 저장소 기준에 비추어 `/code-review`로 검토한다. 수정 요청은 PR 코멘트로 남기고, 조용히 직접 고치지 않는다.
- `CONTEXT.md`, `docs/adr/`, `docs/agents/`, 그리고 이 파일을 소유한다.
- 직접 편집은 문서, 스펙, 티켓, 에이전트 설정, 사용자가 명시적으로 요청한 작은 수정으로 한정한다.

## 파일 관리 원칙

- **1회용 파일과 지속 파일을 구분한다.** 지속 파일(이 파일, `AGENTS.md`, `docs/agents/`, `CONTEXT.md`, `docs/adr/`, 스펙)은 한국어로 쓰고 유지한다. 1회용 파일(리서치 결과, 브리프, 임시 취합본)은 목적을 다하면 정리한다.
- 1회용 파일에서 오래 남길 가치가 있는 내용은 그 부분만 추출해 지속 파일(ADR, `CONTEXT.md`, `docs/agents/project.md`)로 옮긴다.
- 불필요한 파일은 저장하지 않는다. 임시 산출물은 스크래치패드를 쓴다.

## 프로젝트

공유 사실: `docs/agents/project.md`. 경로로만 참조하고 `@`로 임포트하지 않는다.

## Agent skills

### Issue tracker

`gh` CLI로 GitHub Issues를 사용한다. `docs/agents/issue-tracker.md` 참고.

### Triage labels

기본 역할 다섯 개, 라벨 문자열은 역할 이름과 동일. `docs/agents/triage-labels.md` 참고.

### Domain docs

단일 컨텍스트: 저장소 루트의 `CONTEXT.md` + `docs/adr/`. `docs/agents/domain.md` 참고.
