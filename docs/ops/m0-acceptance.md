# M0 운영 인수 기록

스펙 "마일스톤과 인수 조건 초안" M0 운영 인수 네 항목의 증거. 값이 아닌 사실과 링크만 적고, 시크릿 값은 어디에도 적지 않는다. 에이전트가 참조할 환경 사실은 `docs/agents/project.md` "운영 환경" 절에 있다.

| 항목 | 티켓 | 사실 | 확인 수단·링크 | 날짜 |
|---|---|---|---|---|
| Vercel Hobby 비상업 조건 | #15 | Fair Use Guidelines "Commercial usage"(문서 2026-09-14 갱신): Hobby는 비상업 개인 용도만. 이 서비스는 결제·판매·광고·제휴·유료 기능·제작 대가 없음(ADR-0008) | https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage | 2026-09-19 |
| 런타임·마이그레이션 자격 분리 | #15 | GitHub 환경 `Production` 시크릿 `DATABASE_MIGRATION_URL`(직접 연결 5432) / Vercel `DATABASE_URL`(트랜잭션 풀러 6543, Production만, Sensitive). 저장소 시크릿 0 | `gh secret list --env Production`, Vercel 설정 화면 | 2026-09-19 |
| pgvector 버전·HNSW 게이트 | #16 | (미기록) | — | — |
| 야간 백업 1회 성공·복호화·체크섬·보관 기간·용량 | #18 | (미기록) | — | — |

배포 URL(#17)은 `project.md` "운영 환경"에 둔다.
