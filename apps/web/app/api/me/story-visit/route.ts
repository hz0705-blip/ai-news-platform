import { recordStoryVisit } from "@newstrail/db";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { personalPost } from "../../../../lib/auth/personal-route.ts";
import { getRuntimeDb } from "../../../../lib/db.ts";
import type { StoryVisitRequest } from "../../../../lib/story-personal-api.ts";

const input: z.ZodType<StoryVisitRequest> = z.object({
  slug: z.string().min(1).max(200),
  revisionId: z.string().min(1).max(300),
  follow: z.boolean(),
});

/**
 * 사건 페이지 방문(#105): 보이는 개정판으로 마지막으로 본 개정판을 올리고(뒤로는 가지 않는다) 이전 값과 팔로우 상태를 돌려준다.
 * `follow`면 같은 트랜잭션에서 팔로우를 마친다. 익명이면 기록하지 않는다. 공유 캐시는 건드리지 않는다.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return personalPost(request, input, async (userId, { slug, revisionId, follow }) => {
    const visit = await recordStoryVisit(getRuntimeDb().db, { userId, slug, revisionId, follow });
    return {
      following: visit?.following ?? false,
      lastSeenRevisionId: visit?.previousRevisionId ?? null,
    };
  });
}
