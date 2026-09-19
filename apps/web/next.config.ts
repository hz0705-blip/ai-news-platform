import type { NextConfig } from "next";

// 렌더링·캐시 모델은 Cache Components 하나만 쓴다(docs/spec/v1.md "배포와 운영" 렌더링·캐시).
// 구형 라우트 단위 revalidate/dynamic 옵션은 도입하지 않는다. #17은 캐시를 쓰지 않는다.
const nextConfig: NextConfig = {
  cacheComponents: true,
};

export default nextConfig;
