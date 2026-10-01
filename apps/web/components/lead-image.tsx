/** @jsxImportSource react */
"use client";

import type { LeadImage as LeadImageData } from "@newstrail/db";
import { useState } from "react";

/** 발행사 주소를 그대로 표시한다. 데모·이미지 부재·로드 실패에는 슬롯도 남기지 않는다. */
export function LeadImage({
  image,
  isDemo,
  priority = false,
}: {
  image: LeadImageData | null;
  isDemo: boolean;
  priority?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (isDemo || image === null || image.url === failedUrl) return null;

  return (
    <figure className="lead-image">
      {/* biome-ignore lint/performance/noImgElement: ADR-0002에 따라 발행사 주소를 직접 핫링크하며 최적화·중계하지 않는다. */}
      <img
        src={image.url}
        alt=""
        width={900}
        height={600}
        loading={priority ? "eager" : "lazy"}
        // 하이드레이션 전에 끝난 실패는 error 이벤트가 다시 오지 않으므로 붙는 순간 확인한다.
        ref={(node) => {
          if (node?.complete && node.naturalWidth === 0) setFailedUrl(image.url);
        }}
        onError={() => setFailedUrl(image.url)}
      />
      <figcaption>
        <a href={image.articleUrl} target="_blank" rel="noopener noreferrer" className="underline">
          사진 · {image.sourceName}
        </a>
      </figcaption>
    </figure>
  );
}
