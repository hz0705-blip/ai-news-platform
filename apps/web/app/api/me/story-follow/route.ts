import { followStory, unfollowStory } from "@newstrail/db";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { personalPost } from "../../../../lib/auth/personal-route.ts";
import { getRuntimeDb } from "../../../../lib/db.ts";
import type { StoryFollowRequest } from "../../../../lib/story-personal-api.ts";

const input: z.ZodType<StoryFollowRequest> = z.object({
  slug: z.string().min(1).max(200),
  following: z.boolean(),
});

/** 사건 팔로우를 켜거나 끈다(#105). 소유자는 검증된 현재 사용자다. 공유 캐시는 건드리지 않는다. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return personalPost(request, input, async (userId, { slug, following }) => {
    const db = getRuntimeDb().db;
    if (!following) {
      await unfollowStory(db, { userId, slug });
      return { following: false };
    }
    return { following: await followStory(db, { userId, slug }) };
  });
}
