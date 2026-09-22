---
status: accepted
date: 2026-09-19
---

# UI 화면 티켓은 Codex가 ui-skills로 계획하고 구현한다

기능만큼 시각적 완성도가 중요한 화면 티켓은 ADR-0007의 Claude superpowers 사이클에서 떼어 Codex(GPT-6 Astra)가 맡는다. Codex는 `ui` 라벨이 붙은 `ready-for-agent` 티켓마다 **UI 계획**(ui-skills.com 레지스트리에서 쓸 스킬 선정, 구현 방법, 확인 방법)을 먼저 티켓 코멘트로 남기고, 그 계획대로 구현해 기능 브랜치를 push하고 PR을 만든다. Claude는 스펙·티켓 생성, PR `/code-review`, 사용자 승인 뒤 머지만 맡는다. ui-skills 스킬은 제3자 마크다운이므로 원문을 `.codex/skills/`에 스냅샷으로 커밋해 버전을 고정하고, 스펙(`docs/spec/v1.md` "화면과 경험")·`CONTEXT.md`와 충돌하는 지시는 스펙이 이긴다.

적용 대상은 #20(웹 기반)·#24·#25·#26과 이후 화면 티켓. 백엔드·워크플로·DB·파이프라인 티켓은 ADR-0007 그대로 Claude 사이클이다.

## 고려한 대안

- **ADR-0007 유지(Claude가 UI도 구현)**: 사이클은 자동으로 닫히지만 시각 품질을 끌어올릴 전용 스킬·모델을 선택할 수 없다.
- **Claude가 UI 계획, Codex가 구현**: 계획과 구현 사이에 브리프 이관이 한 번 더 생기고 스킬 선택의 근거가 구현자에게 없다. 계획·구현을 한 에이전트가 맡아 이관을 없앤다.
- **ui-skills를 Claude 세션에 설치**: 같은 스킬을 다른 모델이 쓰는 것이고 구현자 교체의 이유(시각 품질)를 충족하지 않는다.

## 결과

- ADR-0007의 "Codex는 저장소를 바꾸지 않는다"는 `ui` 라벨 티켓에서 예외다. Codex는 `ticket/<이슈번호>-<slug>` 브랜치·PR까지 만들고 `main`에 직접 커밋하지 않는다. `docs/spec/`, `docs/adr/`, `CONTEXT.md`, `CLAUDE.md`, `docs/agents/`는 여전히 수정하지 않는다.
- 사람이 Claude(티켓·리뷰·머지)와 Codex(계획·구현) 사이를 오가는 큐 이관이 화면 티켓에 되살아난다. 이관 지점은 `ready-for-agent`+`ui` 부착과 PR 생성 둘로 고정한다.
- 증거 경로: 티켓 → UI 계획 코멘트(스킬·방법·확인) → PR(스킬 스냅샷 커밋 포함) → `/code-review` 코멘트. 스킬 원문은 PR diff에 들어오므로 리뷰 대상이다.
- 스킬 레지스트리는 버전을 고정하지 않으므로 스냅샷 갱신은 티켓 안에서만 하고 갱신 이유를 PR 본문 "무엇을 남겼나"에 적는다.
- 실측 1건(#20, 2026-09-22): 첫 `ui` 티켓. Codex가 스킬 둘(`shadcn-ui/shadcn`·`wshobson/wcag-audit-patterns`)을 골라 UI 계획 코멘트 → 질문 2건(다크 버튼 색, `--accent`·`--border`·`--destructive` 토큰) → Claude Ruling → 구현·PR #37. `/code-review`에서 Important 3건(타이포 유틸이 `@theme inline` 리터럴로 굳어 데스크톱 스케일을 따르지 않음, 티켓에 없는 버튼 variant 4종, 컨테이너 폭이 스펙 76rem과 불일치)이 나왔고 수정 1회차로 모두 해소, 재검토 PASS 뒤 머지. 이관 지점 둘(라벨 부착·PR 생성)은 그대로 작동했고 그 사이 Ruling 요청이 세 번째 이관 지점으로 한 번 생겼다 — 티켓 코멘트로 묻고 답하는 경로가 실제로 쓰였다. 결정은 "도입 완료, 1건 검증"이며, 화면 내용이 있는 티켓(#24·#25·#26)에서 다시 본다.
