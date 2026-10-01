import { loadFollowFeed } from "@newstrail/db";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { personalPost } from "../../../../lib/auth/personal-route.ts";
import { getRuntimeDb } from "../../../../lib/db.ts";
import { countFollowChanges } from "../../../../lib/follow-feed.ts";

const input = z.object({});

/**
 * 오늘 머리의 팔로우 변화 안내(#208): 팔로우 화면과 같은 질의(`loadFollowFeed`)로 읽은 이후 변화가 있는 라이브 사건 수만
 * 돌려준다. 아무것도 쓰지 않고 공유 캐시도 건드리지 않는다.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return personalPost(request, input, async (userId) => ({
    changed: countFollowChanges(await loadFollowFeed(getRuntimeDb().db, { userId })),
  }));
}
