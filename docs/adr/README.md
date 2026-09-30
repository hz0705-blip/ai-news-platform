# 결정 기록(ADR)

되돌리기 어려운 결정을 번호순으로 둔다. 제품 결정은 0001~0006·0008·0009, 구현 절차(에이전트 사이클)는 0007 하나이며 절차가 바뀌면 새 ADR 대신 0007을 개정한다(스펙 `docs/spec/v1.md` "문서와 공개"). 각 파일 머리의 `status`가 상태의 정본이다.

| 번호 | 제목 | 상태 | 요지 |
| --- | --- | --- | --- |
| [0001](0001-overseas-english-news-only.md) | 1차 커버리지를 해외 영어 뉴스로 한정한다 | accepted | 권리가 확인된 해외 영어 출처(GNews, GDELT 링크)만 다루고 국내 언론사는 제외한다. |
| [0002](0002-rights-tier-and-excerpt-only.md) | 출처마다 권리 등급을 두고 GNews 기사는 발췌만 표시한다 | accepted | 본문 처리 + 발췌 표시 / 링크만 두 등급. 화면에는 근거 1~2문장만, 본문은 30일 뒤 삭제. |
| [0003](0003-change-as-revision-diff-and-claim-matching.md) | 변화는 개정판 차이로 정의하고 주장은 근거 겹침으로 매칭한다 | accepted | 변화는 개정판 사이의 네 종류 차이뿐이고, 주장은 근거 구간 겹침으로 개정판을 넘어 이어진다. |
| [0004](0004-no-bias-or-confidence-scores.md) | 정치 편향과 확신도 점수를 표시하지 않는다 | accepted | 점수 대신 주장마다 원문 근거와 상충 상태만 보인다. |
| [0005](0005-stack-a-and-single-openai-provider.md) | 스택 A(TypeScript 단일 런타임)와 OpenAI 단일 공급자 | accepted | Next.js·PostgreSQL + pgvector·Drizzle·pg-boss의 pnpm 모노레포, 모델은 OpenAI만. |
| [0006](0006-golden-set-two-model-cross-check.md) | 골든셋은 동일 계열 두 모델 교차 검증과 단일 어노테이터로 만든다 | accepted | 두 OpenAI 모델이 독립 작성, 불일치만 운영자 판정, 한계를 리포트에 명시. |
| [0007](0007-superpowers-single-agent-cycle.md) | 구현 티켓은 Claude 컨트롤러가 티켓 생성부터 자동 머지까지 사람 개입 없이 돌리고, 리뷰는 PR당 1회, Codex는 리서치만 맡는다 | accepted | 티켓마다 워크트리·구현자 하나·리뷰 1회, 비민감은 자동 머지. 규칙은 `CLAUDE.md`. |
| [0008](0008-seoul-hosting-daily-recovery.md) | 서울 배치 호스팅(Vercel Hobby + Supabase Pro)과 일일 복구 지점 | accepted | 웹 Vercel `icn1`, DB Supabase 서울, 워커 Railway 싱가포르. RPO ≤ 24시간, PITR 없음. |
| [0009](0009-claim-level-status-derived-story-status.md) | 상충 상태는 주장 개정판에 저장하고 사건 상태는 파생한다 | accepted | 상태의 권위는 주장에 있고 사건 배지는 같은 트랜잭션의 결정론적 집계다. |
| [0010](0010-ui-tickets-codex-with-ui-skills.md) | UI 화면 티켓은 Codex가 ui-skills로 계획하고 구현한다 | superseded by [0007](0007-superpowers-single-agent-cycle.md) | UI 티켓을 Codex에 맡겼던 결정. 지금은 0007의 같은 사이클로 구현한다. |

파일명은 처음 만든 때의 이름을 유지한다(0007의 `superpowers-single-agent-cycle`은 개정 전 이름이며 내용은 제목을 따른다).
