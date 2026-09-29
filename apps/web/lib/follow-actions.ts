"use server";

import { followTopic, unfollowStory, unfollowTopic } from "@newsplatform/db";
import { TOPICS } from "@newsplatform/domain/topic";
import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUserId } from "./auth/server.ts";
import { getRuntimeDb } from "./db.ts";

/**
 * 팔로우 화면의 폼 Server Action(#105, 스펙 "계정"). 요청마다 현재 사용자 헬퍼로 인증을 직접 검증하고 그 사용자 ID만
 * 소유자로 쓴다 — 클라이언트 입력의 사용자 값은 받지 않는다. 끝나면 그 화면만 다시 그리고(`refresh`) 공유 캐시 태그는
 * 건드리지 않는다. 사건 페이지의 방문·팔로우는 브라우저 번들이 서버 모듈을 끌어오지 않도록 Route Handler다(app/api/me).
 */
const slug = z.string().min(1).max(200);

const topicForm = z.object({ topic: z.enum(TOPICS), follow: z.enum(["1", "0"]) });

/** 팔로우 화면의 토픽 토글(폼). 끝나면 그 화면만 다시 그린다. */
export async function submitTopicFollow(formData: FormData): Promise<void> {
  const { topic, follow } = topicForm.parse({
    topic: formData.get("topic"),
    follow: formData.get("follow"),
  });
  const userId = await getCurrentUserId();
  if (userId === null) return;
  const db = getRuntimeDb().db;
  if (follow === "1") await followTopic(db, { userId, topic });
  else await unfollowTopic(db, { userId, topic });
  refresh();
}

const unfollowForm = z.object({ slug });

/** 팔로우 화면 카드의 팔로우 해제(폼). */
export async function submitStoryUnfollow(formData: FormData): Promise<void> {
  const { slug } = unfollowForm.parse({ slug: formData.get("slug") });
  const userId = await getCurrentUserId();
  if (userId === null) return;
  await unfollowStory(getRuntimeDb().db, { userId, slug });
  refresh();
}
