# 이슈 트래커: GitHub

이 저장소의 이슈와 스펙은 GitHub 이슈로 관리한다. 모든 작업은 `gh` CLI로 한다.

## 규약

- **이슈 생성**: `gh issue create --title "..." --body "..."`. 여러 줄 본문은 heredoc을 쓴다.
- **이슈 읽기**: `gh issue view <number> --comments`. 코멘트는 `jq`로 걸러내고 라벨도 함께 가져온다.
- **이슈 목록**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`에 필요한 `--label`, `--state` 필터를 붙인다.
- **코멘트**: `gh issue comment <number> --body "..."`
- **라벨 추가 / 제거**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **닫기**: `gh issue close <number> --comment "..."`

저장소는 `git remote -v`로 추론한다. 클론 안에서 실행하면 `gh`가 자동으로 처리한다.

## PR을 분류 대상으로 삼을지

**PR을 요청 창구로 사용: 아니오.** _(외부 PR을 기능 요청으로 취급하려면 `yes`로 바꾼다. `/triage`가 이 플래그를 읽는다.)_

`yes`일 때 PR은 이슈와 같은 라벨·상태를 거치며 `gh pr` 명령을 대응해 쓴다:

- **PR 읽기**: `gh pr view <number> --comments`, diff는 `gh pr diff <number>`.
- **분류할 외부 PR 목록**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` 실행 후 `authorAssociation`이 `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, `NONE`인 것만 남긴다 (`OWNER`/`MEMBER`/`COLLABORATOR`는 제외).
- **코멘트 / 라벨 / 닫기**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub은 이슈와 PR이 번호 공간을 공유하므로 `#42`만으로는 둘 중 무엇인지 모른다. `gh pr view 42`를 먼저 시도하고 실패하면 `gh issue view 42`로 넘어간다.

## 스킬이 "이슈 트래커에 발행하라"고 할 때

GitHub 이슈를 만든다.

## 스킬이 "관련 티켓을 가져오라"고 할 때

`gh issue view <number> --comments`를 실행한다.

## Wayfinding 작업

`/wayfinder`가 사용한다. **맵(map)**은 이슈 하나이고, **자식(child)** 이슈가 티켓이다.

- **맵**: `wayfinder:map` 라벨이 붙은 이슈 하나. Notes / Decisions-so-far / Fog 본문을 담는다. `gh issue create --label wayfinder:map`.
- **자식 티켓**: 맵에 GitHub 서브이슈로 연결된 이슈 (`gh api`로 sub-issues 엔드포인트 호출). 서브이슈가 비활성화된 저장소에서는 맵 본문의 태스크 리스트에 자식을 추가하고 자식 본문 맨 위에 `Part of #<map>`을 적는다. 라벨: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). 클레임되면 담당 개발자에게 할당한다.
- **차단(blocking)**: GitHub **네이티브 이슈 의존성**이 정본이며 UI에 보인다. `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`로 엣지를 추가한다. `<blocker-db-id>`는 차단 이슈의 숫자 **데이터베이스 id**다 (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`; `#번호`나 `node_id`가 _아니다_). GitHub은 `issue_dependencies_summary.blocked_by`(열린 차단자만, 실시간 게이트)를 보고한다. 의존성을 쓸 수 없으면 자식 본문 맨 위의 `Blocked by: #<n>, #<n>` 줄로 대체한다. 모든 차단자가 닫히면 티켓이 해제된다.
- **프론티어 조회**: 맵의 열린 자식을 나열하고(`gh issue list --state open`, 맵의 서브이슈/태스크 리스트 범위), 열린 차단자가 있거나(`issue_dependencies_summary.blocked_by > 0` 또는 `Blocked by` 줄에 열린 이슈) 담당자가 있는 것을 제외한다. 맵 순서에서 첫 번째가 선택된다.
- **클레임**: `gh issue edit <n> --add-assignee @me`. 세션의 첫 쓰기 작업이다.
- **해결**: `gh issue comment <n> --body "<answer>"` → `gh issue close <n>` → 맵의 Decisions-so-far에 컨텍스트 포인터(요지 + 링크)를 덧붙인다.
