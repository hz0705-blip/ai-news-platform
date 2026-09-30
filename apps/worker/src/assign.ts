import {
  assignArticleToStory,
  createStoryForArticle,
  findCandidateStories,
  loadAssignmentArticles,
  type RuntimeDb,
  touchStory,
} from "@newstrail/db";
import { type AssignmentResult, type EmbeddingClient, runAssignment } from "@newstrail/pipeline";

/**
 * 사건 배정 함수 하나(#53): 배정할 기사 읽기 → 임베딩 → 사건 배정(파이프라인) → 저장(DB).
 * `articleIds`를 주면 그 기사들(수집이 돌려준 새 버전의 기사), 없으면 사건이 없는 기사 전부.
 * 도메인·DB·파이프라인을 잇는 자리는 워커뿐이다. 배치 스케줄과의 결합은 #55.
 */
export async function assignStories(
  input: { readonly now: Date; readonly articleIds?: readonly string[] },
  deps: { readonly db: RuntimeDb["db"]; readonly embeddingClient: EmbeddingClient },
): Promise<AssignmentResult> {
  const { db } = deps;
  const articles = await loadAssignmentArticles(
    db,
    input.articleIds === undefined ? {} : { articleIds: input.articleIds },
  );
  return runAssignment(
    { articles, now: input.now },
    {
      embeddingClient: deps.embeddingClient,
      store: {
        findCandidates: (embedding, options) => findCandidateStories(db, embedding, options),
        assignToStory: (item) => assignArticleToStory(db, item),
        createStory: (item) => createStoryForArticle(db, item),
        keepOnStory: (item) => touchStory(db, item),
      },
    },
  );
}
