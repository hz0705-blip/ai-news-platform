# Kakao and Google authentication, abuse controls, and minimum legal pages

## 요약

- 최신 스펙을 정본으로 삼아 Q1–Q7 순서로 조사했고, M4의 인증·인앱·삭제 절차를 상세히 정리했다.[1]
- 개인 비즈 앱 전환은 가능하다. Supabase의 이메일 생략 안내와 공개 코드의 기본 scope가 달라 실제 요청 검증이 필요하다.[10][14][50]
- 로그인은 팔로우·마지막으로 본 개정판에만 필요하고, 공개 사건·주장·근거 캐시에 인증 상태를 넣지 않는다.[1][36][37]
- Google 로그인은 KakaoTalk·NAVER의 임베디드 화면에서 외부 브라우저로 먼저 전환하며, 실기기 검증은 미실시다.[18][19]
- E2E는 로컬 Supabase의 테스트 계정과 실제 SSR 쿠키를 사용하고 Kakao·Google을 호출하지 않는 방식을 제안한다.[42][43][46]
- 삭제 API·연결 해제·재시도 절차를 정리했으며, 연쇄 삭제 순서와 임시 자격·백업 보존의 충돌은 인터뷰 질문으로 남겼다.[1][41][47][48]
- Hobby 방화벽 1개 규칙에 DB 제한기·필요 시 Turnstile을 결합하는 시작 정책과 비용 추정·실측 절차를 제시했다.[51][54][61]
- 개인정보·출처 표기 개요는 고정 보존 정책을 따르며, Hobby DPA와 GNews 해지 후 폐기 범위는 추가 확인이 필요하다.[1][75][76][88]
- 키·실기기가 없어 실서비스 실측을 주장하지 않으며, “설계된 시나리오, 가상 출처”와 “기계 번역, 참고용” 표기를 유지한다.[1]

## Scope

Research date: **2026-09-19 (KST)**. This is issue #8's research deliverable, not implementation or final legal text. Authority order: the user's 2026-09-19 focus and current spec, then project/glossary, then brief and earlier research. The spec overrides the brief's older context and project.md's stale hosting-pending sentence. Fixed: Vercel Hobby icn1, Supabase Pro Micro Seoul, Supabase Auth Kakao/Google, Next.js 16 Cache Components, guest reading/search, no profiling or monetization, and the stated retention/deletion policies.[1][2][3][8][9]

Question order is Q1–Q7; depth prioritizes Q1/Q3/Q2/Q4 for M4, then the Q5 initial abuse policy and Q6/Q7 M5 outlines. Prior research 02/03/04/05 is reused only for relevant guest-first, auth, privacy and rights findings, with fresh primary-source checks; superseded local personalization, alternative auth stacks and old rendering advice are not revived.[4][5][6][7]

No GNews/OpenAI/Supabase credentials or real-device test access were available for this run, as specified by the user. No provider/API benchmark, OAuth round trip, reviewer approval, deletion, performance result or device PASS is claimed. Numeric policy thresholds are **proposals**; costs are **documentation-based arithmetic estimates**. Future procedures specify inputs/actions/recording/selection criteria and do not assert that scripts already exist. Live documents were accessed on the date above; historical posts are identified as historical evidence, not current device certification.[1][8]

Only this file is the deliverable. Per the user's explicit override, no gh command, issue comment, commit/push, application code or other repository-file edit is part of this run; Claude handles the comment and commit.[8][9]

## Findings

### Q1. Kakao Login requirements — checked 2026-09-19

#### Eligibility, registration, and review

**An individual without a business-registration number can obtain an individual-developer Biz App.** The documented route is owner identity verification in developer-account settings, acceptance of Kakao Business integrated terms, then **App → General → Business information → Individual developer Biz App**. Register an app icon. This classification does not require adding advertisements, sponsorship, payments, or a business channel; an individual Biz App cannot connect a business channel without business information. The project's non-commercial hosting constraint remains unchanged.[10][1]

Create the developer app with accurate service name, icon, owner/company identification, category, and representative domain; these identify the service in consent screens. Enable Kakao Login, then configure the REST API key and its client secret, consent items, and callback. Use the existing service app if one already exists.[11][12]

| Item | Verified requirement and project implication |
|---|---|
| `profile_nickname` | Required/optional/in-use consent is available by default; Biz App verification is not required for this scope.[13] |
| `profile_image` | Also available by default, but unnecessary for follows and last-seen tracking; proposal: do not request it.[13][1] |
| `account_email` | All three consent modes require a Biz App or test app; Biz status is sufficient for this scope, whereas additional personal-information scopes have separate permission requirements.[13] |
| Individual Biz conversion timing | The current self-service instructions publish no review turnaround or guaranteed completion time. Treat it as a configuration prerequisite to verify, not a promised one-/three-day approval.[10] |
| Kakao Sync/privacy review timing | Kakao's business guide estimates about **1–3 days** for additional personal-information review and **3–5 business days** for business-channel review. These are different processes and are not the individual Biz conversion SLA; neither is needed merely to add basic social login.[11][13] |

**Date-check of research 03:** the current Supabase guide describes an email-less Kakao setting. However, its public Auth provider source still initializes `account_email`, `profile_image` and `profile_nickname`, and appends supplied scopes. The guide therefore does not establish that the hosted authorization request omits email. Verify the deployed behavior; a non-Biz app is not yet a proven fallback.[14][50][5]

**Proposal:** minimize scopes only through a verified supported configuration; `options.scopes` is not documented by this source as replacing defaults. Capture the outgoing scope list and hosted Auth version/configuration. Do not invent email addresses or a profile table. Use the authenticated user ID for ownership; matching nicknames must never merge Kakao and Google identities.[50][1]

If individual Biz conversion fails, test the documented email-less setting against the actual outgoing scopes. If it works, retain both fixed providers; if not, M4 remains blocked pending provider clarification. Guest reading remains available. Do not silently remove Kakao or change auth systems.[14][50][1]

#### Callback and test-app boundaries

Kakao permits at most **10 redirect URIs**, HTTP/HTTPS only, with an exact protocol/host/path/trailing-slash match; mismatches produce `KOE006`. Wildcard domains require Biz status. Register the **Supabase** callback, `https://<project-ref>.supabase.co/auth/v1/callback`, in Kakao; the application's `/auth/callback` belongs in Supabase's redirect allowlist. Those are two different redirect hops.[10][14]

Test apps require a Biz parent; up to **five test apps per parent**, usable only by their registered members. The current public documentation says a separate member limit applies but does not state its number. **No numeric pre-verification user limit was verified.** Do not misreport the five-app limit as five users, or equate an ordinary basic app with a members-only test app.[10]

Implementation verification task: capture app classification, consent settings, invite/member-limit UI, and quota UI with secrets masked; test one member and one explicitly consenting non-member against the correct app. Record result/error and whether a restriction concerns login, a privileged scope, or a test app. If the numeric limit is absent, obtain a dated answer from Kakao support with the app ID; do not stress-test by creating accounts.[10][15]

#### Tokens, logout, and unlink

| Credential/action | Current documented behavior |
|---|---|
| Kakao REST access token | Six hours; SDK variants differ: JavaScript two hours, Android/iOS twelve hours.[16] |
| Kakao refresh token | Two months; renewable when one month remains, with the old refresh token invalidated when a new one is issued.[16] |
| Kakao ID token | Same expiry as its access token; requires OpenID Connect.[16] |
| Service logout | `POST https://kapi.kakao.com/v1/user/logout` invalidates Kakao service tokens. This is distinct from deleting the service account or unlinking consent.[16] |
| Kakao-account browser logout | `GET https://kauth.kakao.com/oauth/logout`, with a registered logout redirect URI, includes the Kakao account's browser session.[12][16] |
| Unlink | `POST https://kapi.kakao.com/v1/user/unlink` revokes consent and tokens. Supports a user access token or server-held admin key plus `target_id_type=user_id` and the Kakao user ID.[17] |

Kakao token expiry is not the Supabase session lifetime. New REST keys have client-secret protection enabled by default; configure Supabase's Kakao secret accordingly. Read token-response expiry fields during the smoke test, rather than hard-coding a sample payload's lifetime. Email fields can be absent; if email is requested, check actual validity/verification fields instead of treating consent alone as verified identity.[17][14]

**Unperformed measurement procedure:** prerequisites are an isolated Supabase project, Kakao app credentials, an allowlisted HTTPS callback, and consenting tester accounts. No keys are available in this run. Start sign-in with `supabase.auth.signInWithOAuth({ provider: 'kakao', options: { redirectTo: APP_ORIGIN + '/auth/callback' } })`; inspect the authorization request's requested scopes, follow both redirect hops, and exchange the callback code with the SSR client. Run: fresh consent; returning user; denied optional email; no-email configuration; denied login; mismatched callback; unlink/rejoin. Record app/provider configuration, date, elapsed time, error code, identity/provider-ID presence, email-present boolean, session-cookie attributes, and successful authenticated follow persistence. Never retain authorization codes, secrets, tokens, or full profile payloads in the report. Pass only when absent email does not prevent valid account creation and callback failures cannot create a partial logged-in state. This is a proposed procedure, not a completed test.[14][17][1]

### Q2. Supabase Auth in the Next.js App Router

**Date-check of research 03.** Supabase Auth and server-only privileged credentials remain valid; its generic cookie/ISR advice must be specialized for the fixed Next.js 16 Cache Components design. The current SSR package remains labelled beta. The release page lists `@supabase/ssr 0.12.7` (2026-09-08), including earlier 2026 fixes for PKCE verifier removal and refresh headers; pin and test the installed version rather than copying an old helper example. No blanket claim that “2026 has no breaking changes” is justified.[1][5][29][30]

#### Provider setup and session boundary

| Boundary | Implementation proposal / verified API |
|---|---|
| Kakao | Follow Q1; configure the REST API key/client secret in Supabase, the Supabase callback in Kakao, and the application callback in Supabase. Verify the deployed provider's email-less setting and outgoing scopes before exposing login.[14][50] |
| Google | Create a Web application OAuth client; configure audience/branding, app origin, and exact Supabase `https://<ref>.supabase.co/auth/v1/callback` redirect. Put client ID/secret in Supabase. Documented base scopes are `openid`, email and profile; request no Drive/Gmail scopes. Provider metadata can consequently contain email/name/avatar even if the application has no profile table.[31] |
| Application callback | `signInWithOAuth({provider, options:{redirectTo: APP_ORIGIN + '/auth/callback'}})`; exchange the returned code through `exchangeCodeForSession(code)` in a Route Handler, preserving all response cookies. Provider callback and application callback are different hops.[31] |
| Redirect safety | Use exact production allowlists. Proposed validation: parse a destination against a configured origin; require the same origin and an allowlisted path; reject protocol-relative URLs, backslashes, encoded bypasses and untrusted forwarded hosts. Carry only a Story/Topic ID and intended follow action, never tokens, in return context.[32] |
| Clients | Browser: `createBrowserClient`. Server: per-request `createServerClient` with `cookies.getAll/setAll`; never a module-global user client. Next.js 16 uses `proxy.ts`; Server Components cannot persist refreshed cookies, so the Proxy forwards them to the request and response. Preserve the final response from `setAll`.[33] |
| Validation | `getClaims()` verifies JWT identity; `getSession()` alone does not authorize. Use `getUser()` when current server-side account existence matters, plus session validation for deleted/revoked sessions as Q4 describes.[34][35] |

The SSR adapter must copy the cache headers passed as the second `setAll` argument (documented since 0.10.0), as well as every cookie, including chunks/removals. Authentication callbacks, refresh, logout and account responses must be `Cache-Control: private, no-store`. A cached `Set-Cookie` can authenticate another visitor as the wrong user. The advanced guide still offers legacy `force-dynamic` advice; do **not** copy that route option into this spec's Cache Components model.[36][1]

#### Public-cache isolation and authorization proposal

Keep Today/Story cached functions restricted to public arguments: language, Topic, publication key, Story, Revision and display-policy version. Do not close over a user client, cookie, access token, follow flag or last-seen value. Read request data outside `use cache`; keep personalized controls in a request-time Suspense region or a separate private endpoint. Follow caches only its public shell; Search remains uncached and streamed. Configure the refresh matcher around auth/private routes; refresh personalized controls through their private boundary rather than adding `Set-Cookie` to a publicly cached response. This is a proposed composition of the fixed spec and documented cache constraints.[1][37][38]

Treat every Server Action/Route Handler as directly callable: validate input, verify identity there, derive the owner ID from verified auth, and authorize the specific mutation. An authenticated layout or Proxy check is not sufficient. Revalidate only the caller's private UI after a follow; never invalidate a shared cache with private payload.[39]

Use user-scoped Supabase requests and ownership RLS for follows/last-seen (`USING` and `WITH CHECK`), with no anonymous grants. If the fixed Drizzle runtime performs direct SQL instead, a database connection does **not** inherit the browser JWT: use a restricted runtime role and explicit verified-owner predicates, and test that actual path. RLS cannot protect a service-role/BYPASSRLS query. Keep admin credentials in a separate server-only client used solely for administration.[40][1]

Do not create a profile table or copy provider email/avatar/nickname into application tables; avoid selecting them into UI/logs. Supabase Auth's identity records and operational credentials remain personal data that the privacy inventory must describe. Standard browser-capable Supabase SSR sessions need JavaScript-readable auth cookies; copying research 03's generic “all session cookies HttpOnly” rule would break that model. Use HTTPS, appropriate SameSite settings and XSS controls; the separate abuse cookie can be HttpOnly.[1][5][35][41]

#### Test-auth decision and executable future procedure

**Recommendation:** local Supabase CLI Auth + confirmed email/password test users + cookies produced by the real `@supabase/ssr` adapter, in both PR CI and local E2E. This exercises real JWT validation, refresh and authorization without Kakao/Google. Docker and pinned CLI/Auth images add setup time but keep provider availability and cloud quotas out of CI.[42][43][44]

| Option | Trade-off and placement |
|---|---|
| Local email/password users + SSR cookie injection | Preferred CI/local combination; real Auth and RLS, provider redirect/consent still requires manual testing.[42][43][44] |
| Hosted isolated test project, email/password | Useful optional deployment smoke; credentials/network/quotas and drift enter CI. Never reuse production users or secrets.[42][43] |
| Handwritten/fake session cookies | Fast, but may bypass JWT, chunking and refresh behavior; reject as the main E2E mechanism. Let the pinned SSR library serialize genuine local sessions.[33][34] |
| Custom test-only OAuth provider | Can exercise callback/PKCE end to end, but requires maintaining an OAuth/OIDC service. Reserve for a specific callback coverage gap, not the initial test seam.[45] |

Implementation-ticket procedure, **not executed in this research**:[1][42][43][44][46]

1. Inputs: pinned Node 24/pnpm/CLI/SSR versions, Docker runner, committed local Auth config, migrations, deterministic Demo Stories, and separate local users A/B per parallel worker. Enable email/password only in the isolated test environment; disable Kakao/Google there. Apply application migrations with the repository's eventual migration command, not an invented existing script.
2. Run `pnpm exec supabase start`; read local connection credentials without printing them to artifacts. Run the eventual seed helper using `auth.admin.createUser({email,password,email_confirm:true})`. The service credential stays in the Node test setup process.
3. A Node fixture builds `createServerClient(localUrl, publishableKey, {cookies:{getAll,setAll}})` over an in-memory cookie jar; call `signInWithPassword({email,password})`. Capture all adapter-generated cookies, map cookie options to Playwright's schema and the exact application origin, and inject with `browserContext.addCookies(...)`. Do not invent a `sb-...` cookie name, manually encode a JWT, or inject only localStorage into an SSR app.
4. For “follow → login → return,” navigate the real guest UI to its login gate; substitute the provider boundary by running that same fixture and resume the validated destination. Explicitly record that consent/callback behavior is not proven by this test. Test callback errors and invalid return URLs with deterministic inputs separately.
5. Run `pnpm build` and `pnpm test:e2e` once the repository supplies those scripts; use the production build. A request allowlist must cover both browser and Node/server outbound traffic; fail on Kakao/Google OAuth hosts, with no production provider credentials in CI.
6. Assert observable outcomes: A cannot read/change B's follows; guest last-seen stays absent; expired real local sessions refresh; logout/deletion prevents private access; two browser contexts never share identity; shared Today/Story responses and cached segments contain no identity/personalized state or `Set-Cookie` (private request-time controls may contain only the caller's state); Search is no-store; follow survives revisit. Keep one account per mutating worker; treat storage-state files as secrets and do not commit/upload them.
7. Record build/package/image versions, commands and exit codes, passed/failed scenarios, timings and redacted traces. Run provider smoke and Q3 real-device matrix manually in an isolated staging configuration; never count browser UA emulation as real-device evidence.

### Q3. KakaoTalk and NAVER in-app browsers — checked 2026-09-19

#### Compatibility decision table

Google documents `disallowed_useragent` for embedded authorization and recommends a supported browser/system browser surface. A modern engine alone does not make an embedded WebView eligible. Kakao explicitly documents its own in-app login integration. The following table is a **documentation-based routing policy**, not a real-device pass report.[18][19][13]

| Launch surface | Kakao login | Google login | Proposed UI/routing |
|---|---|---|---|
| iOS Safari / Android Chrome, supported engine | Normal hosted redirect flow expected; project smoke test pending.[14] | Normal browser flow expected, subject to account/provider configuration.[18] | Offer both providers; start and finish OAuth in the same browser. |
| KakaoTalk iOS WebView | Kakao documents an in-app flow; test the hosted Supabase redirect chain.[13][14] | Do not run embedded Google authorization; hand off first.[18][19] | Kakao may continue in-app after device verification; Google opens the handoff screen. |
| KakaoTalk Android WebView | Same supported Kakao path; device/app/engine test required.[13][14] | Same embedded restriction.[18][19] | Same; Android intent is an additional best-effort handoff. |
| NAVER iOS embedded WebView | Generic Kakao web redirect is a candidate, but no first-party guarantee for this exact host/Supabase combination was found.[14][22] | Treat as embedded; hand off.[18][19] | Until measured, offer external-browser login for both; enable in-app Kakao only after its matrix passes. |
| NAVER Android system/custom WebView | Generic Kakao web redirect requires verification for each NAVER engine variant.[14][21] | Treat embedded variants as blocked; do not infer support from a Chrome-like UA.[18][19] | Same; measure actual engine independently of Android/NAVER version. |
| A host that actually opens a system browser/custom browser surface | Re-evaluate as that surface, not by the originating app's name.[18] | Supported browser surface can differ from an embedded WebView; verify the actual surface.[18] | No universal “all in-app browsers fail” assertion. |
| Engine below Chromium 111 / WebKit 16.4 / Firefox 128 | Outside project support.[1] | Outside project support.[1] | Show only the spec's update/external-browser notice; reading and login are not guaranteed below the engine floor. |

Kakao's optional `prompt=none` mechanism is specifically for already-linked users inside KakaoTalk; a non-member returns `consent_required`. Proposal: start authentication only after a login/follow action. Do not run automatic provider sign-in on every anonymous article view; handle consent-required/cancelled flows by returning to an anonymous readable page.[13][1]

#### Detection rules and their limits

Use `/KAKAOTALK/i` for KakaoTalk, based on Kakao's documented marker. For NAVER use `/NAVER\s*\((?:inapp|higgs)\s*;\s*search\s*;/i`: NAVER's guides show both spacing variants, iOS `inapp`, and Android `inapp`/`higgs`. Example fragments are `KAKAOTALK/10.8.3 (INAPP)` and `NAVER(inapp; search; 620; 10.10.2; XR)`. These are historical documentation examples, not tested/current app versions.[13][21][22]

UA matching is a UX hint, never an authorization boundary. Kakao support confirmed a historical path where `target="_blank"` navigation removed its marker; retain an always-accessible “open in browser / copy link” fallback even when detection misses. Do not claim a negative match proves an external browser or spoof UA to bypass Google.[20][19]

**Proposed engine classification:** record both the raw UA and the inspected runtime. For Android distinguish `Chrome/<major>` from NAVER's host/version fields; for WebKit inspect the OS/runtime mapping rather than interpreting `AppleWebKit/605.1.15` as Safari 605 or app-version evidence. Unknown engine stays “unverified,” never auto-PASS. The M4 matrix must validate Chromium ≥111, WebKit ≥16.4, or Firefox ≥128 using the actual rendering surface, including a notice check below the floor.[1][21][13]

#### External-browser handoff: supported syntax versus unverified host behavior

| Host / OS | Candidate and assurance level | Required fallback |
|---|---|---|
| KakaoTalk iOS and Android | `kakaotalk://web/openExternal?url=<percent-encoded-HTTPS-landing-URL>` is an observed scheme in Kakao's support forum, **not a documented supported Developers API**. Staff did not guarantee it; an August 2026 report still described failures and was referred to the KakaoTalk department.[23][24] | A user-tapped attempt, then app-menu guidance and a copyable HTTPS landing URL. Do not auto-loop on page load. |
| KakaoTalk or NAVER Android | `intent://<host>/<path>#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=<encoded-HTTPS-fallback>;end` follows Android intent syntax. Chrome documents gestures/fallbacks, but that does **not** certify that either host WebView will dispatch it.[25] | User gesture only; Chrome may be missing or disabled. Show copy/open-menu instructions if blocked. |
| NAVER iOS | No official generic external-browser escape scheme was verified in the reviewed NAVER guide. Its documented `naversearchapp://inappbrowser?...` opens NAVER's own browser and is **not** an escape for Google OAuth.[26] | App-menu “open externally” if available in that version; otherwise copy URL and open Safari/default browser manually. Record exact menu labels in device testing. |
| NAVER Android | Same absence of a verified NAVER-specific escape contract; intent is an optional tested optimization.[26][25] | Manual external opening/copy remains the acceptance path. |

Do not present `x-safari-*`, `googlechrome://`, universal links, or a timer redirect as a guaranteed cross-host solution; this research verified none as a universal escape. The web app cannot impose the native host's WebView delegate behavior. This is a deliberately bounded compatibility conclusion, with host-device measurement still required.[23][24][25][26]

**PKCE handoff rule (proposal):** open a clean, same-origin HTTPS login landing URL in the external browser **before** calling Supabase sign-in; create the PKCE verifier and complete the callback there. Never move a half-finished authorization URL/code/token to another browser. Separate browser storage can break verifier continuity. Carry only an allowlisted internal return path and non-sensitive pending action; finish the follow after fresh authentication/confirmation. Do not assume login in Safari also authenticates the original KakaoTalk/NAVER WebView.[14][27]

#### M4 real-device measurement procedure

No real devices or configured provider credentials were exercised. The following matrix is an **implementation acceptance procedure**, not observed compatibility. It expands the spec's oldest-supported/current device requirement without inventing a phone inventory.[1]

| Physical device slot | Selection criterion | Host runs |
|---|---|---|
| iOS minimum | Physical iPhone on the oldest supported runtime meeting WebKit 16.4; record whether installable KakaoTalk/NAVER builds still exist. If unavailable, record the coverage gap explicitly. | KakaoTalk + NAVER + Safari control |
| iOS current | Physical current device/current stable OS and app versions on execution date. | Same three |
| Android minimum | Oldest project-supported physical device with actual Chromium engine ≥111; verify system and NAVER custom engine separately. | KakaoTalk + NAVER + Chrome control |
| Android current | Physical current device/current stable OS/apps and installed WebView provider. | Same three |

For every host/provider pair run fresh user and returning user; consent refusal; cancel/back; browser restart; expired Supabase session; missing email; handoff blocked; Chrome absent/disabled where applicable; duplicate callback; and unlink/rejoin. Use a canonical share link into a designed Demo Story, then follow → login → return → follow persists → read a later Revision → last-seen comparison. Keep the pre-login experience anonymous. Test the actual production build and isolated provider configuration, not a mobile viewport pretending to be KakaoTalk.[1][14]

Inputs/commands: load a diagnostic page that displays `navigator.userAgent` and runtime feature probes; on Android record `adb shell getprop ro.build.version.release`, `adb shell dumpsys webviewupdate`, and `adb shell dumpsys package com.kakao.talk` / `com.nhn.android.search` version fields where those package IDs are installed; confirm IDs via the device package listing before use. On iOS record Settings → General → About and installed app versions, with Safari Web Inspector if the host permits inspection. These commands are proposed collection steps and have not run here.[28][1]

Record device model, OS build, host app build, full UA, engine/provider version and evidence, provider/scopes, entry link, every redirect origin, cookie presence/attributes (no values), success/error, return destination, preserved pending action, elapsed seconds, fallback used, and screenshot/video timestamp. Mask account identifiers; never publish HAR secrets. For each cell run at least three clean starts and report `passed/attempted`, not an unsupported percentage claim. Acceptance: both fixed providers reach a valid service session through the selected route, guest reading remains usable after every failure, and the supported path survives cancel/back/retry. If a minimum-device cell is untested, M4 remains incomplete rather than “probably supported.”[1][14][18]

### Q4. Anonymous-first accounts and deletion mechanics

Guest reading/Search creates no anonymous Supabase Auth user and stores no last-seen revision in cookies/localStorage. Prompt only at an explicit follow or “since I last read” action, return to the same Story/Revision, and allow cancellation back to reading. This preserves the useful guest-first principle in 02/05 while discarding their superseded personalization/local-save suggestions.[1][4][7]

#### The APIs do different jobs

| Operation | Verified behavior and implication |
|---|---|
| Supabase logout | Ends the affected Supabase sessions; an already issued JWT can remain cryptographically valid until expiry. It is neither provider unlink nor account deletion.[35] |
| Supabase hard deletion | Server-only `auth.admin.deleteUser(userId, false)`, using a privileged key. Explicitly choose hard deletion; soft deletion leaves a hashed identifier. Do not expose this client to browsers.[47] |
| Application data | Supabase recommends FK references to `auth.users` with `ON DELETE CASCADE`; that cascade fires during auth deletion. User-owned Storage objects can prevent deletion; this app should not introduce avatar uploads.[41] |
| Kakao unlink | Server `POST https://kapi.kakao.com/v1/user/unlink`; use the user's bearer token or Admin key plus `target_id_type=user_id&target_id=<Kakao ID>`. Persist the provider ID needed by the deletion job before destroying auth identities. Logout alone is insufficient.[17] |
| Google revoke | `POST https://oauth2.googleapis.com/revoke`, form field `token=<provider access or refresh token>`; a Supabase JWT is not a Google token. Success is HTTP 200; errors need classification, and full effect can be delayed. Revocation affects the grant across clients/scopes of that Google project.[48] |
| Provider-token custody | Supabase does not persist provider tokens in its database or refresh them for the application. Google refresh tokens require `access_type=offline` and usually renewed consent. Deleting the auth user first without preserving a revocation credential can make automated Google unlink impossible.[49][31] |

#### Proposed deletion job, preserving the mandated order

The following is a **procedure proposal**, with the two unresolved storage/ordering interpretations explicitly escalated under Open questions. It does not substitute “disable account” for hard deletion or silently move provider revocation ahead of auth deletion.[1][47][48]

1. **Receive and authenticate.** POST a same-origin deletion request, verify current user and recent authentication, confirm consequences, and bind a random idempotency key to that user. Reject a client-supplied target user ID. Mark private writes unavailable while the request is pending. If a Google token is missing/expired, obtain a fresh same-account Google authorization while identity still exists; verify the returned subject against the account being deleted. An inability to reauthorize must go to an owner-assisted path rather than abandoning the request.[39][48][49]
2. **Prepare before destruction.** In a transaction, create a server-only outbox entry containing deletion request ID, provider/subject identifiers, per-step state, deadline and only the credentials required for revocation. Capture **every linked identity**, not just the most recent login. If approved, encrypt the temporary Google refresh credential with a key outside the database; exclude payloads from logs, telemetry and routine account exports. This bounded operational record needs the owner decision below because “only follows + last-seen” must not be silently expanded.[1][49]
3. **Delete auth user.** Call `deleteUser(id, false)`; durably record success. On timeout, inspect whether the old auth ID still exists before retrying. A confirmed already-absent user is success for this step; a generic 401/403 or network error is not. Never recreate the deleted identity for a retry.[47]
4. **Unlink provider(s).** Execute Kakao unlink with the captured Kakao ID/Admin key, and Google revoke with the captured provider token. Persist each provider's status independently. Prefer revoking a captured usable Google refresh token directly. An expired access token cannot produce a missing refresh token; capture valid revocation credentials before Auth deletion, or leave the missing-credential case visibly unresolved. Kakao's explicit already-unlinked/nonexistent target response can be terminal only after checking the documented code and target; do not classify all failures as success. Google `invalid_token` alone does not prove the entire provider grant was removed.[17][48][49]
5. **Cascade application data.** After provider completion, delete the application's account root and cascade follows/last-seen **if strict physical ordering is the accepted interpretation**. A direct FK cascade from `auth.users` already removed those rows in step 3; these designs are not equivalent. Immediate account-data deletion under provider outage and strict delayed cascade cannot both be guaranteed without clarifying the spec. See Open questions before choosing the schema.[1][41]
6. **Complete and purge.** Clear browser auth cookies, refuse stale JWTs, erase temporary credentials and provider identifiers after the steps finish, and produce a non-identifying receipt/status. Do not report completion while a provider is pending. Proposed retry schedule: 1 minute, 5 minutes, 30 minutes, then hourly with jitter; alert the owner at 24 hours and again at 60 hours, with the fixed 72-hour deadline. Honor provider backoff. A provider outage can breach an SLA; it does not authorize false success or silently retaining credentials indefinitely.[1][17][48]

**Re-registration race (proposal):** block or reconcile OAuth signup and identity linking for the same provider subject while its deletion job is pending. A delayed unlink must not disconnect a newly created account for that subject. Prove this barrier at the server/Auth boundary, not only by hiding the login button; the temporary subject registry is part of the operational-record question below.[1][17][48][49]

**Closing the stale-JWT window:** `getClaims()` signature validation alone does not prove the session still exists. For private reads/writes, check a current user and the signed `session_id` against a server-restricted `auth.sessions` existence check; no public access to that table. Enforce the same invariant for direct Data API/RLS access or remove that bypass path. This prevents a deleted user's still-valid JWT from recreating follows during its remaining lifetime.[34][35][41]

#### Measurement and failure-injection procedure

No project/provider credentials were supplied, so deletion, refresh and provider unlink were **not run**. In local E2E use users A/B and stub only the provider HTTP boundary; in isolated staging manually use disposable consented Kakao and Google accounts. Invoke `admin.deleteUser(id,false)`, Kakao's POST above, and Google revoke through a server-side harness with credentials read from a secret store, never shell history. Verify account absence, refresh rejection, old-JWT denial, empty private application data, provider connected-app state, and a second identical deletion request.[47][17][48]

Run crashes immediately before/after each external call, successful call/lost response, provider 429/5xx, wrong Admin key, expired Google token, user revoked access independently, two linked identities, rejoin while unlink is pending, repeated requests and restore-from-backup. Record request/step timestamps, redacted HTTP/provider error codes, attempt counts, data-purge time, provider completion time and oldest pending request. Selection criteria: every normal case finishes inside 72 hours, replay never restores account data, partial failures remain visible, and restored backups cannot republish deleted account state. Exact backup/deletion reconciliation requires the retention clarification in Q6/Open questions.[1][35][41]

### Q5. Anonymous endpoint abuse controls

**Documentation estimates, not measurements.** Keep independent daily translation/search USD caps, anonymous reading/search, uncached streamed Search, and the non-commercial Hobby deployment.[1][53]

| Option | Availability checked 2026-09-19 | Trade-off |
|---|---|---|
| Vercel Hobby WAF | One rate-limit rule within three custom rules; 1M allowed requests included; IP/JA4 keys; fixed 10-second–10-minute windows; regional counters.[51] | One coarse rule over both costly endpoints; application counters distinguish them. JA4 is not a person. |
| WAF billing | Denied/challenged/rate-limited requests incur no CDN Request/Fast Data Transfer usage under the current June 16, 2026 page. Allowed traffic consumes normal usage. Published $0.50/M paid rate-limit pricing is not an automatic Hobby overage offer.[52] | Hobby quota exhaustion still threatens availability.[53] |
| Supabase/Postgres | Pro from $25/month, including $10 compute credits for one Micro; Micro lists 60 direct/200 pooler connections, with no per-counter tariff.[57] | No additional vendor; counters compete with application SQL for CPU/locks/connections. |
| Upstash Free | One DB, 256 MB, 10 GB monthly bandwidth, 500,000 commands/month. PAYG $0.20/100k commands; Free allowance does not carry into PAYG. Paid budget setting throttles at its limit.[58] | Optional isolation if Postgres contention is measured; commands are not requests. |
| Upstash limiter | Fixed window: 3 commands first check, 2 later; sliding window 5/4; analytics adds one. Default five-second timeout permits the request.[59][60] | Disable analytics; explicitly fail closed on timeout/error for new paid work. |
| Turnstile Free | 20 widgets, 10 hostnames/widget, unlimited challenges/verifications; no Cloudflare CDN migration needed.[61] | Useful escalation; introduces Cloudflare into the privacy inventory.[63] |

**Proposed Postgres limiter:** private rows keyed by endpoint, key kind/digest and window start; atomic `INSERT ... ON CONFLICT DO UPDATE ... WHERE count < limit RETURNING ...`. No returned row means denied. Combine all checks/reservation in one short transaction with deterministic lock order; make no network/model calls while holding locks. PostgreSQL documents atomic UPSERT concurrency behavior.[54] Revoke PUBLIC/anon/authenticated access; use a restricted server function/role. If SECURITY DEFINER is needed, use an empty search_path and qualified objects.[55] Use the transaction pooler, disabled prepared statements and one connection per warm web instance initially. Proposed transaction timeout 200 ms; return retryable 503 on limiter failure.[1][56]

#### Proposed initial policy — numbers to tune, not measured safe limits

| Layer | Initial setting |
|---|---|
| Edge | One rule: 120 requests/60 seconds/IP across translation/search execution paths; exclude pages/assets/auth callbacks. Fixed-window bursts still need application checks.[51] |
| Cookie | Signed random `__Host-abuse`; Secure, HttpOnly, SameSite=Lax, Path=/, 24-hour expiry; issue at cost-bearing interaction outside public caches; never associate with accounts. |
| Translation | Per cookie: 5 new misses/minute, 30/day, one concurrent miss. Per IP: 30 misses/minute; challenge above 100/day; emergency hard ceiling 1,000/day. |
| Search | Per cookie: 10/minute, 100/day, two concurrent requests. Per IP: 60/minute; challenge above 500/day; emergency ceiling 5,000/day. No result **or query-embedding cache**. |
| Input | Translation accepts an allowed existing Evidence ID, never arbitrary text/URL. Search: 1–200 Unicode code points, maximum 256 model tokens, one explicitly submitted query/request. |
| Escalation | Challenge after 3 rate rejections/10 minutes or IP threshold. A solved challenge never resets cookie or USD limits. 429 + Retry-After; accessible retry and ordinary reading remain available. |
| Global budget | Atomically reserve maximum billable input/output/reasoning/retry cost before dispatch; reconcile afterward. Translation exhaustion disables its button with the fixed Korean cap message; Search keeps its separate ledger.[1] |

All uncited numerical cells above are **author proposals**, supported by the available controls rather than provider guarantees.[51][54][61] Higher shared-IP thresholds reduce NAT collisions; cookie/IP rotation can still evade client limits. Use trusted Vercel IP headers, not client-supplied forwarding values.[64] Proposed HMAC of normalized IP with daily rotating secret, counter cleanup within 48 hours, aggregate-only reporting and no raw IP/query/cookie/token in traces; HMAC is not a claim of anonymization. These short-lived operational identifiers and retention need the Q6 privacy inventory.[63][1]

Translation-only cache key proposal: Evidence/version hash, target language, model/prompt and rights-policy versions. Coalesce simultaneous misses with a unique job/lease; cache hits do not consume model tokens but still consume infrastructure. Preserve cached translations when the translation budget is exhausted and expire them 90 days after Story end; check current rights before serving. Search remains request-time and uncached.[1]

Validate Turnstile at `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`, checking success, hostname and action. Tokens are single-use and expire in 300 seconds. Omit optional remoteip unless needed, but the widget still processes browser IP information.[62] Cloudflare lists IP, TLS fingerprint, UA, sitekey/origin and acts both as protection processor and independent controller for improving detection; disclose it before activation.[63]

#### Cost arithmetic and future measurements

Illustration only, **not a #7 model selection**: GPT-4.1 mini $0.40/M input + $1.60/M output, assuming 500 input and 300 output tokens, yields **$0.00068/new translation**. text-embedding-3-small $0.02/M at 100 query tokens yields **$0.000002/search**.[65]

| Abuse scenario | Estimated model/limiter charge |
|---|---|
| 100k distinct translations without controls | $68; one unchanged cookie under proposed limit: 30/day = $0.0204/day. Distributed clients can exhaust the daily global cap. |
| 100k copies of the same permitted Evidence request | $0.00068 with one successful coalesced miss; infrastructure traffic remains. |
| 1M unique searches | $2 embeddings at the assumed length; DB/vector/function costs and availability are separate. One cookie: 100/day = $0.0002/day. |
| Upstash alternative, four fixed-window counters/request | 8–12 commands/request: about 41,666–62,500 requests consume Free's 500k commands. At 1M requests PAYG commands cost $16–24 before other usage.[58][59] |

The existing global caps bound admitted model spending only if reservations cover maximum billable usage, retries and concurrent dispatches. Provider timeouts with uncertain billing must retain their reservation until reconciled. Hobby exhaustion and shared DB overload remain distinct from dollar caps.[1][53][56]

**Implementation-ticket procedure (unexecuted; no keys available):**[1][54][62][64]

1. Isolated preview with stub model dispatch counter; 20 Evidence IDs covering rights-denied/cache-hit/cache-miss/same-ID races, and 20 Korean queries around character/token limits. Run saved-cookie requests, e.g. `curl -i -c /tmp/abuse.jar -b /tmp/abuse.jar -H 'Content-Type: application/json' --data '{"evidenceId":"fixture-evidence-1"}' "$PREVIEW_URL/api/translate"` once that endpoint contract exists.
2. A Node harness sends 100 concurrent fetches: one cookie/IP, 100 cookies/IP, controlled runners with different IPs, plus window-boundary and daily-reset cases. Use injected clock/IP locally; never spoof deployment headers to claim distributed-IP verification.
3. Inject DB timeout, malformed/expired cookie, replayed/expired/wrong-host Turnstile, provider timeout, and exhausted translation cap while Search succeeds. Turnstile test credentials may exercise integration locally; they do not prove production bot resistance.
4. Record allowed/429/503 counts, dispatches, reserved/actual USD, cache/coalescing, p50/p95 latency, SQL locks/CPU/pool use, WAF allowed/mitigated requests, egress and shared-NAT false positives. Proposed selection gate: zero dispatch after denial, zero cap overshoot, zero identity leakage, limiter p95 <50 ms at 20 RPS. Consider Upstash only if shared DB contention fails.
5. After keys exist, run 20 unique translations and 20 searches using #7-selected models, recording actual tokens, cost and latency. Recalculate thresholds/cost scenarios; never load-test paid inference.

### Q6. Minimum legal pages — outlines, not final legal text

**Date check of research 05:** the PIPC privacy-notice guidance announcement is dated 2026-04-24 and includes generative-AI disclosure considerations. Current PIPA article pages show the version effective 2026-09-11; future 2027 provisions are not used as the operative launch basis.[7][66][70]

Non-commercial status alone does not establish exemption: the controller definition can cover individuals processing personal-information files for work. Assign a lawful basis to each actual operation; consent and necessary contract performance are distinct Article 15 grounds. Minimize scopes and do not make unnecessary profile collection a service condition. Provider OAuth consent does not replace this service's own processing/transfer notice or required consent.[66][67][68]

#### Privacy-notice outline

Proposed headings grounded in Article 30 and the revised guidance:[69][70]

1. Operator identity, privacy contact, effective date and revision history.
2. Purpose/data/legal-basis/retention table: provider/auth identifiers and actual email/profile metadata received; follows/last-seen; abuse cookie/IP-derived keys; security logs; request-contact details. Distinguish technical Auth records from product account data.
3. Collection method, required/optional items and refusal consequences.
4. Third-party provision separately from entrusted processing, named processors/tasks, and overseas transfer.
5. Retention/destruction methods; access, correction, deletion, withdrawal and complaint routes.
6. Automatic collection/cookies: purpose, expiry, refusal method and effects.
7. Safeguards, responsible contact and material policy changes.

Where processing an under-14 child's data requires consent under PIPA, Article 22-2 requires verified legal-representative consent; notices to children must be understandable. The spec does not settle age-handling, so no age exclusion is assumed.[90]

Overseas transfer covers provision, outsourced processing, storage and access. Article 28-8 permits different grounds, including separate consent and prescribed notice/notification for necessary contractual processing/storage; do not presume one ground fits every vendor. Record items, countries, timing/method, recipient/contact, purpose, retention and refusal consequences. A GDPR DPA/SCC does not alone demonstrate Korean compliance.[71]

| Recipient | Inventory outline; configuration to verify before launch |
|---|---|
| Supabase | Auth and account DB in explicit Seoul `ap-northeast-2`. Its August 2026 DPA provides selected-region storage/primary processing with exceptions; examine support access/subprocessors before saying all data remains in Korea.[72][73] |
| OpenAI | Fixed US processing of translation/pipeline material and semantic-search input, not account profiles. API data is not trained on by default unless opted in; standard abuse-monitoring retention is generally 30 days. Endpoint storage is separate; `store:false` is not universal zero retention.[1][74] |
| Vercel | Hosting, requests and platform logs; icn1 alone is not a global-locality guarantee. TOS §10.1 incorporates a DPA, while its linked DPA introduction names Enterprise/Pro: Hobby coverage is unresolved and belongs in Open questions.[75][76] |
| Sentry | Mask before export; exclude account IDs, cookies, query content and restricted article bodies. US/German event-storage regions are available, including free plans; some account/integration metadata may remain US. Record chosen region and configured retention.[77] |
| Langfuse | Only masked model telemetry permitted by the spec; current cloud regions include US/Ireland/Japan. Record selected region, receiving entity, retention and deletion behavior. Hashing alone is not anonymization.[1][66][78] |
| Healthchecks.io | Heartbeat/job status only. Latvian operator; service data in Germany; policy describes AWS encrypted backups and retention up to two months. Do not promise immediate vendor-wide erasure.[79][80] |
| Cloudflare, if Turnstile enabled | Challenge data, browser IP/UA/TLS characteristics; disclose the protection and independent detection-improvement roles described in Q5.[63] |
| Upstash, only if selected | IP-derived/cookie limiter keys and TTLs; establish actual region, recipient, transfer basis and deletion terms before adoption. No assumption that HMAC keys fall outside privacy law.[58][66][71] |
| GitHub Actions / Railway | The spec's encrypted DB backup artifacts and worker also require inventory. Verify actual destinations/access/retention and whether account data reaches each; no country/contract assurance was established here.[1][66][71] |

#### Retention, cookies, terms and correction

Repeat the **fixed** schedule: article body deleted 30 days after publication (collection time if unknown); Evidence/Claims/Revisions/Changes/reports/cost records indefinite; article embeddings deleted when Story ends; Story/Claim embeddings retained; translation cache until 90 days after Story end; account data immediately on deletion. The overall account/provider deletion workflow targets 72 hours. These are product decisions, not a legal exemption for personal information in long-lived content.[1]

PIPA Article 21 requires unnecessary personal information to be destroyed without delay, subject to applicable statutory retention, using methods preventing restoration. Pending deletion-job records, backups, complaint records and personal information embedded in permanent Evidence need explicit handling; do not invent retention exceptions. The order/backup/rights conflicts are questions below.[66][81]

Article 30 calls for applicable automatic-collection/refusal disclosures; it does not alone mandate a universal opt-in banner for every security/session cookie. Assess each collection/transfer basis, including Turnstile. Proposed scope: essential auth/security cookies only; no advertising, sponsorship, paid functions or profiling. A blanket “agree to privacy policy” checkbox is not a substitute for notices or specific required consent.[1][67][69][71]

Do not label service terms universally mandatory or optional. The Terms Regulation Act governs presentation/explanation when standard terms are used; Network Act Article 44-2(5) requires takedown measures/procedure in terms where the operator falls within its provider scope. Proposed concise terms: guest reading; optional accounts; acceptable use/cost limits; closure; source/MT limitations; correction/takedown; contact and changes. Confirm statutory classification.[82][83]

Proposed correction/takedown flow: public form/email → private case ID/time → affected URL/Claim/Evidence and requested remedy → minimum contact/authority proof → urgent restriction assessment → correction/restriction/reasoned response → requester notice and outcome. Keep requester information out of public GitHub. The **72-hour target is internal**, not a statutory grace period: where Article 44-2 applies it requires action without delay and immediate notices; temporary restriction may last at most 30 days. Invalidate affected public caches and retain anonymized correction history where feasible.[1][83]

### Q7. Attribution and data-rights page outline

Existing research 04/05 remains the starting point; the following date-check preserves the spec's rights tiers rather than reopening its source decisions.[1][6][7]

| Page block | Required content / proposed presentation |
|---|---|
| Wikinews | Title, Wikinews credit, original article and relevant revision/history link, actual license link. Default license changed on **2024-12-16** to CC-BY-4.0; covered earlier material remains CC-BY-2.5, with the policy's still-earlier public-domain period distinguished. Policy wording “after December 16” and the older footer's end date December 15 are not perfectly aligned: inspect boundary-day records and never relicense the whole archive. Images have separate rights.[84][85] |
| CC attribution | Credit and license links, supplied title where required by 2.5, retained notices and clear modification/translation notice; no implied endorsement. Apply the actual version. Copyright permission does not settle privacy/personality rights.[86][87] |
| GNews | API access is not article copyright ownership: publishers retain rights and per-publisher risk remains. State this on About and README. Fixed 1–2 sentence Evidence excerpts plus publisher/link do not establish permission for every excerpt/AI use. Terms dated **2026-06-22**, §8.4, require destruction of downloaded materials after termination; permanent derived-material scope is an interview question. GNews credit is generally appreciated unless subscription terms make it mandatory.[1][88] |
| GDELT | Fixed link-only use: title, publisher, URL and time for related coverage; credit/link the GDELT Project as discovery provider. Its dataset attribution policy does not grant rights in underlying publisher article text.[1][89] |
| Demo and code | Separate designed Demo Stories and fictional Source names, with the fixed designed-scenario/fictional-source badge. Fixtures and golden labels: CC-BY-4.0; code: MIT. Never apply project licenses to third-party articles.[1][86] |
| Machine translation | Display the fixed Korean “machine translation, for reference” label, preserve English Evidence/original links, distinguish service translation from publisher text, mark changes and offer an error-report route.[1][86][87] |
| Retention/remedies | Publish the exact Q6/spec retention schedule, rights-tier display limits and correction/takedown contact/72-hour service target, preserving faster applicable legal duties.[1][83] |

## Options & trade-offs

| Decision within the fixed design | Preferred starting option | Alternative / cost |
|---|---|---|
| Kakao data | Verify guide/source scope discrepancy; pursue minimum supported data and individual Biz conversion | Do not promise a non-Biz fallback until hosted scopes/consent pass; record unavoidable provider metadata.[1][10][14][50] |
| Auth testing | Local CLI Auth + password users + real SSR cookie adapter | Hosted isolated test project for optional deployment smoke; fake cookies/custom provider give different, incomplete coverage.[42][43][45][46] |
| In-app routing | Kakao in-app where verified; Google external browser before PKCE | Route both externally in an unverified host; undocumented schemes are best-effort optimizations.[13][19][23][25] |
| Limiter | Included Hobby WAF + private Postgres counters | Upstash adds quota/vendor/transfer complexity but can isolate DB load; Turnstile adds friction and privacy inventory.[51][54][58][63] |
| Google deletion credential | Fresh same-account reauthorization plus a bounded operational outbox, subject to clarification below | Permanently storing provider refresh tokens improves unattended revocation but expands retained credentials; user-assisted disconnect cannot be presented as verified server revocation.[31][48][49] |
| Legal pages | Concise actual-data notice, terms/correction procedure and rights page | Generic templates can misstate processors, retention and statutory applicability; fill actual fields before publication.[69][70][82][83] |

## Recommendation

### Proposals for implementation tickets

1. **M4 first:** smoke-test email-less Kakao, individual Biz eligibility and exact callback configuration; pin SSR dependencies and verify cookie/header propagation. Record console evidence and failures rather than assuming approval timelines.[10][14][30][33]
2. Implement public/private rendering boundaries from Q2, with real authorization at mutations and actual DB access paths; use local Auth-based CI and the physical-device matrix before marking M4 complete.[1][39][40][42]
3. Treat deletion as a recoverable multi-provider job with hard Auth deletion and explicit completion evidence. Resolve the order/operational-record questions below before finalizing schema and account-deletion copy.[1][41][47][48]
4. Start Q5's numeric limits as tunable configuration: WAF plus DB counters, independent USD reservations, translation coalescing and challenge escalation. Record quota/latency/false-positive evidence and keep search uncached.[1][51][54]
5. At M5, fill actual operator/contact/processor regions and retention fields, publish rights/MT/demo disclosures, and test correction/cookie refusal flows. No ads, sponsorship, paid functions or commercial exception is proposed.[1][53][69][83]

All changes to code/spec/ADRs or authoritative project documents are proposals for Claude's later tickets; this research edits none of them.[9]

## Open questions for the interview

1. **How should the Kakao guide/source scope discrepancy and any non-Biz failure be resolved?** Options: finish individual Biz verification and retest permitted scopes; obtain Supabase/Kakao clarification for email-less configuration; keep guest access available while deferring M4 acceptance. Neither provider is silently removed.[1][10][14][50]
2. **Does the fixed deletion sequence specify strict physical order or completion milestones?** Options: strict Auth → provider → separate application-root cascade, with an explicit decision on provider-outage timing; immediate Auth FK cascade with provider unlink retried afterward, explicitly approving the order interpretation; defer account launch until a compatible interpretation is recorded. Direct Auth FK cascade cannot run after an external unlink.[1][41]
3. **What operational records are allowed under “only follows + last-seen” and immediate deletion?** Options: authorize encrypted deletion-only credentials/IDs with completion purge and a defined 72-hour escalation; require fresh Google reauthorization and an owner-assisted exception for missing/revoked credentials; postpone accounts until unattended unlink can meet the approved rule. This also requires a decision on short-lived abuse counters, request contacts and Auth metadata, not permission for profiling.[1][31][48][49]
4. **How should immediate deletion interact with recoverable backups?** Options: verified selective erasure; explicitly approved bounded backup expiry with restricted restore-time deletion replay; defer account launch pending a reviewed method. No backup-retention exception is silently added to the spec.[1][66][81]
5. **How should Hobby's DPA wording mismatch be resolved?** Options: obtain written Vercel confirmation of applicable processor terms; Korean legal review of TOS/DPA incorporation; defer public account processing until resolved. Hosting remains the fixed plan unless the owner later changes it.[75][76]
6. **How should permanent content retention interact with personal-data erasure and GNews termination?** Options: provider/legal clarification of affected originals/derivatives; explicitly approved scoped removal/redaction plus non-sensitive tombstones; suspend affected ingestion pending clarification. The current fixed rights tiers and retention schedule remain authoritative until that decision.[1][81][88]
7. **How will consent-requiring processing for under-14 users be handled?** Options: verified guardian flow; an explicitly owner-approved account-eligibility limitation while anonymous reading remains available; defer public accounts pending a documented approach. No age exclusion is already fixed by the spec.[1][90]

## Sources

1. [Current product specification; requested sections](../spec/v1.md) — accessed 2026-09-19.
2. [Shared project facts](../agents/project.md) — accessed 2026-09-19.
3. [Domain glossary](../../CONTEXT.md) — accessed 2026-09-19.
4. [Prior research 02, guest-first proposal (superseded details excluded)](02-ux.md) — accessed 2026-09-19.
5. [Prior research 03, auth/security/privacy](03-stack.md) — accessed 2026-09-19.
6. [Prior research 04, source rights and attribution](04-ai-pipeline.md) — accessed 2026-09-19.
7. [Prior research 05, privacy/abuse/onboarding](05-portfolio-bar.md) — accessed 2026-09-19.
8. [Issue #8 research brief; user focus of 2026-09-19 overrides stale context/procedure](briefs/08-auth-kakao-supabase-legal.md) — accessed 2026-09-19.
9. [Repository research role; current user override prohibits gh/comments in this run](../../AGENTS.md) — accessed 2026-09-19.
10. [Kakao, App settings: Biz conversion, test apps, callback constraints](https://developers.kakao.com/docs/ko/app-setting/app) — accessed 2026-09-19.
11. [Kakao Business, Kakao Sync introduction and review estimates](https://kakaobusiness.gitbook.io/main/tool/kakaosync/phase-in) — accessed 2026-09-19.
12. [Kakao, Login prerequisites](https://developers.kakao.com/docs/ko/kakaologin/prerequisite) — accessed 2026-09-19.
13. [Kakao, Login utilization: scopes and KakaoTalk automatic login](https://developers.kakao.com/docs/ko/kakaologin/utilize) — accessed 2026-09-19.
14. [Supabase, Login with Kakao: missing-email option and redirect/PKCE configuration](https://supabase.com/docs/guides/auth/social-login/auth-kakao) — accessed 2026-09-19.
15. [Kakao, Quotas](https://developers.kakao.com/docs/ko/getting-started/quota) — accessed 2026-09-19.
16. [Kakao, Login concepts and token lifetimes](https://developers.kakao.com/docs/ko/kakaologin/common) — accessed 2026-09-19.
17. [Kakao, Login REST API: tokens, logout, unlink, user information](https://developers.kakao.com/docs/ko/kakaologin/rest-api) — accessed 2026-09-19.
18. [Google, OAuth authorization errors, including embedded user agents](https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow) — accessed 2026-09-19.
19. [Google Identity team, Embedded WebView authorization policy; published 2021-06-29, enforcement 2021-09-30](https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/) — accessed 2026-09-19.
20. [Kakao DevTalk, staff reproduction of missing UA marker after new-window navigation, 2022-10-11; historical limitation, current reproduction pending](https://devtalk.kakao.com/t/navigator-useragent-kakao/125427) — accessed 2026-09-19.
21. [NAVER, Openmain guide §5, system/custom WebView UA patterns](https://developers.naver.com/docs/openmain/) — accessed 2026-09-19.
22. [NAVER, Login developer guide §5.1.3, NAVER app UA detection](https://developers.naver.com/docs/login/devguide/devguide.md) — accessed 2026-09-19.
23. [Kakao DevTalk, external-browser issue and staff support boundary, 2023-08-10](https://devtalk.kakao.com/t/topic/131149) — accessed 2026-09-19.
24. [Kakao DevTalk, external-opening report and staff referral, 2026-08-26](https://devtalk.kakao.com/t/branch/151358) — accessed 2026-09-19.
25. [Chrome Developers, Android intents, gestures and fallback URL](https://developer.chrome.com/docs/android/intents) — accessed 2026-09-19.
26. [NAVER, App URL Scheme guide; documented in-app browser command](https://developers.naver.com/docs/utils/mobileapp/) — accessed 2026-09-19.
27. [IETF, RFC 8252, native-app browser security and separate storage](https://datatracker.ietf.org/doc/html/rfc8252) — accessed 2026-09-19.
28. [Android Developers, Android Debug Bridge](https://developer.android.com/tools/adb) — accessed 2026-09-19.
29. [Supabase, Server-side rendering; live beta/API-stability guidance](https://supabase.com/docs/guides/auth/server-side) — accessed 2026-09-19.
30. [Supabase SSR releases; 0.12.7 dated 2026-09-08](https://github.com/supabase/ssr/releases) — accessed 2026-09-19.
31. [Supabase, Sign in with Google](https://supabase.com/docs/guides/auth/social-login/auth-google) — accessed 2026-09-19.
32. [Supabase, Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) — accessed 2026-09-19.
33. [Supabase, Creating an SSR client](https://supabase.com/docs/guides/auth/server-side/creating-a-client) — accessed 2026-09-19.
34. [Supabase, getClaims API](https://supabase.com/docs/reference/javascript/auth-getclaims) — accessed 2026-09-19.
35. [Supabase, User sessions](https://supabase.com/docs/guides/auth/sessions) — accessed 2026-09-19.
36. [Supabase, Advanced SSR guide; refreshed cookies/cache headers](https://supabase.com/docs/guides/auth/server-side/advanced-guide) — accessed 2026-09-19.
37. [Next.js, use cache directive](https://nextjs.org/docs/app/api-reference/directives/use-cache) — accessed 2026-09-19.
38. [Next.js, Cache Components/caching](https://nextjs.org/docs/app/getting-started/cache-components) — accessed 2026-09-19.
39. [Next.js, Authentication guide; Server Actions authorization](https://nextjs.org/docs/app/guides/authentication) — accessed 2026-09-19.
40. [Supabase, Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — accessed 2026-09-19.
41. [Supabase, Managing user data and deletion](https://supabase.com/docs/guides/auth/managing-user-data) — accessed 2026-09-19.
42. [Supabase, Local development and CLI](https://supabase.com/docs/guides/local-development) — accessed 2026-09-19.
43. [Supabase, admin.createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser) — accessed 2026-09-19.
44. [Supabase, signInWithPassword](https://supabase.com/docs/reference/javascript/auth-signinwithpassword) — accessed 2026-09-19.
45. [Supabase, Custom OAuth/OIDC providers](https://supabase.com/docs/guides/auth/custom-oauth-providers) — accessed 2026-09-19.
46. [Playwright, Authentication and reusable storage state](https://playwright.dev/docs/auth) — accessed 2026-09-19.
47. [Supabase, admin.deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser) — accessed 2026-09-19.
48. [Google, OAuth web-server flow and token revocation; updated 2026-09-14](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke) — accessed 2026-09-19.
49. [Supabase, Social login; provider token custody](https://supabase.com/docs/guides/auth/social-login) — accessed 2026-09-19.
50. [Supabase Auth Kakao provider source, mutable master inspected 2026-09-19; outgoing default scopes](https://raw.githubusercontent.com/supabase/auth/master/internal/api/provider/kakao.go) — accessed 2026-09-19.
51. [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting) — accessed 2026-09-19.
52. [Vercel WAF usage/pricing; June 16, 2026 page](https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing) — accessed 2026-09-19.
53. [Vercel Hobby plan and non-commercial restriction](https://vercel.com/docs/plans/hobby) — accessed 2026-09-19.
54. [PostgreSQL INSERT/ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html) — accessed 2026-09-19.
55. [Supabase database functions and function privileges](https://supabase.com/docs/guides/database/functions) — accessed 2026-09-19.
56. [Supabase database connection/pooler guidance](https://supabase.com/docs/guides/database/connecting-to-postgres) — accessed 2026-09-19.
57. [Supabase pricing](https://supabase.com/pricing) — accessed 2026-09-19.
58. [Upstash Redis pricing](https://upstash.com/pricing/redis) — accessed 2026-09-19.
59. [Upstash rate-limit SDK command costs](https://upstash.com/docs/redis/sdks/ratelimit-ts/costs) — accessed 2026-09-19.
60. [Upstash rate-limit SDK features and timeout behavior](https://upstash.com/docs/redis/sdks/ratelimit-ts/features) — accessed 2026-09-19.
61. [Cloudflare Turnstile plans](https://developers.cloudflare.com/turnstile/plans/) — accessed 2026-09-19.
62. [Cloudflare Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/) — accessed 2026-09-19.
63. [Cloudflare Turnstile privacy addendum](https://www.cloudflare.com/turnstile-privacy-policy/) — accessed 2026-09-19.
64. [Vercel request headers](https://vercel.com/docs/headers/request-headers) — accessed 2026-09-19.
65. OpenAI model pricing (two model pages) — [model page 1](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [model page 2](https://developers.openai.com/api/docs/models/text-embedding-3-small) — accessed 2026-09-19.
66. [PIPA consolidated statutory reference, Articles 2/26/58-2](https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=283839) — accessed 2026-09-19.
67. [PIPA Article 15, collection/use grounds](https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029335387) — accessed 2026-09-19.
68. [PIPA Article 16, data minimization](https://law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029335671) — accessed 2026-09-19.
69. [PIPA Article 30, notice; effective 2026-09-11](https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1029331583) — accessed 2026-09-19.
70. [PIPC revised privacy-notice guidance, 2026-04-24](https://pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS074&nttId=12021) — accessed 2026-09-19.
71. [PIPA overseas transfers, Articles 28-8 through 28-11](https://law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1020398611) — accessed 2026-09-19.
72. [Supabase deployment regions](https://supabase.com/docs/guides/platform/regions) — accessed 2026-09-19.
73. [Supabase DPA, 2026-08-01 version](https://supabase.com/legal/customer-resources/data-processing-addendum) — accessed 2026-09-19.
74. [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data) — accessed 2026-09-19.
75. [Vercel DPA, updated 2026-03-17; effective 2026-03-31](https://vercel.com/legal/dpa) — accessed 2026-09-19.
76. [Vercel Terms, section 10.1](https://vercel.com/legal/terms) — accessed 2026-09-19.
77. [Sentry EU region FAQ](https://www.sentry.help/en/articles/13964378-sentry-s-eu-region-faq) — accessed 2026-09-19.
78. [Langfuse security/privacy and regions](https://langfuse.com/security) — accessed 2026-09-19.
79. [Healthchecks FAQ, hosting](https://healthchecks.io/faq/) — accessed 2026-09-19.
80. [Healthchecks privacy policy](https://healthchecks.io/privacy/) — accessed 2026-09-19.
81. [PIPA Article 21 destruction; current page effective 2026-09-11](https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1027063705) — accessed 2026-09-19.
82. [Terms Regulation Act Article 3](https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1029708921) — accessed 2026-09-19.
83. [Network Act Article 44-2; effective 2026-09-11 page](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029562697) — accessed 2026-09-19.
84. [English Wikinews copyright policy](https://en.wikinews.org/wiki/Wikinews:Copyright) — accessed 2026-09-19.
85. [Wikimedia license-change deployment ticket, resolved 2024-12-16](https://phabricator.wikimedia.org/T381421) — accessed 2026-09-19.
86. [Creative Commons BY 4.0 deed](https://creativecommons.org/licenses/by/4.0/) — accessed 2026-09-19.
87. [Creative Commons BY 2.5 deed](https://creativecommons.org/licenses/by/2.5/) — accessed 2026-09-19.
88. [GNews Terms; updated 2026-06-22](https://gnews.io/legal/terms-of-service) — accessed 2026-09-19.
89. [GDELT about/terms](https://gdeltproject.org/about.html) — accessed 2026-09-19.
90. [PIPA Article 22-2, children's personal information](https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029334761) — accessed 2026-09-19.
