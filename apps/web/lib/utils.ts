import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tokens.css `@theme`의 글자 크기 토큰(`text-meta` 등)을 글자 크기 그룹으로 등록한다.
// 등록하지 않으면 tailwind-merge가 이를 글자색으로 보고 뒤따르는 `text-<색>`과 충돌시켜 지운다.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: { "font-size": [{ text: ["meta", "body", "card-title", "section", "title"] }] },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
