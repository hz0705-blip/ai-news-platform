# CLAUDE.md — Claude Code 규칙

이 저장소에서 Claude는 계획을 세우고, 승인된 티켓을 superpowers 사이클로 구현하고, PR을 리뷰한다. Codex는 리서치와 계획 교차 리뷰만 맡는다(`AGENTS.md`, ADR-0007). **규칙은 이 파일에만, 환경·명령·경로 같은 사실은 `docs/agents/project.md`에만** 둔다. 다른 문서는 이 둘을 경로로 가리킨다.

## 역할

- **컨트롤러**(이 세션): 계획, 사이클 진행, Ruling, PR 리뷰, 머지. 코드는 구현 서브에이전트에 맡기고, 직접 편집은 문서·스펙·티켓·에이전트 설정·사용자가 명시적으로 요청한 작은 수정으로 한정한다.
- **구현 서브에이전트**: 실패 테스트 → 구현 → 커밋. 대화 컨텍스트가 없으므로 필요한 것은 브리프에 담는다(`project.md` "브리프").
- **리뷰 서브에이전트**: 아래 "리뷰 게이트"가 요구할 때만.

## 승인

필수 승인은 셋: **머지**(`/code-review`까지 끝난 HEAD), **main 직접 push**, **PR 밖의 지속 문서 편집**(스펙·ADR·`CONTEXT.md`·`CLAUDE.md`·`AGENTS.md`·`docs/agents/`). 변경 요지를 제시하고 명시적 승인 뒤 실행한다. PR 안의 지속 문서 변경은 머지 승인이 겸한다.

그 밖은 묻지 않는다. OPEN 이슈의 `ready-for-agent`가 곧 착수 승인이며, 범위는 그 티켓 안의 구현·반복 개선, 계획 파일·원장·이슈 코멘트·PR 코멘트, 브랜치 커밋·push, PR 생성이다. 계획은 요약만 보고하고 바로 구현한다. 범위 확장은 별도 티켓.

수행할 수 없는 단계(사용자 전용 스킬, 외부 계정, 권한 없는 도구)는 그 자리에서 멈추고, 할 수 없는 것과 대안을 제시한 뒤 사용자가 고른 것으로만 진행한다.

## 티켓 착수

게이트는 `scripts/cycle-start <이슈>`가 검사한다(OPEN, `ready-for-agent`, `research`·`needs-triage`·`needs-info` 없음, 담당자 없음, 열린 차단 이슈·"리서치 대기 #N" 없음). FAIL이면 시작하지 않는다. `research` 라벨은 Codex 몫이고, `ui` 라벨은 브리프에 UI 스킬 원문 경로를 넣는 화면 티켓이다(`project.md` "UI 스킬"). #13은 스펙이며 티켓이 아니다.

`ready-for-agent` 전 단계(grill-with-docs → `/to-spec` → `/to-tickets` → `/triage`)는 사용자 전용 스킬이라 사용자가 직접 입력한다.

## 구현 사이클

메인 체크아웃의 `ticket/<이슈>-<slug>` 브랜치에서 돈다. 워크트리는 쓰지 않는다. 티켓 1 = 브랜치 1 = PR 1.

1. `scripts/cycle-start <이슈>` — 게이트·클레임·브랜치 생성.
2. superpowers:writing-plans. 계획 머리에 `**민감:** 예|아니오`, 태스크마다 `**모델:** opus|fable`. 인터페이스·테스트 이름과 단언 요지·파일 목록·Ruling만 적고 구현 코드는 넣지 않는다. 태스크 4개 이하, 300줄 이하. 넘으면 티켓 분할을 먼저 검토한다.
3. **태스크가 하나면** SDD 없이 구현 서브에이전트 하나에 계획을 그대로 브리프로 주고 5로 간다. **둘 이상이면** superpowers:subagent-driven-development.
4. 리뷰 게이트(아래).
5. superpowers:finishing-a-development-branch "Push and Create PR". 스펙·ADR·`project.md`를 바꾸는 Ruling은 같은 브랜치에 문서 변경 커밋으로 넣는다.
6. `/code-review $(git merge-base origin/main HEAD) #<이슈>` → 결과를 PR 코멘트로.
7. 머지 승인 → 스쿼시 머지(원격 브랜치는 GitHub이 자동 삭제) → 로컬 브랜치·계획 파일·`.superpowers/` 워크스페이스 삭제.

**리뷰 게이트.** 민감 티켓(마이그레이션·시크릿·인증·백업·복구를 건드림)은 구현자·리뷰어 fable, 태스크마다 리뷰, 최종 리뷰(fable) 1회 + 재검토, 계획 Codex 교차 리뷰. 그 밖은 구현자 opus, 태스크 리뷰·최종 리뷰 없음, `/code-review`가 유일한 브랜치 리뷰. 계획 교차 리뷰는 민감이거나 태스크 4개일 때만 `codex exec -s read-only`로 파일에 받아 반영한다. 민감으로 올리는 것은 자유, 내리는 것은 원장 Ruling.

**완료·blocked.** 수정 회차 상한(태스크 리뷰 5회, 최종 리뷰·`/code-review` 각 수정 1회 + 재검토 1회) 뒤에도 Critical/Important, 인수 조건 누락, 테스트 실패가 남으면 blocked로 멈추고 보고한다. park는 Minor와 리뷰어 오판에만. "테스트 없음"은 PASS가 아니다. 리뷰 Minor는 같은 PR에서 고치거나 버린다. 이슈로 만드는 것은 동작이 바뀌는 것뿐이며 `needs-triage` 하나로.

**Ruling.** 범위는 스펙 "개발 중 결정 항목"과 티켓 안 구현 세부. 측정이 필요한 값은 측정 절차·결과를 태스크로 쓰고 결과로 정한다. 기록 위치는 하나다: 스펙 "개발 중 결정 항목"에 있는 값은 그 줄, 스펙·ADR의 의미를 바꾸면 그 문서, 환경·명령 사실은 `project.md`, 용어는 `CONTEXT.md`. 원장의 Ruling 줄과 deferred·blocked만 PR 본문 "무엇을 남겼나"로 옮긴다. ADR 충돌, "리서치 대기 #N" 값, 범위 확장, 용어 추가는 멈추고 티켓 코멘트로 묻는다.

**복구.** 세션 시작·재개·compact 뒤 티켓, 브랜치, 계획 경로, 원장 `progress.md`, `git log`를 대조한다. complete는 그대로 두고, blocked는 원인 해소를 확인했거나 사용자가 지시했을 때만 재개한다.

## 쓰지 않는 스킬

`superpowers:brainstorming`, `superpowers:writing-skills`, `superpowers:using-git-worktrees`. 설계 문서는 `docs/spec/v1.md`이며, 스펙에 없는 요청은 사용자가 grill-with-docs → `/to-spec`으로 스펙을 갱신한 뒤 티켓으로 만든다. plan mode에는 brainstorming 없이 바로 들어간다.

## 세션 인계

사용자가 세션을 끝낸다고 말할 때만 `.scratch/.task-done`을 만든다. Stop 훅이 `/wrap-up`을 지시하고, 놓치면 직접 실행한다. 작업 단위 완료 보고에는 "세션을 끝내셔도 되고 이어가셔도 됩니다" 한 줄만 붙인다. SessionStart 훅이 주입한 `<HANDOFF>`는 직전 세션의 신뢰할 수 있는 기록이며, 첫 메시지가 무엇이든 "상태"를 대조하고 "다음 할 일" 첫 항목부터 잇는다.

## 파일 관리

- 지속 파일(이 파일, `AGENTS.md`, `docs/agents/`, `CONTEXT.md`, `docs/adr/`, 스펙)은 한국어로 쓰고 규칙만 적는다. 경위·날짜·이전 규칙은 커밋 메시지와 git log에 둔다. 절차 변경은 새 ADR을 만들지 않고 이 파일과 ADR-0007을 고친다.
- 1회용 파일(리서치 결과, 계획 파일, `.superpowers/`, `.scratch/handoff*.md`)은 목적을 다하면 지운다. 남길 내용은 그 부분만 지속 파일로 옮긴다.
- 개발 중 알게 된 사실·결정은 새 파일 없이 위 "Ruling" 기록 위치에 넣는다. 다음 티켓이 읽어야 하는 것이 어디에도 없다면 그것이 누락이다.

## 프로젝트

공유 사실: `docs/agents/project.md`(경로로만 참조, `@` 임포트 없음). 이슈는 `gh`로, 라벨과 차단 규칙은 `project.md` "이슈·라벨". 용어는 `CONTEXT.md`, 산출물 규칙은 `project.md` "도메인 규칙".
