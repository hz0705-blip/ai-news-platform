# UI/UX design research — evidence, contradiction, and change

## 요약

- 2026-09-17 기준 조사다. 기존 Pretendard 읽기 설정과 shadcn/ui + Base UI + Tailwind v4 결정을 유지한다.[1][4]
- M1은 사건의 주장·출처·변화를 먼저 완성하고, 모바일 근거 아코디언과 데스크톱 2열 근거 보기를 같은 내용으로 제공한다.[1][3]
- 주장은 항상 읽을 수 있게 두고, 근거만 펼친다. 영어 원문을 기본으로 표시하며 요청한 한국어 번역에는 `기계 번역(MT)`을 붙인다.[1][3][6]
- 다섯 상충 상태는 글자·아이콘·색을 함께 쓴다. 출처끼리 빨강·파랑을 배정하거나 신뢰·편향 점수를 만들지 않는다.[1][2][26]
- 제안한 상태 배지의 글자 대비는 밝은 테마 6.73:1 이상, 어두운 테마 7.28:1 이상이며 근거 강조와 데모 배지도 별도로 계산했다.[7]
- 기본 시각 방향은 종이색 배경과 청록색 조작부인 **A: Paper & Teal**을 권고한다. 비교안은 차가운 중립색과 자주색의 **B: Slate & Plum**이다.[7][14][16]
- GNews 이미지 URL은 재사용 허가가 아니다. 기본은 사진 없는 사건 카드이며, 별도 이용 권리를 확인한 자산만 예외로 검토한다.[11][12]
- 마지막 성공 갱신 시각과 다음 예정 시각을 구분하고, 한도·중단 중에도 이미 발행된 사건과 영어 근거는 읽을 수 있게 한다.[3]
- 10개 뉴스 제품, 2개 근거 중심 제품, 2개 변화 UI를 비교한다. 공식 자료로 확인하지 못한 화면·다크 모드는 미확인으로 표시한다.[28][29][30][31][32][33][34][35][36][37][38][39][40][41]
- 이 문서는 디자인 제안과 수치 대비 검증이다. 완성 화면의 axe·키보드·200% 확대·카카오톡 인앱 검증은 M1 구현 후 수행해야 한다.[3][5][9][17]

## Scope

**As-of and access date: 2026-09-17 (KST).** This is the single research deliverable for issue #12. Findings follow brief questions **1–8 in order**; the M1 decisions were investigated first and receive the most detail in Questions 2–5. All proposals, measurements, tables, and wireframes below are dated 2026-09-17. Product observations mean the dated first-party material available on that date, not a claim that every installed app version was tested. Historical illustrations are identified separately. An unverified feature is not an absent feature.[1]

The brief, glossary, and current specification govern the design. The earlier report is reused only for the already accepted component and Korean-reading baseline: `02-ux.md:168` and `:203–206`, with the surrounding typography table. Its older market-selection, scoring, or onboarding options do not reopen the present Korean-only, anonymous-reading, no-score scope. This report proposes visual and information design, not status-transition rules (#10), chart libraries, test tooling, font delivery, or OG implementation (#11).[1][2][3][4]

**Evidence method.** Web search and linked primary product/help pages, repositories, standards, and terms were checked. Public visual references are linked rather than reproduced as additional files. No paid-app session, competitor usability experiment, Korean density-preference study, or in-app-browser market-share measurement was performed. WCAG colour ratios were actually calculated from the proposed opaque sRGB pairs; no finished application was available for an axe or keyboard pass. Findings distinguish documented facts, observations with limited scope, and original design proposals.[5][7]

## Findings

### 1. Product teardown

**Reading the reference board:** ten news products are compared first, followed by two Evidence-heavy products and two Change interfaces. The links in the first column lead to first-party screenshots, galleries, product pages or illustrated help. “Documented” means the official text supports the feature; “unverified” means it was not established here. Most galleries were linked but not visually audited; no exact font or palette is inferred from an unseen image. Kagi's palette is separately verified in public CSS in §4.1.[28][29][30][31][32][33][34][35][36][37][42]

| News product / visual reference | Home / briefing and Story structure | Sources and Evidence | Time / Changes; lesson to borrow |
|---|---|---|---|
| **1. Ground News** — [product](https://ground.news/), [FAQ](https://ground.news/frequently-asked-questions) | Documented Top Stories by edition and personalised My Feed; a Ground Summary sits over coverage of the same story. | Comparison names publishers and geography, and includes political ratings. Sentence-to-original-span pairing unverified. | Publication chronology is documented; a reader-specific Revision diff is unverified. Borrow clustered coverage and named Sources; reject the political-rating layer.[28] |
| **2. Particle** — [Android gallery](https://particle.news/android), [illustrated introduction](https://particle.news/blog/introducing-particle-the-news-organized) | For You leads to Story overview, concise summary, key quotes, images and related stories. Overview/ELI5/Opposite Sides are documented reading modes. | Source links and sourced Q&A; claims of sourced answers are not a measured citation-accuracy result. | Following stories and a timeline/related context are documented; semantic Revision diff unverified. Borrow summary-to-original access and quote hierarchy.[29] |
| **3. Kagi News** — [2025-09-30 launch gallery](https://blog.kagi.com/kagi-news), [live briefing](https://news.kagi.com/) | Date, categories and topic/headline list; detail sections include Summary, Highlights, Key Quotes, Timeline, Context and Impact. A read count/mark-all-read affordance was visible in the retrieved September 16 edition. | Cited summaries and original links; source grouping/counts in open-source implementation. | 2026-04-30 changelog documents Correction notices and changed-sentence highlighting on next visit. This is the closest Change precedent. The 2026-09-10 changelog temporarily limits translations to original languages/English; old multilingual screenshots do not prove current Korean availability.[30][42] |
| **4. Apple News** — [Today guide](https://support.apple.com/guide/iphone/see-news-stories-chosen-just-for-you-iph5b557ed3d/ios), [reading guide](https://support.apple.com/en-ie/guide/iphone/iphc2090b0d2/ios) | Today combines editorial stories with followed channels/topics; grouped stories open a publisher reading view with text-size and sharing controls. | Channel identity/logo; publisher-designed article structure. Sentence-level Evidence is unverified. | Updates are articles in a feed; reader-specific semantic diff unverified. Borrow source identity and reading controls, not a uniform publisher typography assumption.[31] |
| **5. Google News** — [2022-06-22 redesign gallery](https://blog.google/intl/en-ca/products/explore-get-answers/read-all-about-it-a-new-look-for-google-news/), [2017 comparison gallery](https://blog.google/company-news/outreach-and-initiatives/google-news-initiative/redesigning-google-news-everyone/) | Historical illustrated designs group Top Stories, local coverage, personal picks and topics; cards lead to coverage collections and originals. | Publisher labels and Full Coverage expose other reporting; the older gallery describes relevance/date ordering. Fact-check cards are not our Claim/Evidence design. | These galleries document grouping, not a current Revision ledger. Borrow clusters; do not treat an old screenshot as the exact September 2026 layout.[32] |
| **6. SmartNews** — [official app gallery](https://www.smartnews.com/en), [app help](https://support.smartnews.com/hc/en-us/sections/200964118-Using-the-SmartNews-App) | Topic/publisher channels and local coverage; channel order is configurable; SmartView is a documented reading route. | Publishers/channels are navigation identities; exact sentence Evidence unverified. | Bookmarks and feeds are documented; semantic Change tracking unverified. Borrow clear channel organisation; reject its political coverage slider as our comparison encoding.[33] |
| **7. Naver search AI Briefing** — [2025-03-24 official press release and images](https://www.navercorp.com/media/pressReleasesDetail?seq=32374) | A short AI briefing appears in integrated search, with related questions. This is a search surface, not evidence that every Naver News article has this feature. | Original links and multiple-source answer forms are documented; exact span navigation unverified. | Revision comparison unverified. Borrow visible source access within a concise Korean explanation; keep our separate Story model.[34] |
| **8. Newneek** — [developer-authored Play listing/gallery](https://play.google.com/store/apps/details?id=com.newneek.newneekapp), updated **2026-09-04** | Describes short briefings, audio, trending news, Pizza Station, quizzes and premium articles. The precise current article-screen ordering was not established from the accessible text. | Source-presentation and per-sentence Evidence mechanics unverified. | A reading-habit feature is documented, not a Revision history. Borrow an approachable short first encounter; do not import gamification as a trust cue.[35] |
| **9. UPPITY** — [site](https://uppity.co.kr/), [brand/about page](https://uppity.co.kr/company/) | Retrieved September 16 material shows category/title/date/teaser news rows, newsletter editions, columns and an economic dictionary. Exact article-body module order was not audited. | Editorial content and external references vary; a systematic Claim–Evidence widget was not established. | Visible calendar dates and newsletter editions; no verified per-Claim diff. Borrow dated finite editions and explanatory context.[36] |
| **10. Feedly** — [view-mode screenshots](https://docs.feedly.com/article/276-how-do-i-change-the-views-of-my-feeds-and-source), [preferences](https://docs.feedly.com/category/471-preferences) | Official help, updated **2020-10-26**, shows text-only, magazine and card views plus compact/comfortable density. Treat its screenshots as historical. | Feeds/Sources organise entries; exact per-sentence supporting spans unverified. | Read/unread organisation is not semantic Change tracking. Borrow image-optional density and stable Source identity, not a dashboard full of unrelated feeds.[37] |

| Product | Typography and colour evidence | Images | Dark mode evidence |
|---|---|---|---|
| Ground | Exact typeface, text sizes and current reader palette unverified; political ratings are a separate semantic layer to reject. | Product imagery exists; current card-image rule unverified. | Unverified in the accessed FAQ.[28] |
| Particle | Marketing hero was visually inspected: large white bold sans heading over a charcoal photographic background. **This is not the app reading palette**; exact app fonts/hues unverified. | Official galleries/editorial overview show image-bearing Story content. | App dark behaviour unverified.[29] |
| Kagi | Public CSS defines graphite neutrals, purple links, yellow accent and Lufga faces; universal-font classes mean Lufga cannot be asserted for all languages. | Launch artwork is a gallery reference; optional text-led reading is evidenced by the live list, not a blanket image ban. | `.dark` palette overrides verified in source; the deployed build was not audited.[30][42] |
| Apple News | Publisher article design is configurable; no one exact article typeface/colour can be generalised. | Photos, video thumbnails and galleries are documented. | Apple publishes an article dark-colour-scheme tutorial; this does not prove every publisher article's behaviour.[31] |
| Google News | Historical cards/hierarchy are documented; exact current font and colour values unverified. | Historical redesign galleries include image-led cards. | Official settings document system/always/never options.[32] |
| SmartNews | Channel-led hierarchy documented; exact current font/palette unverified. | Official mobile gallery is the visual reference; image frequency/crop not measured. | Official help documents system/light/dark options.[33] |
| Naver AI Briefing | Korean text-first answer structure documented; exact reader font/palette not inspected. | Press release provides first-party illustrated captures; this is not a news-photo policy. | Unverified for this specific feature.[34] |
| Newneek | Korean short-form tone documented; exact current typeface, sizes and palette unverified. | Store screenshot gallery is linked; image-use policy unverified. | Unverified.[35] |
| UPPITY | Headline/teaser/date hierarchy observed in retrieved page text; exact CSS font/palette unverified. | Some editorial entries include images/video; no uniform image licence inferred. | Unverified.[36] |
| Feedly | Font-family/size preferences documented; do not infer one default typeface or exact palette from a setting index. | Text-only, magazine and card views make images a layout choice. | Official preference index documents dark mode; platform parity was not tested.[37] |

| Additional reference / visual link | Evidence or Change structure | Typography, colour, images and dark-mode boundary | Borrow / avoid |
|---|---|---|---|
| **NotebookLM citation UI** — [official citation help](https://support.google.com/gemininotebook/answer/16179559?hl=en) | Citation hover reveals a quote; activation navigates to original context. Source checkboxes scope material; saved responses preserve citations. | The NotebookLM help URL now redirects to a page titled **Gemini Notebook**; a formal rebrand date was not established. Exact typography/palette, image policy, dark mode and Revision comparison unverified. | Borrow Claim → supporting passage → context; supply explicit touch/keyboard actions rather than hover-only access.[38] |
| **Elicit** — [report evaluation](https://elicit.com/blog/elicit-reports-eval), [documentation](https://docs.elicit.com/) | Its first-party report evaluation describes relevant quoted passages attached to citations. The API separately exposes quote/reference metadata; an API schema is not evidence of a particular UI interaction. | Historical evaluation; exact publication date not extracted. Current font, colour, images, dark mode and Revision UI unverified. | Borrow inspectable exact supporting text; do not substitute paper-level bibliography for a span or import research confidence scoring.[39] |
| **Wikipedia / MediaWiki diff** — [Help:Diff](https://www.mediawiki.org/wiki/Help:Diff), [design illustrations](https://www.mediawiki.org/wiki/Codex/Design/Diffs) | Select two Revisions; metadata identifies the pair. Help documents inline and two-column modes (toggle since MediaWiki 1.41). | Official design discussion describes yellow/blue default diff colours and limitations of colour alone. Fonts/dark support not audited; screenshots describe text changes, not a news-image policy. Design proposals must be distinguished from shipped UI. | Borrow labelled before/after context and Revision identity; replace word-level noise with the four domain Change types.[40][2] |
| **GitHub PR Files changed** — [diff documentation](https://docs.github.com/en/pull-requests/reference/branches), [2025-06-26 illustrated preview](https://github.blog/changelog/2025-06-26-improved-pull-request-files-changed-experience-now-in-public-preview/) | Unified/split and source/rich views, file filters and whitespace handling are documented. | The announcement is a dated preview, not proof of rollout status in September 2026. Exact font/palette/dark behaviour not inspected; rich previews are file-type-specific. | Borrow compact summary plus expandable detail and responsive before/after comparison. Avoid exposing Git terms or treating every rephrasing as a Change.[41][2] |

**Interview shortlist:** inspect Kagi's source/timeline structure and correction notice, NotebookLM's passage jump, Feedly's text-only density, and GitHub's narrow/wide comparisons. These references answer different questions; copying any complete product would bring unrelated assumptions. The two proposed visual directions below are original choices with measured colours, rather than guessed reproductions of competitor palettes.[1][30][37][38][41]

### 2. Pattern catalogue and M1 interaction contract

#### 2.1 Named patterns

The IDs below annotate every wireframe in Question 5. “Use” and trade-offs are proposals; references identify the underlying pattern, not proof of usability in this product. Do not import the reference products' political ratings, confidence scores, chat interface, or recommendation model.[1][2]

| ID / pattern | Concrete use | Benefit / cost or failure mode | Reference |
|---|---|---|---|
| P01 — Text-first Story card | Topic, linked headline, one short Korean takeaway, P02/P03, P06, P09; actions outside the headline link | Scannable without image rights; hierarchy must carry visual interest; do not nest buttons in a whole-card link | Kagi; Google News.[30][32] |
| P02 — Named Source row | Source name first; optional permitted favicon; identical neutral styling for every Source | Recognition and provenance; logos alone are ambiguous and require rights review | Ground; Feedly.[28][37] |
| P03 — “N Sources” disclosure | `출처 3개` opens Sources, with article count separate if needed | Compact breadth cue; number is not independence, corroboration, or confidence | Ground; Kagi.[28][30] |
| P04 — Claim–Evidence pairing | Visible numbered Claim plus `근거 2개 보기`; inline locator, desktop pane, mobile accordion | Inspectable support; collapsed Evidence requires a deliberate action | NotebookLM and APG.[38][6] |
| P05 — Matched disagreement rows | One comparison question, then named Source A's assertion + Evidence and Source B's assertion + Evidence | Explicit disagreement without a political spectrum; long translations can overwhelm | Ground supplies comparison inspiration only; our semantic comparison follows the glossary.[28][2] |
| P06 — Closed-state badge | One of the five exact labels in §2.3; text + distinct icon + restrained tint | Visible state without a score; “agree” can be misread as “true” unless explained | Project state vocabulary; W3C non-colour-only guidance.[2][26] |
| P07 — Revision strip / timeline | Dated ordered list; current Revision and account's Last Seen marker; Change type/count per item | Temporal orientation; a tiny horizontal strip alone fails narrow layouts | Wikipedia revision comparison; GitHub changes.[40][41] |
| P08 — What changed summary | Four Change types; meaningful old/new statements; Source-only additions collapsed | Prioritises meaningful differences; raw word diffs create noise | GitHub comparison mechanics adapted to project Changes.[41][2][3] |
| P09 — Freshness ledger | Last published update, last checked when relevant, next scheduled update; full date visible in Story | Distinguishes freshness from successful processing; avoid an ambiguous “updated” stamp | Project cadence; CLDR date formats.[3][21] |
| P10 — Persistent Demo badge | `데모 사건` beside every demo title; separate Demo section; dashed container, explanation | Prevents fixtures being mistaken for reporting; label must survive deep links and sharing | Project Demo definition; W3C redundant cues.[1][2][26] |
| P11 — State block | Loading / empty / error / quota reached / live paused, with appropriate action | Explains what still works; false “retry” buttons worsen non-retryable states | Project limits; W3C status messages.[3][10] |
| P12 — Original / MT disclosure | English original stays visible; `한국어 번역 보기` adds labelled `기계 번역(MT) · 참고용` beneath | Maintains provenance; translation can lengthen the pane | Fixed Evidence contract; citation navigation reference.[1][38] |
| P13 — Coverage-volume figure + table | Article count over time, caption, labelled axes and equivalent data table | Shows reporting activity; never encodes event severity or truth | Fixed v1 visualisation scope; text alternatives.[3][5] |

#### 2.2 Claim–Evidence pairing: select one responsive pattern

| Variant | Strength | Limitation | Decision |
|---|---|---|---|
| Inline footnote | Cheap visual locator adjacent to a specific Claim | Bare superscripts hide Source identity and can be small touch targets | Keep a visible Claim number and descriptive Evidence control; do not make a tiny numeral the sole action.[27][38] |
| Desktop side panel | Reads Claim and supporting span together | Focus/scroll can jump; a stale selection can misattribute Evidence | Recommended when both columns fit; repeat the selected Claim identifier and short text in the panel.[1][18][38] |
| Hover card | Quick pointer preview | Touch lacks hover; hover-only Evidence excludes keyboard readers | Optional preview later, never the primary route; omit from M1.[5][38] |
| Mobile accordion | Supporting passage immediately follows its Claim | Long expanded lists increase scrolling | Recommended; allow multiple panels open, so disagreement comparison remains possible.[1][6] |

**Proposed content order per Claim:** stable reading label such as `주장 2`; Korean Claim; P06 label and a short explanation; `근거 2개 보기`; each permitted Evidence span with Source name, article title, publication time and original link; P12 translation control. Show the complete authorised one- or two-sentence excerpt, highlighting only the supporting span within it. A GDELT metadata-only article belongs in Sources with `메타데이터·링크만 제공`, never in a fabricated Evidence panel. A missing span is a content error to surface, not a sixth Contradiction Status.[1][2][3]

**Mobile contract:** the Claim text and status remain outside the collapsible region. Put only the disclosure button inside its heading; expand/collapse with Enter or Space, keep normal Tab order, and expose `aria-expanded` and `aria-controls`. Opening a panel keeps focus on its trigger; the next Tab reaches its links/actions. Do not nest the original-article link or MT button inside the disclosure button. The accordion does not need a modal focus trap; avoid assigning a landmark to every one of many panels.[6]

**Desktop contract:** explicit activation selects Evidence; merely focusing a Claim does not change content. Keep focus at the trigger and provide `선택한 근거로 이동` plus `주장 2로 돌아가기` links to programmatically focusable headings. Identify the selection in text and with a rule, not colour alone. A short polite announcement may say which Claim's Evidence is now shown; do not announce the entire quotation. Keep the pane in page flow; avoid an independently scrolling viewport or mandatory scroll synchronisation. At narrow effective widths, including zoom, use the mobile arrangement and retain selection/expanded state where practical.[9][10][18][26]

**Disagreement contract:** P05 sits within the selected Claim's Evidence block. Use equally weighted rows labelled with actual Source names, article dates, English spans and the specific disputed point. On desktop they may be paired within a sufficiently wide pane; otherwise stack them in the same order. Tabs save space but conceal the comparison, so do not use mutually exclusive A/B tabs in M1. Source order is neutral and stable, such as publication time with a name tie-breaker; label it. No coloured team assignments, vote count, winner, percentage, or aggregate truth badge. Numeric charts remain v2; M1 compares the relevant assertions as text.[1][2][3]

**Concrete fixture specimen (all names and quotations below are invented for this proposal):** the Claim is `발사 예정일에 관한 보도가 9월 18일과 20일로 갈린다.` with `보도 상충` and `근거 2개 보기`. Fictional Source A's English span reads “The launch is scheduled for 18 September.”; Fictional Source B's reads “The launch is scheduled for 20 September.” Each row includes a labelled demo article link and date. The optional MT appears beneath its own original, never in place of it. A later Correction scenario must supply an explicit correction statement in the fixture; the UI must not manufacture one merely because a date changes.[1][2]

#### 2.3 All five Contradiction Statuses

These are display mappings of the closed vocabulary, not new inference or transition rules. The pipeline/domain owns status and Story aggregation; the UI must not decide a Story badge by taking the visually “worst” Claim or counting Source pills. In M1, hand-authored fixtures supply each valid state and its explanation. An unavailable status is an error state, not a default `복수 출처 일치`.[1][2][3]

| Closed state / exact Korean label | Proposed icon and explanation | Required inspection path | Semantic token |
|---|---|---|---|
| Single source / `단일 출처` | One document; `이 주장을 뒷받침하는 출처가 하나입니다.` | Open its Evidence; absence of a second Source does not imply falsehood | `--status-single` [2][26] |
| Multiple agree / `복수 출처 일치` | Two documents; `여러 출처의 보도가 이 주장에 일치합니다.` | List each supporting span; do not imply independent reporting or verified truth | `--status-agree` [2][26] |
| Conflicting / `보도 상충` | Diverging arrows; `출처에 따라 보도가 다릅니다.` | P05 highlights precisely what differs | `--status-conflicting` [2][26] |
| Resolved / `상충 해소` | Converging arrows; `이전 상충이 해소된 근거가 있습니다.` | Link to prior conflict, current Evidence and Change; no shield/checkmark meaning “certified” | `--status-resolved` [2][26] |
| Corrected / `정정됨` | Edit/document mark; `출처가 정정을 명시했습니다.` | Link explicit publisher Correction and previous/current Claim; silent Article Change cannot receive this label | `--status-corrected` [2][26] |

All labels and their distinctions derive from the glossary; icons and explanatory copy are proposed design choices. Use the status text even when an icon or colour cannot render. A status badge is a description; if it opens an explanation, give that separate control an action-oriented name. Five states are exhaustive for Contradiction Status, not for operational health.[1][2][26]

#### 2.4 Evidence highlighting and Demo identity

**P04 highlight:** use a subdued yellow mark with an explicit foreground token (not inherited grey), a visible `근거 구간` label, and a side rule that uses the foreground colour. Keep surrounding excerpt text readable. A highlight identifies the span being inspected; it does not certify the Claim. Do not use the browser's temporary text selection as the persistent highlight. The colours and calculated ratios appear in §4.3.[1][7][8][26]

**P10 Demo identity:** use a neutral, dashed-outline `데모 사건` badge and the sentence `기능 설명을 위해 만든 데모 사건입니다.` near the title. Label demo Source names as fictitious; never borrow a real publisher logo for invented Evidence. On Today, Follow, or Search, show Demo results in a separately labelled group, never interleaved with live Stories. The title, text share summary and OG composition must retain the Demo designation; #11 owns implementation. Fixture dates are labelled `데모 기준 시각`, so an old fixture does not pretend to be a current live update.[1][2][3]

#### 2.5 State matrix: all five screens

This matrix specifies proposed content and recovery, not backend behaviour. Loading is transient, empty is a successful zero result, error is a failure, quota means processing capacity is exhausted, and paused means live ingestion/analysis is intentionally stopped. Preserve previously published content where available; do not turn an operational state into a Contradiction Status.[2][3][10]

| Screen | Loading | Empty | Error | Quota reached | Live paused |
|---|---|---|---|---|---|
| Today `오늘` | Stable heading and freshness slot; static card skeletons plus `사건을 불러오는 중` | `아직 발행된 사건이 없습니다`; show the next scheduled update and separate Demo section | Keep cached list with last successful time; otherwise retry and Demo link | `오늘 분석 한도에 도달해 N개 사건이 다음 갱신에 처리됩니다`; omit N if unknown; retain published list | `라이브 갱신이 중단되어 있습니다`; show last success and Demo access; show resume time only if known [3][10] |
| Story `사건` | Title/context if known; block-level Claim placeholders; Evidence loads locally | No invented Claims; if no published Story, say unavailable and link Today; `아직 변화가 없습니다` for a first Revision | Keep previous published Revision; local Evidence/MT failures beside their controls with retry | Batch limit explains possible staleness. MT limit shows `오늘 번역 한도 도달`; original English remains readable | Keep all published Claims/Sources/Changes; banner says freshness is frozen, not that the article is false [3][10] |
| Follow `팔로우` | Retain Story/Topic headings and known follow selections | Signed out: explain login benefit with Kakao/Google and guest-reading link. Signed in: `팔로우한 사건·토픽이 없습니다` and discovery links | Preserve saved list; failed follow action gives explicit recovery and correct selected state | Existing follows and reading remain available; show shared processing notice, no upgrade demand | Explain new Changes may stop arriving; follows and past Changes remain usable [3][10] |
| Search `검색` | Keep query and input; announce progress once | Before query: neutral prompt; zero matches: `검색 결과가 없습니다`, edit query, explore Topics | Keep query; retry the same search; no fabricated fallback results | Batch quota banner does **not** disable search; translation cap is local to translation, per spec | Search the last published corpus; label freshness; do not imply live results [3][10] |
| About `소개` | Static content normally needs no loading state; remote report link can load locally | No generic empty page; if a report is unpublished, label that one resource `준비 중` | Keep methods/privacy text; retry only failed remote content/link | Explain the limit and public schedule; reading policies never become gated | Display actual paused status and last success alongside the explanation; resume date may be unknown [3][10] |

All matrix behaviours are recommendations grounded in the specified public-reading, follow, translation, and budget rules. They introduce no payment wall, new account requirement, or new search quota policy. Use backend-provided counts/times; placeholder N is notation in this research, never literal production copy.[1][3]

**Announcement and interaction rules:** put non-urgent asynchronous results in a polite status region; report an actionable failure near the failed control. Skeletons are decorative, do not shimmer under reduced motion, and should not be individually read. Reserve global alerts for a material state change, not every render. A quota block without a useful retry must explain the next step instead of offering a broken retry. Disabled MT controls retain visible, normally contrasted explanatory text. Do not disable reading, scrolling, original links, or cached permitted translations merely because another operation reached its cap.[3][5][7][10]

**Last-updated contract:** Today always shows `마지막 갱신 2026. 9. 17. 오전 6:00 KST` and `매일 오전 6시·오후 6시 갱신 예정` using actual last-success data. The spec distinguishes 05:00/17:00 batch starts from 06:00/18:00 public cadence. Story distinguishes current Revision publication (`사건 갱신`) from a no-change check (`마지막 확인`) and article publication (`기사 발행`). Do not move the published timestamp forward when only a check succeeds. If a scheduled update is missed, say it is delayed and retain the old success time. Paused with unknown restart uses `재개 시각 미정`, not a countdown. Relative times and exact dates are specified in §8.[2][3][21]

### 3. Images: a text-first policy

**Verified legal/product boundary, 2026-09-17:** GNews's terms, last updated 2026-06-22, place responsibility for rights to third-party images and media on the API user (§3.3); third-party content remains its owners' property (§6.2). Paying for full-content API access is therefore not evidence of permission to republish an article's image. The project's excerpt limits are a product constraint, not a universal copyright safe harbour.[11][1]

| Alternative | Visual/layout consequence | Rights or trust boundary | Recommendation |
|---|---|---|---|
| Typographic card | Headline, one takeaway, Source row and status fill the card; no empty thumbnail well | Use original interface styling and permitted text | Default for all live and demo Stories; compact textual layout can be studied in Kagi and feed-reader list modes.[30][37] |
| Publisher article photograph | Can explain a specific event, but changes crop/height and may dominate the summary | Check the actual asset's licence/permission, attribution and scope; API delivery alone is insufficient | Off by default; exceptional use only after separate asset-level rights confirmation.[11] |
| Generated abstract thumbnail | Decorative Topic motif; consistent dimensions but another visual to interpret | Do not let an invented scene imply documentary evidence; no guarantee of blanket IP clearance | Defer; if chosen, visibly label illustration and never generate purported event photographs. An original geometric motif is simpler.[1][11] |
| Favicon / publisher logo | Useful secondary recognition; small icons should not replace Source names | No universal logo permission established; trademark affiliation/confusion and asset terms must be considered separately | Start with text names and neutral letter tiles; add individually permitted marks later. Do not recolour logos into political sides.[11][13] |
| Publisher `og:image` | Gives a preview image URL, often already cropped for sharing | Open Graph describes metadata, not a reuse licence | Do not treat discovery of the URL as permission to hotlink, cache, or republish.[12][11] |
| Our own share card | Title + one-line Korean takeaway + date + Demo badge when applicable | Use our text/layout and cleared assets; no borrowed photo required | Recommended visual composition; rendering/caching belongs to #11.[1][3] |

**Proposed layout examples, not competitor reproductions:** the first has an editorial hierarchy; the second increases Source visibility. Both deliberately allocate zero space to missing photography. These adapt the text-led patterns identified above.[1][30][37]

```text
TODAY CARD                         EVIDENCE-LED CARD
Topic                              [데모 사건] [보도 상충]
Two-line Story headline            Korean Claim about the disputed point
One-sentence Korean takeaway       Source A: short attributed statement
Source A · Source B · 출처 3개      Source B: short attributed statement
[단일 출처]  사건 갱신 2시간 전     근거 2개 보기 →   변화 보기 →
```

**Proposed exception record:** if imagery is later allowed, record the asset owner, exact licence/permission URL and date, attribution, permitted use and removal path before display. Do not infer an embedded Wikinews image's licence from the surrounding article. Wikimedia Commons requires checking each file's licence/attribution and notes that other Wikimedia projects can have different media policies.[55] Keep alt text factual and avoid repeating an adjacent headline; decorative motifs should not add screen-reader noise. This is a conservative product policy, not a jurisdiction-specific legal clearance.[1][5][11]

### 4. Colour and typography directions

#### 4.1 Reference palette lessons

| Palette reference, checked 2026-09-17 | What was actually established | Proposed transfer |
|---|---|---|
| Kagi News public CSS | App surface white / dark graphite `#232325`; light text role `#18181a`, dark text role `#f3f3f3`; link accents `#6c5edc` / `#c9c1ff`; yellow accent `#ffb319`; translucent purple highlights. This is source inspection, not confirmation of every deployed app build. | Neutral reading surfaces and isolated accents; replace translucent highlights with our audited opaque pair.[42] |
| Particle marketing page | White bold sans heading over a charcoal photographic hero was visually inspected; current reader tokens were not. | Marketing contrast alone cannot determine article typography or dark-mode colours.[29] |
| Wikipedia / MediaWiki diff | Official design discussion describes yellow/blue diff colours and the need for more than colour. | Borrow labelled before/after roles; never encode Source identities with opposing political colours.[40] |
| GOV.UK | Functional text `#0b0c0c`, white body background, yellow focus `#ffdd00`; its guidance prefers role variables over copied raw values. | Stable colour roles and conspicuous focus, while retaining our own palette.[14] |
| IBM / official KRDS | IBM documents palette consistency; KRDS separates primary, secondary, status and surface roles with token naming. | Use a small semantic vocabulary. Unverified competitor colours remain unverified.[15][51] |

The products in §1 supply interview reference boards, not a universal “trust colour.” GOV.UK documents semantic colour roles, dark text on white, strong link treatment and yellow focus; IBM documents a systematic palette. The transferable decision is stable functional roles and contrast, rather than copying their blue brand colours. Source identity remains neutral in both proposed directions; colours below represent actions or states, never political alignment or factual confidence.[14][15][1]

Both directions retain **Pretendard + the existing Korean/system fallbacks**, 17–18px reading text and 1.7–1.8 Korean line height from the earlier work. Use IBM Plex Mono only for short Latin Revision/time identifiers if the owner wants a distinct mono accent; ordinary dates and all Korean prose remain Pretendard. IBM's repository supplies Mono under the Open Font License. This is a visual pairing, not a recommendation to change #11's loading strategy.[4][25]

| Direction | Light / dark character | Type, spacing, shape | Trade-off |
|---|---|---|---|
| **A — Paper & Teal (recommended)** | Warm off-white with deep teal actions; charcoal dark mode with pale teal actions | Pretendard + Plex Mono identifiers; titles 28/36px mobile/desktop, section headings 22/24, card headings 20/22, body 18/18, metadata 14/14; 4/8/12/16/24/32/48px spacing; 8px cards, 6px controls, capsule badges; no card shadow | Reading-first and restrained; status greens require clear text so action styling does not imply truth.[4][7][14][25] |
| **B — Slate & Plum** | Cool near-white with deep plum actions; slate dark mode with pale plum actions | Same font pairing and body baseline; titles 26/32, section 20/24, card 19/21, body 17/18, metadata 14/14; same spacing scale; 4px cards/controls, capsules for badges; hairline divisions, no card shadow | More reference-tool character and slightly denser hierarchy; plum actions must remain spatially distinct from corrected-state badges.[4][7][15][25] |

All sizes are proposed starting values in CSS pixels at a 16px root, implemented as `rem`; they are not Korean population preferences. Line heights: body 1.75 Korean / 1.65 English, headings 1.3–1.4, short metadata at least 1.5. Controls grow with wrapping text, not fixed heights. Do not shrink Evidence to fit a pane. Use a measured reading column around 38rem, with 16px mobile and 24–32px desktop outer padding; verify with actual Claims and zoom.[4][9][17][19]

#### 4.2 shadcn-compatible core tokens

These are **original proposed palettes**, not sampled brand colours. Each cell is an opaque sRGB hex value followed by its calculated OKLCH equivalent. The contrast audit below uses the exact hex values; OKLCH values are rounded to five decimal places and should be checked again in rendered CSS. CSS Color 4 defines the colour space; shadcn's token convention supplies the mapping.[16][52]

| CSS variable | A light | A dark | B light | B dark |
|---|---|---|---|---|
| `--background` | `#faf9f6` / `oklch(0.98205 0.00411 91.446)` | `#18181b` / `oklch(0.21033 0.00586 285.885)` | `#f8fafc` / `oklch(0.98415 0.00341 247.858)` | `#0f172a` / `oklch(0.20768 0.03982 265.755)` |
| `--foreground` | `#1c1917` / `oklch(0.21612 0.00613 56.043)` | `#f4f4f5` / `oklch(0.96743 0.00133 286.375)` | `#0f172a` / `oklch(0.20768 0.03982 265.755)` | `#f1f5f9` / `oklch(0.96826 0.00685 247.896)` |
| `--card` | `#ffffff` / `oklch(1.00000 0.00000 89.876)` | `#27272a` / `oklch(0.27394 0.00548 286.033)` | `#ffffff` / `oklch(1.00000 0.00000 89.876)` | `#1e293b` / `oklch(0.27950 0.03685 260.031)` |
| `--card-foreground` | `#1c1917` / `oklch(0.21612 0.00613 56.043)` | `#f4f4f5` / `oklch(0.96743 0.00133 286.375)` | `#0f172a` / `oklch(0.20768 0.03982 265.755)` | `#f1f5f9` / `oklch(0.96826 0.00685 247.896)` |
| `--primary` | `#115e59` / `oklch(0.43697 0.07052 188.216)` | `#5eead4` / `oklch(0.85488 0.12508 181.071)` | `#581c87` / `oklch(0.38074 0.16608 304.987)` | `#d8b4fe` / `oklch(0.82676 0.10823 306.383)` |
| `--primary-foreground` | `#ffffff` / `oklch(1.00000 0.00000 89.876)` | `#134e4a` / `oklch(0.38606 0.05902 188.416)` | `#ffffff` / `oklch(1.00000 0.00000 89.876)` | `#3b0764` / `oklch(0.29052 0.14324 302.717)` |
| `--muted` | `#e7e5e4` / `oklch(0.92318 0.00256 48.717)` | `#27272a` / `oklch(0.27394 0.00548 286.033)` | `#f1f5f9` / `oklch(0.96826 0.00685 247.896)` | `#1e293b` / `oklch(0.27950 0.03685 260.031)` |
| `--muted-foreground` | `#57534e` / `oklch(0.44442 0.00960 73.639)` | `#d4d4d8` / `oklch(0.87111 0.00545 286.286)` | `#475569` / `oklch(0.44553 0.03745 257.281)` | `#cbd5e1` / `oklch(0.86898 0.01985 252.894)` |
| `--input / --ring` | `#57534e` / `oklch(0.44442 0.00960 73.639)` | `#d4d4d8` / `oklch(0.87111 0.00545 286.286)` | `#475569` / `oklch(0.44553 0.03745 257.281)` | `#cbd5e1` / `oklch(0.86898 0.01985 252.894)` |

Calculated base text ratios (foreground/background): A **16.61 / 16.12**, B **17.06 / 16.30**, light/dark. Primary button text: A **7.58 / 6.41**, B **10.88 / 8.48**. Muted text on the listed page/card audit surfaces: A **7.25 / 10.08**, B **7.24 / 9.85**. These are measured values, not competitor measurements.[7][16]

Map `--popover`/`--popover-foreground` to card tokens; `--secondary` and `--muted` to the secondary surface; their foregrounds to normal and muted text respectively. Use `--accent` for hover surface, with normal foreground; it is not the Evidence highlight. Map `--input` and `--ring` to a visible neutral boundary and explicit focus colour. Decorative separators may be subtle, but boundaries required to identify inputs cannot rely on a faint decorative border. Use foreground-coloured icons, 2px focus outline with a background-coloured offset, and underlined text links. Keep destructive/error styling in its own token, never reuse `--status-conflicting` as an error.[8][26][52]

#### 4.3 Semantic palette and actual contrast measurements

**Measured 2026-09-17.** For each channel `c = byte/255`, linearise with `c/12.92` when `c <= 0.04045`, otherwise `((c + 0.055)/1.055)^2.4`. Compute `L = 0.2126R + 0.7152G + 0.0722B`, then `(max(L1,L2)+0.05)/(min(L1,L2)+0.05)`. The JavaScript calculation was executed during this research. Displayed ratios are rounded to two decimals; pass/fail uses unrounded values. Ordinary text needs 4.5:1; these pairs all exceed that threshold.[7]

| Role | Light text / background | Ratio | Dark text / background | Ratio |
|---|---|---:|---|---:|
| Single source | `#374151` / `#f3f4f6` | 9.37:1 | `#e5e7eb` / `#374151` | 8.33:1 |
| Multiple agree | `#115e59` / `#ccfbf1` | 6.73:1 | `#99f6e4` / `#134e4a` | 7.52:1 |
| Conflicting | `#78350f` / `#fef3c7` | 8.15:1 | `#fde68a` / `#78350f` | 7.28:1 |
| Resolved | `#14532d` / `#dcfce7` | 8.30:1 | `#bbf7d0` / `#14532d` | 7.52:1 |
| Corrected | `#581c87` / `#f3e8ff` | 9.22:1 | `#e9d5ff` / `#581c87` | 7.99:1 |
| Demo | `#44403c` / `#e7e5e4` | 8.18:1 | `#e7e5e4` / `#44403c` | 8.18:1 |
| Evidence highlight | `#422006` / `#fef08a` | 12.52:1 | `#fef9c3` / `#422006` | 13.57:1 |

All seven role pairs pass the ordinary-text threshold in both modes.[7] The following OKLCH definitions map directly to shadcn-style CSS variables; they are proposed tokens to copy only in the later implementation ticket.[16][52]

```css
:root {
  --status-single: oklch(0.96696 0.00287 264.542);
  --status-single-foreground: oklch(0.37293 0.03062 259.733);
  --status-agree: oklch(0.95265 0.04980 180.801);
  --status-agree-foreground: oklch(0.43697 0.07052 188.216);
  --status-conflicting: oklch(0.96190 0.05803 95.617);
  --status-conflicting-foreground: oklch(0.41371 0.10536 45.904);
  --status-resolved: oklch(0.96241 0.04338 156.743);
  --status-resolved-foreground: oklch(0.39253 0.08962 152.535);
  --status-corrected: oklch(0.94643 0.03274 307.174);
  --status-corrected-foreground: oklch(0.38074 0.16608 304.987);
  --demo: oklch(0.92318 0.00256 48.717);
  --demo-foreground: oklch(0.37412 0.00868 67.558);
  --evidence-highlight: oklch(0.94510 0.12430 101.540);
  --evidence-highlight-foreground: oklch(0.28565 0.06393 53.813);
}
.dark {
  --status-single: oklch(0.37293 0.03062 259.733);
  --status-single-foreground: oklch(0.92758 0.00581 264.531);
  --status-agree: oklch(0.38606 0.05902 188.416);
  --status-agree-foreground: oklch(0.90996 0.09270 180.426);
  --status-conflicting: oklch(0.41371 0.10536 45.904);
  --status-conflicting-foreground: oklch(0.92428 0.11513 95.746);
  --status-resolved: oklch(0.39253 0.08962 152.535);
  --status-resolved-foreground: oklch(0.92502 0.08055 155.995);
  --status-corrected: oklch(0.38074 0.16608 304.987);
  --status-corrected-foreground: oklch(0.90236 0.06041 306.703);
  --demo: oklch(0.37412 0.00868 67.558);
  --demo-foreground: oklch(0.92318 0.00256 48.717);
  --evidence-highlight: oklch(0.28565 0.06393 53.813);
  --evidence-highlight-foreground: oklch(0.97292 0.06935 103.193);
}
```

Use each semantic row as `--status-<name>` = background and `--status-<name>-foreground` = text. For Demo use `--demo`/`--demo-foreground`, and for the highlighted span use `--evidence-highlight`/`--evidence-highlight-foreground`. Shared semantic values are identical in A and B, so brand choice cannot change the meaning or measured badge contrast. The table's foreground also supplies badge icons and the mark's boundary; do not lower opacity, overlay a gradient, or inherit muted text inside the mark.[7][8][16][52]

The mark's yellow fill is **not** claimed to contrast 3:1 against a white page; its text, explicit label and foreground-coloured rule convey the selection. Likewise, pale badge backgrounds are not control outlines. Use a stronger neutral border/ring when a badge has an action. Contrast ratios verify colour pairs only, not whole-page WCAG conformance; keyboard, focus, text scaling and state announcements still require implementation checks.[7][8][26]

**Focus and boundaries:** use `#57534e` in A light, `#d4d4d8` in A dark; `#475569` in B light, `#cbd5e1` in B dark. Against their listed card and page surfaces these exceed 3:1; isolate the ring with the surface-coloured offset when adjacent to a filled action. Hover must keep the same readable foreground/background pair; add underline or border emphasis rather than undocumented opacity changes. In forced colours, preserve text labels and native focus behaviour. System dark mode is the initial preference; an optional System/Light/Dark control must not remove the system option.[4][8][18]

### 5. Information architecture and wireframes

#### 5.1 Story first: mobile accordion and desktop Evidence view

**Proposed M1 layout.** The following is a deliberately fictional Demo Story, not a factual news claim. All P-numbers refer to §2.1; timestamps illustrate formatting only. Choose the two-column layout when both a readable Claim column and Evidence column fit (starting experiment: 64rem viewport); use one column when zoom or content makes them cramped. This is a content-dependent breakpoint proposal, not a standards requirement.[1][3][9]

```text
MOBILE — 360–430 CSS px; also the narrow/zoomed layout
┌────────────────────────────────────────────┐
│ Skip to Claims · Home                      │
│ [데모 사건] P10    Topic                    │
│ Fictional agency changes a launch date      │
│ Demo explanation; AI-written Claims         │
│ [보도 상충] P06  출처 2개 P03               │
│ 데모 기준 시각 2026. 9. 17. 오전 6:00 KST P09│
│ [Follow] [Share]                            │
│ P11 operational notice, only if applicable  │
│ Anchors: 주장 / 출처 / 변화                 │
├────────────────────────────────────────────┤
│ 주장                                       │
│ 1. The Korean Claim remains visible.        │
│ [단일 출처] P06 · explanation               │
│ [v 근거 1개 보기] P04                      │
│   Fictional Source A · article/date P02     │
│   English authorised excerpt               │
│   [marked supporting span] P04             │
│   [원문 보기] [한국어 번역 보기] P12         │
│   If requested: 기계 번역(MT) · 참고용       │
│                                            │
│ 2. The Korean disputed Claim stays visible. │
│ [보도 상충] P06                            │
│ [> 근거 2개 보기] P04                      │
│   Expanded: disputed point P05             │
│   Source A: English span + article date    │
│   Source B: English span + article date    │
│   Per-span original links and MT controls  │
├────────────────────────────────────────────┤
│ 출처 — 2 named Sources P02/P03             │
│ Articles, publication times, rights labels │
│ P13 volume figure + [표로 보기]             │
├────────────────────────────────────────────┤
│ 변화 — comparison baseline explained       │
│ P08 summary: Claim / status / article      │
│ [출처 추가 1개 펼치기]                     │
│ P07 dated Revision list (wraps vertically) │
│ Guest: login benefit; history still public │
└────────────────────────────────────────────┘
Navigation in normal flow: 오늘 · 팔로우 · 검색 · 소개
```

```text
DESKTOP — centred maximum 76rem container
┌─────────────────────────────────────────────────────────────────────────┐
│ Brand             오늘     팔로우     검색     소개           Theme     │
│ [데모 사건] P10  Topic · Story headline                 Follow · Share  │
│ Demo/AI explanation · P06 state · P03 Sources · P09 time · P11 notice   │
│ Section anchors: 주장 / 출처 / 변화                                     │
├─────────────────────────────────────┬───────────────────────────────────┤
│ CLAIM READING COLUMN (~38rem)       │ SELECTED EVIDENCE (~32rem)        │
│ 주장                                │ 주장 2 근거 · repeated short Claim│
│ 1 Korean Claim + P06               │ Disputed point P05                │
│ [근거 1개 보기] P04                │ Source A / article / time P02     │
│                                    │ English excerpt, span marked P04 │
│ 2 Korean Claim + P06 [selected]    │ Original link · MT P12            │
│ [근거 2개 보기] P04                │ -------------------------------- │
│ [선택한 근거로 이동]               │ Source B / article / time P02     │
│                                    │ English excerpt, span marked P04 │
│ 3 Korean Claim + P06               │ Original link · MT P12            │
│ [근거 보기] P04                    │ [주장 2로 돌아가기]                │
├─────────────────────────────────────┴───────────────────────────────────┤
│ 출처: named Source/article rows P02/P03 · permitted-use descriptions     │
│ P13 article-volume figure, explanatory caption, accessible table         │
├─────────────────────────────────────────────────────────────────────────┤
│ 변화: P08 material Change summary · Source-only disclosure               │
│ P07 Revision strip + dated rows · current / account Last Seen labels     │
└─────────────────────────────────────────────────────────────────────────┘
```

**Section behaviour:** use document anchors for Claims/Sources/Changes, not exclusive tab panels: all three sections remain discoverable and printable. On first load, opening the first Claim's Evidence is a proposal to make the pairing immediately apparent; all other Claims remain visible. Deep links to a Claim open its Evidence. A Story-wide status, if supplied by the domain, sits in the header; Claim-specific statuses remain local. No inferred header status should be composed in the browser.[1][2][3]

**Revision and Change behaviour:** show what changed since the account's incoming Last Seen Revision, then retain that comparison for the current visit even when opening the Story updates Last Seen. Otherwise the view could erase its own explanation. For a guest, show public Revision history and a clearly named baseline such as previous Revision; offer login only for personal “since last read” tracking. If no prior personal baseline exists, say `처음 보는 사건입니다` instead of inventing a remembered visit. P08 uses before/after text labels, and P07 uses a labelled ordered list; do not communicate addition/deletion only through red/green fills.[2][3][26]

**Volume figure:** count Articles by explicitly stated date bucket and timezone, label the coverage window and gaps, and show the same values in a table. Caption: reporting volume describes collected coverage, not importance or accuracy. Revision counts are separate from Article counts. At narrow widths the Revision strip becomes a vertical list; it never requires a drag gesture. Chart library choice is intentionally left to #11.[1][3][5]

#### 5.2 The other four screens, mobile and desktop

These wireframes are design proposals using the same shell and pattern IDs. The navigation offers Today, Follow, Search and About; Story is the linked detail screen rather than an empty global navigation destination. They retain the four fixed Topics and a separate Demo area.[1][3]

```text
TODAY — MOBILE                         TODAY — DESKTOP
┌──────────────────────────────┐       ┌────────────────────────────────────────┐
│ 오늘                         │       │ Navigation · 오늘                     │
│ Last success + next P09       │       │ P09 freshness + P11 service state     │
│ P11 quota / paused notice    │       ├─────────────┬──────────────────────────┤
│ Four Topic anchor links      │       │ Four Topic  │ Topic heading            │
│ Topic heading                │       │ anchors     │ P01 Story list           │
│ P01 Story headline           │       │             │ P02/P03 Sources · P06    │
│ takeaway · P02/P03 · P06/P09 │       │             │ P09 times                │
│ More Stories / next Topic    │       │             │ Next Topic + P01         │
│ End of published Stories     │       ├─────────────┴──────────────────────────┤
│ Separate Demo group P10/P01  │       │ Separate Demo group P10/P01            │
└──────────────────────────────┘       └────────────────────────────────────────┘

FOLLOW — MOBILE                        FOLLOW — DESKTOP
┌──────────────────────────────┐       ┌────────────────────────────────────────┐
│ 팔로우 · P09/P11             │       │ Navigation · 팔로우 · P09/P11          │
│ Signed out? Benefit + login  │       ├─────────────┬──────────────────────────┤
│ [Kakao] [Google] [Read first]│       │ Followed    │ Story changes P08        │
│ Signed in: followed Topics   │       │ Topics      │ P01 + P06 + P09          │
│ followed Stories P01        │       │             │ Follow/unfollow control  │
│ P08 since last read + P06   │       │             │ No new Changes P11       │
│ [Unfollow]                  │       ├─────────────┴──────────────────────────┤
│ Empty / no new Changes P11  │       │ Demo follows separately labelled P10   │
└──────────────────────────────┘       └────────────────────────────────────────┘

SEARCH — MOBILE                        SEARCH — DESKTOP
┌──────────────────────────────┐       ┌────────────────────────────────────────┐
│ 검색                         │       │ Navigation · 검색                     │
│ [Labelled query       ][Go] │       │ [Labelled query                 ][Go] │
│ P09 corpus time · P11 state │       │ P09 corpus time · P11 state            │
│ Result count                │       │ Results in one readable column         │
│ P01 headline + Claim match  │       │ P01 headline + matching Claim          │
│ P02/P03 · P06 · P09         │       │ P02/P03 · P06 · P09                    │
│ Zero result/retry P11       │       │ Zero result/retry P11                  │
│ Separate Demo results P10  │       │ Separate Demo results P10              │
└──────────────────────────────┘       └────────────────────────────────────────┘

ABOUT — MOBILE                         ABOUT — DESKTOP
┌──────────────────────────────┐       ┌────────────────────────────────────────┐
│ 소개                         │       │ Navigation · 소개                     │
│ What the product does        │       ├─────────────┬──────────────────────────┤
│ Rights / English + MT P12    │       │ Contents    │ Purpose / scope          │
│ Cadence and status P09/P11   │       │ anchors     │ Source rights / MT P12   │
│ Five status meanings P06    │       │             │ Cadence + P09/P11        │
│ Demo explanation P10        │       │             │ Status legend P06        │
│ Corrections/deletion request│       │             │ Demo explanation P10     │
│ Privacy · evaluation links  │       │             │ Requests/privacy/evals   │
└──────────────────────────────┘       └────────────────────────────────────────┘
```

Search results display a relevant Claim excerpt as navigation context, not a model relevance/confidence percentage. Follow does not become a recommendation feed inferred from behaviour. About explains the rights policy in reader language; implementation details belong in linked evaluation/technical material. All screen states use §2.5; do not invent new loading or quota meanings for each page.[1][2][3]

#### 5.3 M1 accessibility walkthrough acceptance material

Use one hand-authored Demo Story set containing all five statuses, one explicit Correction, one silent Article Change, Source-only additions, an English span with MT, and a first Revision with no Changes. Also include long Korean names, a long original URL, multiple Evidence spans and all P11 states. This is a proposed fixture coverage list, not a request to add real reporting or redefine the domain.[1][2][3]

| Check | Observable outcome to review after implementation |
|---|---|
| Keyboard core loop | From Today open Demo Story, reach Claims through skip/anchor links, open two Evidence blocks, read original links, request MT, inspect disagreement, reach Sources and Changes, and return. No hover prerequisite or focus trap.[5][6] |
| Desktop panel | Trigger remains focused; selected Claim is explicit; jump to Evidence and back works; an earlier Claim's span is never shown under a later Claim's label.[18][26] |
| 200% text resize | No clipped status labels, lost MT buttons or fixed-height cards; panels become one column if necessary.[17] |
| Reflow and text spacing | Prose works at 320 CSS px; user text-spacing overrides do not overlap badges or navigation. Scrollable data alternatives cannot hide essential Claim/Evidence content.[9][19] |
| Focus and targets | Visible focus remains unobscured; no sticky header/footer hides it. Design ordinary touch controls around 44px for comfort; WCAG AA's minimum is 24×24 CSS px or applicable spacing/exception, not universally 44px.[18][27] |
| Light / dark / reduced motion | Measured pairs survive actual hover, focus, links and highlights; no shimmering/pulsing urgency or automatic smooth-scroll requirement; no flash or forced animation.[5][7][8] |
| Status and language | Loading/result/error announcements are useful without repeating all prose; document language is Korean, English passages tagged English, MT visibly labelled.[5][10] |
| axe and in-app evidence | Record results of axe and the keyboard walkthrough at mobile/desktop sizes, plus KakaoTalk reading/login manual checks. Passing these is evidence toward the target, not an accessibility audit certificate.[3][5][22] |

### 6. Open-source references and licences

**Verified 2026-09-17:** the eight repository licences below were read from actual licence files. Code inspection was limited to the listed entrypoints; none of these projects was installed or subjected to an accessibility audit. Mutable branch links are reading pointers, not pinned dependencies. Use them within the already chosen shadcn/Base UI stack.[4][42][43][44][45][46][47][48][49]

| Reference / licence | Read first | Useful design lesson / boundary |
|---|---|---|
| **Kagi News — `kagisearch/kite-public`**; **MIT code**, separately **CC BY-NC application data** | [StorySources.svelte](https://github.com/kagisearch/kite-public/blob/main/src/lib/components/story/StorySources.svelte); sibling StoryCard/CitationItem/CitationText/CitationTooltip/StoryTimeline files | Inspected Source grouping, publisher/article counts and dates. Closest Story structure reference. MIT code does not clear data or third-party assets for reuse.[42] |
| **Ko-KagiNews — `Laeyoung/Ko-KagiNews`**; **MIT code**, inherited data restriction | README, `src/lib/locales/ko.json`, `src/app.css` | Explicitly unofficial and unaffiliated. Inspect Korean string lengths/localisation. Its Korean-first pretranslation and hideable Sources conflict with our English-original default. No `keep-all` implementation claim was verified; retain the project baseline.[43][4] |
| **Morphic — `miurla/morphic`**; **Apache-2.0** | [citation-link.tsx](https://github.com/miurla/morphic/blob/main/components/citation-link.tsx), citation context | Inspected preview orders hostname/title/content. Useful metadata hierarchy; do not copy small, hover-oriented citations without explicit accessible actions.[44][6] |
| **Vane, formerly Perplexica — `ItzCrazyKns/Vane`**; **MIT** | [MessageSources.tsx](https://github.com/ItzCrazyKns/Vane/blob/master/src/components/MessageSources.tsx); `MessageRenderer/Citation.tsx` | Inspected first-three-source cards and a more dialog. Borrow progressive disclosure; never make truncated Evidence the only accessible representation.[45] |
| **HANUI — current `oddodd-io/hanui`**; **MIT** | `packages/react/src/components/badge.tsx`; `packages/core/src/tokens/{colors,typography,spacing}.ts` | The brief's owner URL redirects here. Badge source includes decorative icons/variants. Use Korean labels/token roles as references; this is a community implementation, not official KRDS certification.[46] |
| **KRDS React — `KRDS-community/krds-react`**; **Apache-2.0, not the brief's proposed MIT** | `packages/core/lib/components/Accordion.tsx`; `stories/core/Accordion.stories.ts` | Read disclosure structure, not as a replacement primitive. The inspected file's ARIA references lacked matching attached IDs; this limited observation is another reason not to treat README accessibility claims as an audit.[47][6] |
| **Miniflux — `miniflux/v2`**; **Apache-2.0** | `internal/template/templates/views/entry.html`; `internal/ui/static/css/{light,dark,sans_serif,serif,system}.css` | Inspected title/feed/author/Source URL/date/content hierarchy. Theme-file existence was verified, not all rendered states.[48] |
| **Readeck — official Codeberg repository**; **AGPL v3** | README and LICENSE; later inspect saved article/highlight views | README documents highlights, annotations, labels and collections. UI runtime was not inspected. Follow the brief's **read, never copy** boundary; this is our reuse decision, not a claim that AGPL universally prohibits copying.[49][1] |

**Additional official references:** shadcn's own **Blocks** gallery and **MIT-licensed** repository provide dashboard/shell examples; read spacing, headings and composition, not analytics-card density. Official **KRDS** colour, typography and token docs offer Korean public-service role naming. Their documentation/asset permissions are distinct from community repository licences; no blanket permission for every KRDS or Figma asset was established here.[50][51]

**Reading order proposal:** Kagi Source/Evidence structure → Morphic citation metadata → Miniflux reading hierarchy → Korean kit labels/spacing → chosen shadcn/Base UI primitives. Any later permitted code reuse must preserve required notices and separately check bundled asset/font terms; this task adopts no external code or datasets.[42][44][46][47][48][50]

### 7. A concrete workflow for a non-designer

**Proposal: iterate in code after a very small reference board.** The existing stack is fixed. shadcn theming uses semantic CSS variables, while the colour editor and reference systems below can support visual exploration. This workflow is for Claude's later implementation; this research changes no components, tokens or application files.[1][4][52]

1. **Make a four-reference board inside the interview:** Kagi for Story structure, NotebookLM for Claim-to-passage navigation, GitHub for understandable before/after comparison, and GOV.UK for functional colour/focus roles. For each, record “copy the principle” and “do not copy” in one sentence; link the original illustration rather than making a generic inspiration collage. Use §1's dated references.[30][38][41][14]
2. **Choose A or B using one identical Demo Story.** Hold content, width and statuses fixed; compare only hierarchy, palette and density. Preview mobile and desktop, light and dark. A theme generator is a starting palette, not a proof of contrast or Korean readability; retain the audited semantic pairs.[4][7][52][53]
3. **Use shadcn's theme controls or tweakcn to inspect token changes.** Export only the chosen semantic variables into the existing Tailwind v4 setup during implementation. Radix Colors can inform surfaces/interaction scales without changing Base UI primitives; a colour palette dependency is not a component-library migration.[52][53][54]
4. **Build a small in-code specimen with real-length fixtures.** Show Story title, Claim, all five badges, named Source row, English Evidence highlight, MT, Change row, Demo identity and P11 blocks together. Reuse the same components on the five screens. First approve a coherent Story view; then apply its tokens to lists and About.[1][3][4]
5. **Use Figma only if it helps the owner choose.** Two frames for A/B with linked references are sufficient. Community files require their own licence and component-base checks; “free file” does not establish reusable asset rights. Skipping Figma avoids maintaining a second visual source of truth for a solo developer; this is a workflow preference, not a measured productivity result.[1][52]
6. **Constrain AI visual work.** v0 documents screenshot-driven generation and design-system context; Figma documents AI editing and possible inaccuracies. Use tools for alternative spacing/hierarchy or a rough prototype with supplied tokens and fixture copy. Review for fabricated Sources, missing states, inaccessible controls, English text replacing Korean, and extra charts/scores. Their documentation establishes capabilities, not autonomous correctness or comparative quality in September 2026.[23][24]
7. **Review one task, then freeze the vocabulary.** Ask a reader to locate an English span, explain a conflict, identify a Demo Story and describe what changed. Fix misunderstandings before decorative polish. When the owner chooses a direction, Claude can carry the chosen tokens and copy into the appropriate implementation ticket; do not expand this research into an unapproved design-system rewrite.[1][2][3]

**Review checklist, proposed for every visual change:** hierarchy (headline → Claim → Evidence is unmistakable); consistency (one token per meaning, one Source style); contrast (actual foreground/background pairs in both modes); density (readable original and MT without truncation); states (all five P11 outcomes plus first Revision); time (publication/check/schedule distinguished); identity (Demo survives every entry/share route); interaction (keyboard/zoom/reduced motion); rights (no unexplained photo/logo). Record observed failures and fixes, not a subjective “looks trustworthy” score.[1][3][7][8][9][10][17][18]

### 8. Korean reading UX and time conventions

**Evidence boundary, 2026-09-17:** the Reuters Institute's South Korea chapter, published 2026-06-16 by Korea Press Foundation researchers, describes declining portal news use and growth in short-form/video consumption. This supports testing portal/share entry and a concise first screen; it does not quantify KakaoTalk in-app-browser traffic or prove that Korean readers prefer dense screens. Kakao publishes browser/SDK guidance, but that is compatibility documentation, not audience share. No primary measurement establishing the target audience's preferred density or in-app-browser percentage was obtained.[20][22]

**Proposed reading experience:** start with a readable Claim list and optional deeper Evidence; use familiar Source names and clear absolute dates without reproducing a crowded portal home page. Keep the 17–18px/1.7–1.8 baseline already answered in `02-ux.md`; test `keep-all` with `overflow-wrap: anywhere` on long mixed-script names and URLs. A line should wrap rather than force horizontal scrolling. Use 16px side padding at narrow widths, allow metadata rows to wrap, and do not apply one-line ellipses to the Claim's evidentially important qualifiers.[4][9][19]

**Tone proposal:** Korean Claims use restrained report style (`…라고 밝혔다`, `…라고 보도했다`) with attribution and preserved uncertainty; no casual mascot voice, sensational exclamation, honorific promotion of officials, or editorial “obviously.” Controls and failures use concise polite wording (`근거를 불러오지 못했습니다. 다시 시도해 주세요.`). The final generation style and Claim length belong to #10; this is a UI tone recommendation, not a claim that all Korean audiences prefer one honorific register.[1][2][3]

**Original and MT:** label English as `영어 원문`, then optionally add `한국어 기계 번역(MT) · 참고용`. Never replace the original invisibly. Preserve Source attribution, amounts, dates, negation and uncertainty; keep the original-article action distinct from translation. The translated text remains a convenience rendering of Evidence, not a new Source or independently verified Claim.[1][2][3]

| Context | Proposed display rule | Reason / caveat |
|---|---|---|
| Today and Story header | Always show last successful absolute date/time and KST; optionally add `2시간 전` | Freshness must remain interpretable in screenshots/shared context; a relative label alone ages ambiguously.[3][21] |
| Story cards / Search / Follow | Under 1h: `N분 전` (under 1 minute: `방금`). Under 24h: `N시간 전`. After that: `9월 16일`; include year outside the current year | These thresholds are product proposals, not an established Korean portal standard; full date available through an explicit detail link, not hover-only.[21][5] |
| Evidence article header | Absolute `2026. 9. 17. 오전 9:30 KST`; original publication timezone available when known | Readers compare publication times across English Sources. Never invent time-of-day when a Source provides date only.[2][21] |
| Revision / Correction / Change | Absolute date/time plus named comparison baseline; current and Last Seen labelled separately | A time label cannot replace Revision identity or imply a Correction where only an Article Change exists.[2][3] |
| Same-day label | `오늘` only as supplemental text; not the sole timestamp on Evidence or Changes | “Today” can be misread across zones or later screenshots; KST is the declared display zone.[21][2] |
| Quota / paused / delayed | Last success stays fixed; next scheduled attempt and actual publication are distinct; unknown resume is explicit | Do not promise a future successful update or reset time the backend has not supplied.[3] |
| Demo | `데모 기준 시각` with a fixed absolute time; optional labelled scenario progression | No misleading live freshness indicator on a hand-authored fixture.[1][2] |

CLDR's Korean examples support year–month–day ordering and Korean date/time forms, not our relative-age cut-offs. Format for `ko-KR` and `Asia/Seoul`; retain machine-readable source timestamps. If the original date is incomplete or timezone unknown, show that limitation instead of silently converting guessed data. Relative-time refreshes should not repeatedly announce themselves to assistive technology.[21][10]

## Options & trade-offs

All options are interview-ready proposals dated 2026-09-17; none changes the fixed scope.[1]

| Decision | Option A | Option B | Recommended choice |
|---|---|---|---|
| Visual direction | Paper & Teal: reading-led, 18px body, 8px cards | Slate & Plum: denser hierarchy, 17/18px body, 4px cards | A; both use the same tested semantic colours.[4][7][14][16] |
| First mobile Evidence view | First Claim expanded | All Evidence initially collapsed | First expanded, so the product's evidence promise is visible; test scroll cost.[1][6][38] |
| Disagreement | Stacked named rows, optionally side-by-side if space allows | Source A/B tabs | Rows: both assertions remain available simultaneously.[1][2][9] |
| Imagery | Text-first; individually cleared assets as later exceptions | Photo-led cards with per-asset rights workflow | Text-first for M1 and launch baseline.[11][12] |
| Time | Absolute header + optional relative card cue | Absolute everywhere | Hybrid, with absolute Evidence/Revision dates always visible.[2][3][21] |
| Design workspace | Tokens and fixture-driven code previews | Small Figma board then code | Code as the durable visual source; Figma optional for owner comparison.[52][53][24] |
| Citation preview | Explicit accordion/pane actions | Add hover previews | Explicit actions only in M1; hover preview can wait.[6][5][38] |

## Recommendation

Adopt **Paper & Teal**, text-first Story cards, neutral Source identity and the shared five-state palette. Treat the **Story's Claim → original Evidence → Change** path as the visual centre. Keep Claims visible, pair them with mobile accordions and a desktop Evidence pane, and place named disagreement rows inside that pairing. English Evidence stays primary; Korean MT is a clearly labelled addition.[1][2][3][4][7]

For M1, prioritise the complete fixture matrix and interaction contract in §§2 and 5: all five status labels, readable marked spans, persistent Demo identity, first/no-change Revisions, state-specific recovery, accurate freshness labels, and the two responsive layouts. A passing colour calculation is already available here; actual axe results, keyboard walkthrough, zoom, dark-mode and KakaoTalk checks remain implementation evidence to collect.[1][3][5][7][22]

**Proposals for Claude to carry into the owner interview:** choose A/B and initial accordion state; adopt the image policy, relative/absolute time convention, status copy and screen-state matrix; record the chosen tokens in the eventual implementation. Keep status transitions with #10, infrastructure/authentication policy with their owning issues, and libraries/tooling/OG rendering with #11. No spec, ADR, code or other research file was edited by this report.[1][3]

## Open questions for the interview

1. **Which visual direction should represent the product: A — Paper & Teal (recommended), or B — Slate & Plum?** Both keep the same Korean reading baseline and semantic status colours.[4][7]
2. **On first mobile entry, should the first Claim's Evidence be expanded (recommended), all Evidence be collapsed, or all be expanded for the Demo Story only?** This changes initial density, not access to Evidence.[1][6]
3. **Should imagery remain text-only for v1 (recommended), allow individually licensed explanatory images, or allow clearly labelled abstract Topic motifs?** Publisher images still require asset-level rights confirmation.[11][12]
4. **Should cards show relative age plus accessible full date (recommended), or visible absolute dates everywhere?** Headers, Evidence and Revisions keep visible absolute timestamps either way.[2][3][21]
5. **For the second visual review, should we use browser-only A/B fixtures (recommended), a two-frame Figma board, or both?** This chooses the interview medium, not a new component stack.[4][24][52]

## Sources

1. [Issue #12 brief](briefs/12-uiux-design-research.md), local task contract; 2026-09-16 context, read 2026-09-17. The user supplied an additional M1 focus dated 2026-09-17.
2. [Project glossary](../../CONTEXT.md), local authority, read 2026-09-17.
3. [Product specification v1](../spec/v1.md), draft dated 2026-09-16, local authority, read 2026-09-17; especially Sources, batch/budget, screens, and acceptance criteria.
4. [Prior UX research](02-ux.md), dated 2026-09-15, read 2026-09-17; component baseline around line 168 and Korean typography around lines 203–206 and the adjoining table.
5. [W3C WCAG 2.2 Recommendation](https://www.w3.org/TR/WCAG22/), displayed Recommendation date 2024-12-12; accessed 2026-09-17.
6. [W3C APG Accordion Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/accordion/), living guidance, accessed 2026-09-17.
7. [W3C Understanding SC 1.4.3 — Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), living guidance and luminance definitions; accessed 2026-09-17. Palette ratios are this report’s calculations on that date.
8. [W3C Understanding SC 1.4.11 — Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), living guidance, accessed 2026-09-17.
9. [W3C Understanding SC 1.4.10 — Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), living guidance, accessed 2026-09-17.
10. [W3C Understanding SC 4.1.3 — Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html), living guidance, accessed 2026-09-17.
11. [GNews Terms of Service](https://gnews.io/legal/terms-of-service), updated 2026-06-22, especially §§3.3, 5.2 and 6.2; accessed 2026-09-17.
12. [Open Graph protocol](https://ogp.me/), living specification, accessed 2026-09-17; metadata definition, not a content-reuse permission.
13. [USPTO — About Trademark Infringement](https://www.uspto.gov/page/about-trademark-infringement), US primary guidance, accessed 2026-09-17; supports the distinction between logo use and implied affiliation, not a Korean legal conclusion.
14. [GOV.UK Design System — Colour](https://design-system.service.gov.uk/styles/colour/), living design guidance, accessed 2026-09-17.
15. [IBM Design Language — Color](https://www.ibm.com/design/language/color/), primary indexed documentation accessed 2026-09-17; direct page fetch timed out, so no exact current IBM colour values are asserted.
16. [W3C CSS Color Module Level 4 — Oklab/OKLCH](https://www.w3.org/TR/css-color-4/#ok-lab), living specification, accessed 2026-09-17.
17. [W3C Understanding SC 1.4.4 — Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html), living guidance, accessed 2026-09-17.
18. [W3C Understanding SC 2.4.11 — Focus Not Obscured (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html), living guidance, accessed 2026-09-17.
19. [W3C Understanding SC 1.4.12 — Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html), living guidance, accessed 2026-09-17.
20. [Reuters Institute Digital News Report 2026 — South Korea](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2026/south-korea), published 2026-06-16, Korea Press Foundation authors; accessed 2026-09-17.
21. [Unicode CLDR 48 — Korean Date/Time Charts](https://unicode.org/cldr/charts/48/verify/dates/ko.html), versioned locale examples, accessed 2026-09-17.
22. [Kakao Developers — JavaScript Getting Started](https://developers.kakao.com/docs/en/javascript/getting-started), living browser/SDK guidance, accessed 2026-09-17.
23. [v0 — Screenshots and Files](https://v0.app/docs/screenshots) and [Design Systems 2.0](https://v0.app/docs/design-systems-2), primary indexed documentation accessed 2026-09-17; direct screenshot-document fetch returned an unsupported Markdown content-type, so capabilities are attributed to its indexed documentation.
24. [Figma — Use AI tools in Figma Design](https://help.figma.com/hc/en-us/articles/23870272542231-Use-AI-tools-in-Figma-Design), living help including the 2026-05-20 agent rollout note, accessed 2026-09-17.
25. [IBM Plex](https://github.com/IBM/plex), first-party repository and linked OFL-1.1 licence, accessed 2026-09-17.
26. [W3C Understanding SC 1.4.1 — Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html), living guidance, accessed 2026-09-17.
27. [W3C Understanding SC 2.5.8 — Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), living guidance, accessed 2026-09-17.
28. Ground News [FAQ](https://ground.news/frequently-asked-questions) and [product reference](https://ground.news/), undated living pages, accessed 2026-09-17.
29. Particle [introduction](https://particle.news/blog/introducing-particle-the-news-organized), launch-era illustrated material, publication year not confirmed; [Android gallery](https://particle.news/android); [Apple editorial overview](https://apps.apple.com/us/ipad/story/id1872536813). Accessed 2026-09-17. Only the marketing hero was visually inspected, not app-gallery pixels.
30. Kagi [launch gallery](https://blog.kagi.com/kagi-news), 2025-09-30; [live briefing](https://news.kagi.com/); [changelog](https://kagi.com/changelog), 2026-09-10 translation change; [regional changelog](https://us-east.kagi.com/changelog), 2026-04-30 Correction notice/highlight entry. Accessed 2026-09-17.
31. Apple [Today guide](https://support.apple.com/guide/iphone/see-news-stories-chosen-just-for-you-iph5b557ed3d/ios), [reading guide](https://support.apple.com/en-ie/guide/iphone/iphc2090b0d2/ios), [News publishing](https://developer.apple.com/documentation/AppleNews), [article dark scheme](https://developer.apple.com/documentation/applenews/giving-the-article-a-dark-color-scheme). Living documentation, accessed 2026-09-17.
32. Google News [redesign gallery](https://blog.google/intl/en-ca/products/explore-get-answers/read-all-about-it-a-new-look-for-google-news/), 2022-06-22; [earlier coverage/card design](https://blog.google/company-news/outreach-and-initiatives/google-news-initiative/redesigning-google-news-everyone/), 2017-06-27; [dark-mode settings](https://support.google.com/googlenews/answer/7688469?hl=en-GB), living help. Accessed 2026-09-17.
33. SmartNews [product gallery](https://www.smartnews.com/en), [app-use help](https://support.smartnews.com/hc/en-us/sections/200964118-Using-the-SmartNews-App), [Dark Mode](https://support.smartnews.com/hc/en-us/articles/900001186986-How-to-switch-to-Dark-Mode). Living first-party material, accessed 2026-09-17.
34. [Naver AI Briefing release and images](https://www.navercorp.com/media/pressReleasesDetail?seq=32374), published 2025-03-24, accessed 2026-09-17; integrated search, not all Naver News pages.
35. [Newneek developer-authored Play listing](https://play.google.com/store/apps/details?id=com.newneek.newneekapp), displayed update 2026-09-04, accessed 2026-09-17; linked screenshot gallery not independently audited.
36. [UPPITY](https://uppity.co.kr/) and [company/brand page](https://uppity.co.kr/company/), living pages with September 16 content retrieved, accessed 2026-09-17.
37. Feedly [view modes](https://docs.feedly.com/article/276-how-do-i-change-the-views-of-my-feeds-and-source), updated 2020-10-26; [preferences](https://docs.feedly.com/category/471-preferences), living help. Accessed 2026-09-17.
38. [NotebookLM citation help, now redirected to a Gemini Notebook-titled page](https://support.google.com/gemininotebook/answer/16179559?hl=en), living Google help, accessed 2026-09-17; no rebrand date inferred.
39. Elicit [report evaluation](https://elicit.com/blog/elicit-reports-eval), historical evaluation, exact publication date not established; [API reference](https://docs.elicit.com/), living documentation. Accessed 2026-09-17.
40. MediaWiki [Help:Diff](https://www.mediawiki.org/wiki/Help:Diff) and [Codex design discussion](https://www.mediawiki.org/wiki/Codex/Design/Diffs), living documentation, accessed 2026-09-17; design proposals distinguished from shipped behaviour.
41. GitHub [diff/branch documentation](https://docs.github.com/en/pull-requests/reference/branches), living help; [Files changed preview](https://github.blog/changelog/2025-06-26-improved-pull-request-files-changed-experience-now-in-public-preview/), 2025-06-26. Accessed 2026-09-17.
42. Kagi [repository/README](https://github.com/kagisearch/kite-public), [MIT licence](https://raw.githubusercontent.com/kagisearch/kite-public/main/LICENSE), [StorySources](https://raw.githubusercontent.com/kagisearch/kite-public/main/src/lib/components/story/StorySources.svelte), [app CSS](https://raw.githubusercontent.com/kagisearch/kite-public/main/src/app.css). Current branch inspected 2026-09-17; README separates CC BY-NC data from code.
43. Ko-KagiNews [repository](https://github.com/Laeyoung/Ko-KagiNews), [MIT licence](https://raw.githubusercontent.com/Laeyoung/Ko-KagiNews/main/LICENSE), [app CSS](https://raw.githubusercontent.com/Laeyoung/Ko-KagiNews/main/src/app.css). Current branch inspected 2026-09-17.
44. Morphic [README](https://github.com/miurla/morphic/blob/main/README.md), [Apache-2.0 licence](https://raw.githubusercontent.com/miurla/morphic/main/LICENSE), [citation-link](https://raw.githubusercontent.com/miurla/morphic/main/components/citation-link.tsx). Current branch inspected 2026-09-17.
45. Vane [repository](https://github.com/ItzCrazyKns/Vane), [MIT licence](https://raw.githubusercontent.com/ItzCrazyKns/Vane/master/LICENSE), [MessageSources](https://raw.githubusercontent.com/ItzCrazyKns/Vane/master/src/components/MessageSources.tsx), [rename discussion](https://github.com/ItzCrazyKns/Vane/discussions/1108), discussion 2026-04-14. Current branch accessed 2026-09-17.
46. HANUI [current README](https://raw.githubusercontent.com/oddodd-io/hanui/main/README.md), [MIT licence](https://raw.githubusercontent.com/oddodd-io/hanui/main/LICENSE), [badge](https://raw.githubusercontent.com/oddodd-io/hanui/main/packages/react/src/components/badge.tsx). Current branch inspected 2026-09-17; original owner URL redirects.
47. KRDS React [README](https://raw.githubusercontent.com/KRDS-community/krds-react/main/README.md), [Apache-2.0 licence](https://raw.githubusercontent.com/KRDS-community/krds-react/main/LICENSE), [Accordion](https://raw.githubusercontent.com/KRDS-community/krds-react/main/packages/core/lib/components/Accordion.tsx). Current branch inspected 2026-09-17.
48. Miniflux [repository](https://github.com/miniflux/v2), [Apache-2.0 licence](https://raw.githubusercontent.com/miniflux/v2/main/LICENSE), [entry template](https://raw.githubusercontent.com/miniflux/v2/main/internal/template/templates/views/entry.html). Current branch inspected 2026-09-17.
49. Readeck [official README](https://codeberg.org/readeck/readeck/raw/branch/main/README.md), [AGPL v3 licence](https://codeberg.org/readeck/readeck/raw/branch/main/LICENSE). Accessed through direct public HTTP reads 2026-09-17; UI/runtime not audited.
50. shadcn [Blocks](https://ui.shadcn.com/blocks), [repository](https://github.com/shadcn-ui/ui), [MIT licence](https://raw.githubusercontent.com/shadcn-ui/ui/main/LICENSE.md). Accessed 2026-09-17.
51. Official KRDS [colour](https://www.krds.go.kr/html/site/style/style_02.html), [typography](https://www.krds.go.kr/html/site/style/style_03.html), [tokens](https://www.krds.go.kr/html/site/style/style_07.html). Living primary guidance, accessed 2026-09-17; not authority for community-kit licences.
52. [shadcn theming](https://ui.shadcn.com/docs/theming), living semantic CSS-variable/OKLCH documentation, accessed 2026-09-17.
53. tweakcn [repository](https://github.com/jnsahaj/tweakcn), [Apache-2.0 licence](https://raw.githubusercontent.com/jnsahaj/tweakcn/main/LICENSE). Accessed 2026-09-17; editor capability does not certify contrast.
54. Radix Colors [scale roles](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale), [palette composition](https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette). Living guidance, accessed 2026-09-17; its APCA-related claims are not substituted for WCAG ratio validation.
55. [Wikimedia Commons — Reusing content outside Wikimedia](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia), living primary reuse guidance, accessed 2026-09-17; individual file permissions and different project media policies.
