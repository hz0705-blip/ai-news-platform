---
status: accepted
date: 2026-09-17
---

# 승인된 구현 티켓은 Claude 단일 세션의 superpowers 사이클로 구현하고, Codex는 리서치만 맡는다

구현 → 테스트 → 리뷰 → 개선을 사람이 경계마다 큐를 넘기지 않고 한 사이클로 돌리기 위해, `ready-for-agent`가 붙은 구현 티켓은 Claude Code가 obra/superpowers 6.3.0(SHA `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`)의 writing-plans → subagent-driven-development → finishing-a-development-branch 순서로 맡는다. 계획 단계(grill-with-docs → to-spec → to-tickets)와 PR 이후의 `/code-review`는 기존 스킬을 유지한다. Codex는 `research` 라벨 이슈만 맡고 저장소를 바꾸지 않는다. superpowers의 유일한 강제 수단은 SessionStart 훅의 `using-superpowers` 주입이며 그 본문이 CLAUDE.md 우선을 명시하므로, 스킬 원문과 다른 규칙(완료 조건, Ruling 범위, 워크스페이스 삭제 시점, 사용하지 않는 스킬)은 `CLAUDE.md`에 두고 값은 `docs/agents/project.md`에 둔다.

## 고려한 대안

- **역할 분담 유지(Claude 계획·리뷰, Codex 구현)**: 티켓 → 구현 → PR → 리뷰 → 수정의 경계마다 사람이 두 도구 사이를 오가며 큐를 넘겨야 한다. 사이클이 자동으로 닫히지 않는다.
- **하이브리드(같은 단계에 두 방법론)**: 구현 규약이 `AGENTS.md`와 superpowers로 갈라져 리뷰 기준과 증거 형식이 둘이 된다.
- **superpowers 전체를 원문대로**: brainstorming이 `docs/spec/v1.md`와 별도의 설계 문서를 만들고, park·complete가 미해결 Critical을 안고 다음 태스크로 넘어간다. 스펙을 단일 정본으로 유지하려면 규칙을 덮어야 한다.

## 결과

- 리뷰어 스토리의 증거 경로는 티켓 → 계획 파일 → PR(Ruling·리뷰 판정·수정 회차 포함) → `/code-review` 코멘트다. 사람의 판단이 들어간 지점은 티켓의 `ready-for-agent` 부착과 머지 승인 둘이다.
- 구현자와 리뷰어가 같은 모델 계열이라는 한계는 태스크 리뷰 + 최종 리뷰 + `/code-review`의 삼중 게이트와 골든셋·리플레이·axe 같은 외부 관찰 테스트로 보완한다. 상한(태스크 수정 5회, 최종 리뷰 수정 1회 + 재검토 1회)에 닿으면 blocked로 멈춰 사람에게 돌아온다.
- 플러그인 버전은 고정되지 않으므로 사이클 시작마다 버전·SHA를 대조하고, 갱신은 원문 재검토 뒤 이 ADR과 `project.md`의 값을 함께 고친다.
- 첫 통합 사이클(M0 첫 티켓)이 끝나기 전까지 이 결정은 "설정 도입 완료, 미검증" 상태다.
