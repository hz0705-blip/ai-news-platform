# M0 운영 인수 기록

스펙 `docs/spec/v1.md` "마일스톤과 인수 조건 초안" M0 운영 인수와 이슈 #15·#16·#18의 기록. 근거는 ADR-0008.

**기록 방식.** 사용자는 계정·자격을 만들고, Claude가 묻고 확인한 사실만 여기에 적는다. 확인 수단은 `gh secret list`(이름만), 대시보드 화면 확인(브라우저), 사용자 답변 중 하나이며 항목마다 어떤 수단이었는지 남긴다. **값이 아닌 사실만 적는다.** 연결 URL, 키, 토큰 등 시크릿 값은 이 문서와 이슈 코멘트 어디에도 적지 않는다.

## 확인된 사실

### Supabase (#15) — 2026-09-19, Aside 브라우저로 대시보드 화면 확인

| 항목 | 사실 |
|---|---|
| 요금제 | 조직 Pro(사용자가 사전 결제). 컴퓨트 Micro(1 GB 공유) |
| 프로젝트 | 이름 `ai-news-platform`, ref `dhmwspzugsxrahzkggxx` |
| 리전 | Northeast Asia (Seoul), `ap-northeast-2` |
| PostgreSQL | `17.6.1.166` |
| pgvector | 확장 목록에 `0.8.2` 표시, 아직 활성화하지 않음(활성화·HNSW 게이트는 #16) |
| 일일 자동 백업 | 활성, 보관 7일(Pro) |
| 연결 방식 | Direct connection 5432(`…supabase.co`) / Transaction pooler 6543(`…ap-northeast-2.pooler.supabase.com`) 둘 다 제공됨. 자격 분리(런타임=풀러, 마이그레이션·백업=직접)는 시크릿 등록 시 적용 |
| DB 비밀번호 | 생성 시 Supabase 자동 생성 값 사용. 비밀번호 관리자에 저장되지 않았으므로 시크릿 등록 시 대시보드에서 재설정해 등록한다(값은 브라우저 안에서만 다룸) |

### Vercel Hobby 비상업 조건 (#15) — 2026-09-19, 공식 문서 원문 확인

- 출처: Vercel Docs "Fair Use Guidelines" › Commercial usage (https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage, 문서 last_updated 2026-09-14, 접근 2026-09-19). 같은 내용이 "Vercel Hobby Plan" 문서(https://vercel.com/docs/plans/hobby, last_updated 2026-09-14)에도 있음.
- 원문 요지: "Hobby teams are restricted to non-commercial personal use only. All commercial usage of the platform requires either a Pro or Enterprise plan." 상업 이용의 정의는 프로젝트 제작에 관여한 누군가의 금전적 이득을 위한 배포이며, 예시로 방문자 결제 요청·처리, 상품·서비스 판매 광고, 사이트 제작·유지·호스팅 대가 수령, 제휴 링크가 주목적, 광고(Google AdSense 등) 포함을 든다. 기부 요청은 상업 이용이 아니다.
- 이 서비스의 준수 선언: 채용 지원용 포트폴리오로 결제·판매·광고·제휴 링크·유료 기능·제작 대가 수령이 없다. 조건이 바뀌면 Vercel Pro로 전환하고 예산을 재산정한다(ADR-0008, 스펙 "배포와 운영").

### Vercel 프로젝트 연결 (#15) — 2026-09-19, Aside 브라우저로 화면 확인

| 항목 | 사실 |
|---|---|
| 계정·팀 | Vercel 팀 `hz`(URL 슬러그 `hz23`), 요금제 Hobby(무료). 결제 정보 없음 |
| GitHub 앱 | Vercel GitHub App을 GitHub 계정 `hz0705-blip`에 설치, 접근 범위 "Only select repositories" = `hz0705-blip/ai-news-platform` 1개(사용자가 GitHub sudo 이메일 인증 뒤 직접 설치) |
| 프로젝트 | `ai-news-platform`(https://vercel.com/hz23/ai-news-platform), Git 저장소 `hz0705-blip/ai-news-platform`, 프로덕션 브랜치 `main`, Root Directory `apps/web`, Framework Preset Next.js, Node.js 24.x |
| 프로덕션 도메인 | `ai-news-platform-six.vercel.app`(Vercel 자동 부여. 서비스 이름·도메인은 M4·M5에서 확정) |
| 함수 리전 | Seoul `icn1`로 설정·저장(Hobby에서 설정 가능함을 확인) |
| 첫 배포 | 실패(예상됨). 사유: `apps/web`에 `next` 의존성이 없어 Next.js 버전을 감지하지 못함. 배포 성공은 #17의 인수 조건 |
| 환경변수 | 임포트 시 추가하지 않음(아래 시크릿 절에서 등록) |

### 시크릿·환경변수 (#15) — 2026-09-19

값은 적지 않는다. DB 비밀번호는 등록 직전에 Supabase 대시보드에서 재설정했고, 값은 Aside 브라우저 안에서 대상 입력란에만 넣었다(비밀번호 관리자 저장은 하지 않음. 필요하면 대시보드에서 다시 재설정).

| 이름 | 위치 | 환경 | 용도 | 확인 수단 |
|---|---|---|---|---|
| `DATABASE_MIGRATION_URL` | GitHub 환경 시크릿, 환경 이름 `Production`(보호 규칙 없음) | 프로덕션 | 마이그레이션·백업. Supabase 직접 연결(5432) | `gh secret list --env Production` (2026-09-19T02:45Z 등록) |
| `DATABASE_URL` | Vercel 프로젝트 환경변수, Sensitive | Production만(Preview·Development 미체크) | 웹 런타임. Supabase 트랜잭션 풀러(6543) | Aside 브라우저(Vercel 설정 화면) |
| `BACKUP_ENCRYPTION_KEY` | (미등록) | — | 백업 아티팩트 암호화. 키 형식을 #18이 정한 뒤 GitHub 환경 `Production` 시크릿으로 등록 | — |

- 저장소 시크릿(repository secret)은 0개. 자격은 환경 시크릿에만 둔다.
- 프리뷰 환경 자격은 아직 없다. 프리뷰는 프로덕션 DB 자격을 쓰지 않는다는 스펙 규칙에 따라 `DATABASE_URL`을 Production에만 두었고, 프리뷰용 격리 자격은 필요해질 때(#17 이후) 별도 결정한다.
- 결정(기록): 워크플로는 `environment: Production`을 선언해야 이 시크릿을 읽을 수 있다(#16·#18 브리프에 전달).

### 로컬 실행 (#15) — 2026-09-19

- `.gitignore`가 `.env`, `.env.*`를 무시하고 `.env.example`만 추적 허용한다(14~16행). 현재 로컬 `.env*` 파일은 없다. 로컬 URL이 필요해지는 #16에서 `.env.example`(키 이름만)과 미추적 `.env`를 만든다.

## 기록 이력

| 날짜 | 무엇 | 확인 수단 |
|---|---|---|
| 2026-09-19 | 문서 생성. #15 미착수 상태 확인(시크릿 0, 환경 0, Vercel 미연결) | `gh secret list`, `gh api repos/{owner}/{repo}/environments` |
| 2026-09-19 | Supabase 프로젝트 생성·설정 확인 | Aside 브라우저(대시보드 화면) |
| 2026-09-19 | Vercel Hobby 비상업 조항 원문 확인·준수 선언 | Vercel 공식 문서 WebFetch |
| 2026-09-19 | Vercel GitHub App 설치 범위 확인(저장소 1개) | Aside 브라우저(github.com/settings/installations) |
| 2026-09-19 | Vercel 프로젝트 임포트·리전 설정·첫 배포 결과 확인 | Aside 브라우저(Vercel 대시보드) |
| 2026-09-19 | DB 비밀번호 재설정, GitHub 환경 `Production` + `DATABASE_MIGRATION_URL`, Vercel `DATABASE_URL`(Production) 등록 | Aside 브라우저 + `gh secret list --env Production` |
