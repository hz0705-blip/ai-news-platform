// 사용: pnpm --filter @newsplatform/pipeline eval:export   (DATABASE_MIGRATION_URL·EVAL_DATA_DIR, #147)
// 프로덕션 DB를 읽기 전용 트랜잭션으로 읽어 골든셋 개발셋 20 패킷을 고정 시드로 표집한다. 기사 본문·제목·설명은
// EVAL_DATA_DIR/packets/에만 쓰고, 저장소에는 본문 없는 목록 eval/dev-set.json만 쓴다(기사 텍스트 검사 뒤).
// 개발셋 기사 쌍 60개(사건 안 30 + 같은 토픽의 어려운 부정 30, 기사 임베딩 코사인 순)도 함께 고른다.
// 패킷 파일이 이미 있으면 덮어쓰지 않는다 — 초안이 그 본문의 좌표를 가리키므로, 같은 사건을 다시 고른 경우에만
// 기존 패킷으로 쌍 목록과 dev-set.json을 다시 만들고, 다르면 멈춘다.
import { TOPICS, type Topic } from "@newsplatform/domain";
import postgres from "postgres";
import {
  assertNoArticleText,
  type CandidateArticle,
  DEV_SET_SEED,
  type StoryCandidate,
  sampleDevSet,
  toDevSet,
} from "../src/eval/packet.ts";
import { selectDevPairs } from "../src/eval/pairs.ts";
import { createEvalStore, evalDataDir, REPO_EVAL_DIR, writeJson } from "../src/eval/store.ts";

const url = process.env.DATABASE_MIGRATION_URL;
if (url === undefined || url === "") {
  console.error("DATABASE_MIGRATION_URL이(가) 설정되지 않았다. .env.example을 참고해 설정한다.");
  process.exit(1);
}
const store = createEvalStore(evalDataDir(process.env));

interface Row {
  story_id: string;
  topic: string;
  article_id: string;
  article_version_id: string;
  source_id: string;
  url: string;
  normalized_url: string;
  published_at: Date;
  title: string;
  description: string | null;
  body: string;
}

const sql = postgres(url, { max: 1, onnotice: () => undefined, connect_timeout: 10 });
let rows: Row[] = [];
const embeddings = new Map<string, readonly number[]>();
try {
  await sql.begin("read only", async (tx) => {
    // 데모가 아닌 사건의 링크만 기사가 아닌 기사마다 본문이 남은 가장 최근 기사 버전 하나.
    rows = await tx<Row[]>`
      select s.id as story_id, s.topics[1] as topic, a.id as article_id, v.id as article_version_id,
             a.source_id, a.url, a.normalized_url, a.published_at, a.title, a.description, v.body
      from stories s
      join articles a on a.story_id = s.id and not a.is_link_only
      join lateral (
        select id, body from article_versions
        where article_id = a.id and body is not null
        order by captured_at desc, id desc limit 1
      ) v on true
      where not s.is_demo
      order by s.id, a.id`;
    // 임베딩은 개발셋 후보가 될 수 있는 기사 전부에서 읽는다(표집 전이라 어느 기사인지 모른다).
    const vectors = await tx<{ id: string; embedding: string }[]>`
      select a.id, a.embedding::text as embedding
      from articles a join stories s on s.id = a.story_id
      where not s.is_demo and not a.is_link_only and a.embedding is not null`;
    for (const v of vectors) embeddings.set(v.id, JSON.parse(v.embedding) as number[]);
  });
} finally {
  await sql.end();
}

const byStory = new Map<string, { topic: Topic; articles: CandidateArticle[] }>();
for (const row of rows) {
  if (!(TOPICS as readonly string[]).includes(row.topic)) continue;
  const entry = byStory.get(row.story_id) ?? { topic: row.topic as Topic, articles: [] };
  entry.articles.push({
    articleId: row.article_id,
    articleVersionId: row.article_version_id,
    sourceId: row.source_id,
    url: row.url,
    normalizedUrl: row.normalized_url,
    publishedAt: row.published_at.toISOString(),
    title: row.title,
    description: row.description,
    body: row.body,
  });
  byStory.set(row.story_id, entry);
}
const candidates: StoryCandidate[] = [...byStory].map(([storyId, entry]) => ({
  storyId,
  ...entry,
}));

const sampled = sampleDevSet(candidates, DEV_SET_SEED);
const existing = store.readPackets();
if (
  existing.length > 0 &&
  JSON.stringify(existing.map((p) => [p.packetId, p.storyId])) !==
    JSON.stringify(sampled.map((p) => [p.packetId, p.storyId]))
) {
  console.error(
    "EVAL_DATA_DIR의 기존 패킷과 이번 표집이 다르다. 초안을 버릴 때만 packets/를 지우고 다시 실행한다.",
  );
  process.exit(1);
}
const packets = existing.length > 0 ? existing : sampled;
const devSet = toDevSet(packets, DEV_SET_SEED, selectDevPairs(packets, embeddings, DEV_SET_SEED));
const output = `${JSON.stringify(devSet, null, 2)}\n`;
assertNoArticleText(output, packets);

if (existing.length === 0) for (const packet of packets) store.writePacket(packet);
writeJson(`${REPO_EVAL_DIR}/dev-set.json`, devSet);
console.log(
  JSON.stringify({
    candidates: candidates.length,
    packets: packets.length,
    articles: packets.reduce((n, p) => n + p.articles.length, 0),
    keptExistingPackets: existing.length > 0,
    composition: devSet.composition,
    pairs: {
      method: devSet.pairs.method,
      사건안: devSet.pairs.pairs.filter((p) => p.set === "사건 안").length,
      어려운부정: devSet.pairs.pairs.filter((p) => p.set === "어려운 부정").length,
    },
  }),
);
