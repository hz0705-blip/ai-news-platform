---
status: accepted
date: 2026-09-27
supersedes: ADR-0010
---

# UI 화면 티켓도 Claude 사이클로 구현하고, Codex는 리서치와 계획 교차 리뷰만 맡는다

ADR-0010은 시각 품질을 이유로 `ui` 티켓의 계획·구현을 Codex에 맡겼다. 두 사이클(#20, #25)의 실측에서 그 분기는 별도 Herdr pane, 명령마다 수동 승인(`y`/`p`), Claude가 쓴 브리프 이관, Ruling 요청의 코멘트 왕복, 인계 문서의 pane ID 관리, `cycle-finish`의 워크트리 정리를 사람과 컨트롤러 양쪽에 얹었고, 사용자가 pane에 직접 개입한 흔적이 인계 문서에 남았다. 반면 시각 품질의 실체였던 ui-skills 스킬 원문은 `.codex/skills/<slug>/SKILL.md`로 저장소에 커밋돼 있어 어느 구현자든 읽을 수 있다. 이 ADR은 `ui` 티켓을 ADR-0007·ADR-0012의 Claude 사이클로 되돌린다.

- `ui` 라벨은 유지하되 의미는 "구현자 브리프에 UI 스킬 원문 경로와 적용 범위를 넣는 화면 티켓"이다. `scripts/cycle-start`는 `ui`를 더 이상 거부하지 않는다.
- 스킬 스냅샷 경로는 `.codex/skills/`를 그대로 쓴다(두 스킬이 이미 있고 경로 변경은 이 결정과 무관하다). 새 스킬 추가·갱신은 티켓 안에서만.
- Codex는 `research` 이슈와 Claude가 `codex exec -s read-only`로 넘기는 계획 교차 리뷰만 맡고 저장소를 바꾸지 않는다(ADR-0007의 원래 상태로 복귀). `AGENTS.md` "구현 분업" 절과 `project.md` "Codex 브리프 표준 문구"는 삭제한다.

## 고려한 대안

- **ADR-0010 유지**: 화면 티켓이 앞으로 늘어나는 M1·M2 구간에서 이관 비용이 티켓마다 반복된다. ADR-0010이 기대한 "다른 모델의 시각 감각"은 실측 두 건에서 `/code-review` Important 3건(타이포 스케일·불필요한 variant·컨테이너 폭)을 남겨 근거가 약했다.
- **Claude 계획, Codex 구현**: ADR-0010이 이미 기각한 대안. 이관이 하나 더 는다.
- **Claude 세션에 ui-skills MCP 연결**: 스킬 원문이 커밋돼 있어 MCP가 필요 없다. 새 스킬을 고를 때만 `npx ui-skills`를 쓴다.

## 결과

- 이관 지점은 ADR-0007과 같은 둘(`ready-for-agent` 부착, 머지 승인)로 돌아간다.
- UI 티켓의 최종 리뷰·`/code-review` 브리프에 "스펙 '화면과 경험'과 스킬 지시가 충돌하면 스펙이 이긴다"를 넣고, 충돌 지점은 PR 본문에 적는다(ADR-0010의 규칙 유지).
- 재검토 조건: Claude 구현의 `ui` 티켓 두 건에서 `/code-review`가 시각·접근성 Important를 ADR-0010 실측(3건)보다 많이 잡으면 스킬 선택 절차를 강화한다.
