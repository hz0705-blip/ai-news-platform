import { readStoryVisit, recordStoryVisit } from "@newstrail/db";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { personalPost } from "../../../../lib/auth/personal-route.ts";
import { getRuntimeDb } from "../../../../lib/db.ts";
import type { StoryVisitRequest } from "../../../../lib/story-personal-api.ts";

const input: z.ZodType<StoryVisitRequest> = z.object({
  phase: z.enum(["read", "record"]),
  slug: z.string().min(1).max(200),
  revisionId: z.string().min(1).max(300),
  follow: z.boolean(),
});

/**
 * 비교 기준 조회와 방문 기록을 나눈다. 조회 응답을 받기 전에 읽은 지점이 앞당겨지지 않는다.
 * 기록은 보이는 개정판만 올리고(뒤로는 가지 않는다) 이전 값과 팔로우 상태를 돌려준다.
 * `follow`면 같은 트랜잭션에서 팔로우를 마친다. 익명이면 기록하지 않는다. 공유 캐시는 건드리지 않는다.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return personalPost(request, input, async (userId, { phase, slug, revisionId, follow }) => {
    const params = { userId, slug, revisionId, follow };
    const visit =
      phase === "read"
        ? await readStoryVisit(getRuntimeDb().db, params)
        : await recordStoryVisit(getRuntimeDb().db, params);
    return {
      following: visit?.following ?? false,
      lastSeenRevisionId: visit?.previousRevisionId ?? null,
    };
  });
}
