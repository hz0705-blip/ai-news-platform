/** @jsxImportSource react */
import { ImageResponse } from "next/og";

// 홈 화면 아이콘(파일 규칙 `apple-icon`). `icon.svg`와 같은 "N" 워드마크를 글꼴 없이 path로 그린다.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon(): ImageResponse {
  return new ImageResponse(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={180}
      height={180}
      role="img"
      aria-label="Newstrail"
    >
      <rect width="32" height="32" fill="#581c87" />
      <path d="M9 24V8h3.2l7.6 10.4V8H23v16h-3.2l-7.6-10.4V24z" fill="#fff" />
    </svg>,
    size,
  );
}
