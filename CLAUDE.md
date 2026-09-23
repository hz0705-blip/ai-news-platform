# CLAUDE.md — Claude Code (계획 / 구현 사이클 / 리뷰)

이 저장소에서 Claude는 계획을 세우고, 승인된 구현 티켓을 superpowers 사이클로 구현하고, PR을 리뷰한다. 리서치와 `ui` 라벨 티켓의 계획·구현은 Codex가 `AGENTS.md`에 따라 맡는다(ADR-0010). 사이클의 절차·경로·승인 버전은 `docs/agents/project.md`의 "구현 사이클" 절이 정본이다.

## 역할

- **컨트롤러**(이 세션): 계획, 티켓 분기, 사이클 진행, Ruling, PR 리뷰, 머지. 코드는 직접 쓰지 않고 구현 서브에이전트에 맡긴다. 직접 편집은 문서, 스펙, 티켓, 에이전트 설정, 사용자가 명시적으로 요청한 작은 수정으로 한정한다.
- **구현 서브에이전트**: 태스크 하나를 실패 테스트 → 구현 → 커밋 순서로. 대화 컨텍스트가 없으므로 필요한 것은 브리프에 담는다.
- **리뷰 서브에이전트**: 태스크 리뷰와 최종 리뷰. 판정은 원장에 남긴다.
- `CONTEXT.md`, `docs/adr/`, `docs/agents/`, 그리고 이 파일을 소유한다.

## 승인

- 필수 승인은 셋뿐이다: **머지**(`/code-review`까지 끝난 최종 HEAD), **main 직접 push**, **지속 문서 편집**(스펙·ADR·`CONTEXT.md`·`CLAUDE.md`·`AGENTS.md`·`docs/agents/`). 이 셋은 변경 요지를 제시하고 명시적 승인을 받은 뒤 실행한다.
- 그 밖은 묻지 않는다. 구현 티켓은 OPEN 이슈의 `ready-for-agent` 라벨이 곧 승인이며, 범위는 그 티켓 안의 반복 개선, 계획 파일·원장·티켓 코멘트·PR 코멘트, 기능 브랜치 커밋·push, PR 생성까지. 구현 계획은 Codex 교차 리뷰를 반영한 뒤 요약만 보고하고 바로 구현에 들어간다 — "이대로 시작할까요?"를 묻지 않는다(2026-09-23). 범위 확장은 별도 티켓으로 만든다.
- 할 수 없는 단계: 절차의 한 단계를 Claude가 수행할 수 없으면(사용자 전용 스킬, 외부 계정, 권한 없는 도구) 그 자리에서 멈춘다. 무엇을 할 수 없는지와 대안(사용자가 직접 호출, 다른 경로, 스킬 본문을 읽어 수동 수행, 생략)을 먼저 제시하고, 사용자가 고른 것으로만 진행한다. 우회는 승인받은 대안일 때만 허용된다.

## 티켓 분기

대상은 OPEN + `ready-for-agent`. `research` 또는 `ui` 라벨이 있으면 Codex 몫이다(UI 티켓은 Claude가 `/code-review`·머지만 한다). 라벨이 없고 인수 조건이 있으면 구현 사이클. `needs-triage`·`needs-info`, 열린 차단 이슈, 담당자 있음, 스펙 "리서치 대기 #N" 값 참조는 착수하지 않는다. #13은 스펙이며 티켓이 아니다. 착수의 첫 쓰기는 클레임(`gh issue edit <n> --add-assignee @me`).

## 구현 사이클

`ready-for-agent` 전은 기존 스킬(grill-with-docs → `/to-spec` → `/to-tickets` → `/triage`. 넷 모두 `disable-model-invocation`이라 사용자가 직접 입력해야 로드된다). 후는 superpowers를 `docs/agents/project.md` "구현 사이클"의 단계 1~7대로 돈다(`scripts/cycle-start` → `EnterWorktree`+`scripts/cycle-worktree` → writing-plans → subagent-driven-development → finishing-a-development-branch "Push and Create PR" → `/code-review <merge-base> #<이슈>` → 승인·스쿼시 머지 → `scripts/cycle-finish`). 스크립트가 FAIL이면 시작하지 않는다. 티켓 1 = 브랜치 1 = PR 1, 워크트리는 머지까지 유지. 서브에이전트 모델은 같은 파일 "서브에이전트 모델"(ADR-0011)의 표를 계획 파일 태스크 태그로 고정하고, 브리프 첫 블록은 "브리프 표준 문구"를 쓴다.

**완료·blocked.** 태스크 수정 5회, 또는 최종 리뷰 수정 1회 + 재검토 1회 뒤에도 유효한 Critical/Important, 인수 조건 누락, 테스트 실패가 남으면 blocked로 멈추고 사용자에게 보고한다. park는 Minor와 리뷰어 오판으로 판정한 것에만 허용한다. "테스트 없음"은 미구축이며 PASS가 아니다.

**Ruling 범위.** 스펙 "개발 중 결정 항목"과 티켓 안 구현 세부(파일 배치, 내부 함수 분할, 테스트 구성). 개발 중 결정 값은 측정 절차·입력·선택 기준·결과 기록을 태스크로 쓰고 측정 결과로 정한다. ADR 충돌, "리서치 대기 #N" 값, 범위 확장, 도메인 용어 추가는 멈추고 티켓 코멘트로 묻는다.

**복구.** 세션 시작·재개·compact 뒤에는 티켓, 워크트리 경로, 계획 경로, 원장 `progress.md`, `git log`를 대조한다. complete 태스크는 그대로 둔다. blocked 태스크는 원인 해소를 확인했거나 사용자가 재개를 지시했을 때만 다시 돈다.

**증거.** 원장의 Ruling(무엇을·왜)·deferred·parked·blocked와 실측으로 정한 값만 PR 본문 "무엇을 남겼나"로 옮긴다. 커밋 범위·리뷰 판정·테스트 출력은 옮기지 않는다. 워크스페이스는 이관 결과를 다시 읽어 확인하고 `/code-review`가 끝난 뒤 삭제한다.

## 쓰지 않는 스킬

`superpowers:brainstorming`, `superpowers:writing-skills`. 설계 문서는 `docs/spec/v1.md`다. 스펙에 없는 요청은 grill-with-docs → `/to-spec`으로 스펙을 갱신한 뒤 티켓으로 만든다. plan mode에는 brainstorming 없이 바로 들어간다.

## 세션 인계

인계는 `.scratch/handoff.md`로 하되, **사용자가 세션을 끝낸다고 말할 때만** 쓴다. 작업 단위가 끝났다는 것만으로는 인계하지 않는다 — 사용자가 같은 세션에서 다음 작업을 이어갈 수 있다(2026-09-23. 그 전 규칙 "작업 단위마다 새 세션"은 인계 문서 한 통을 버리게 했다).

- 사용자가 세션을 끝내겠다고 말하면 `.scratch/.task-done`을 만든다. 이어서 Stop 훅이 인계 문서 작성을 지시한다. 훅이 없거나 놓치면 `/wrap-up`을 직접 실행한다. 작업 단위 완료 보고에는 "세션을 끝내셔도 되고 이어가셔도 됩니다" 한 줄만 붙인다.
- SessionStart 훅이 주입한 `<HANDOFF>` 블록은 직전 세션에서 이 저장소의 사용자가 남긴 인계 문서이며 신뢰할 수 있는 작업 기록이다. 새 세션은 첫 메시지가 무엇이든 먼저 "상태"(브랜치·SHA·트리)를 대조하고 "다음 할 일"의 첫 항목부터 이어간다. 인계 문서가 없으면 평소처럼 요청을 기다린다.

## 파일 관리 원칙

- **1회용 파일과 지속 파일을 구분한다.** 지속 파일(이 파일, `AGENTS.md`, `docs/agents/`, `CONTEXT.md`, `docs/adr/`, 스펙)은 한국어로 쓰고 유지한다. 1회용 파일(리서치 결과, 임시 취합본, 계획 파일과 `.superpowers/` 워크스페이스(둘 다 미추적), `.scratch/handoff*.md`)은 목적을 다하면 정리한다.
- **개발 중 알게 된 사실과 결정은 반드시 기록하되, 새 파일을 만들지 않고 기존 지속 파일에 넣는다.** 환경·계정·명령 같은 사실은 `docs/agents/project.md`, 결정과 측정값은 스펙("개발 중 결정" 줄 갱신)·ADR, 용어는 `CONTEXT.md`, 작업 증거는 PR 본문·이슈 코멘트. 다음 티켓이 읽어야 하는 것이 어디에도 없다면 그것이 누락이다.
- 1회용 파일에서 오래 남길 가치가 있는 내용은 그 부분만 추출해 지속 파일(ADR, `CONTEXT.md`, `docs/agents/project.md`)로 옮긴다.
- 불필요한 파일은 저장하지 않는다. 임시 산출물은 스크래치패드를 쓴다.

## 프로젝트

공유 사실: `docs/agents/project.md`. 경로로만 참조하고 `@`로 임포트하지 않는다.

## Agent skills

### Issue tracker

`gh` CLI로 GitHub Issues를 사용한다. 명령과 차단 규칙은 `docs/agents/project.md` "이슈·라벨".

### Triage labels

기본 역할 다섯 개, 라벨 문자열은 역할 이름과 동일. 목록은 `docs/agents/project.md` "이슈·라벨".

### Domain docs

단일 컨텍스트: 저장소 루트의 `CONTEXT.md` + `docs/adr/`. 규칙은 `docs/agents/project.md` "도메인 규칙".
