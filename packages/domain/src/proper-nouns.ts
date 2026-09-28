/**
 * 제목에서 고유명사 후보를 뽑는다(docs/spec/v1.md "개발 중 결정 항목" GDELT 수집: "사건 대표 기사 제목의 고유명사 2~4개").
 * 순수 규칙(#77 Ruling): 대문자로 시작하는 토큰이 고유명사 후보이고, 문장 첫머리 대문자를 걸러내는 불용어
 * 목록(관사·전치사·접속사·대명사·보도 동사)을 뺀다. 이어지는 후보는 `of`를 사이에 두고까지 최대 세 단어의
 * 구(`Strait of Hormuz`)로 묶는다. 소유격·앞뒤 문장부호는 뗀다. 같은 구는 한 번만, 제목 순서대로 돌려준다.
 * 제목이 전부 대문자로 시작하는 표제 형식이면 일반 명사도 섞이지만, 배정 임계값이 무관한 결과를 거른다(스펙 같은 줄).
 */
const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "nor",
  "so",
  "yet",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "onto",
  "over",
  "to",
  "up",
  "with",
  "without",
  "after",
  "before",
  "amid",
  "amidst",
  "despite",
  "during",
  "until",
  "while",
  "against",
  "about",
  "under",
  "why",
  "how",
  "what",
  "when",
  "where",
  "who",
  "which",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "he",
  "she",
  "they",
  "we",
  "you",
  "his",
  "her",
  "their",
  "our",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "has",
  "have",
  "had",
  "will",
  "would",
  "can",
  "could",
  "may",
  "might",
  "should",
  "must",
  "not",
  "no",
  "new",
  "says",
  "say",
  "said",
  "live",
  "update",
  "updates",
  "breaking",
  "exclusive",
  "analysis",
  "opinion",
  "explainer",
  "watch",
  "video",
]);

const MAX_PHRASE_WORDS = 3;

/**
 * 앞의 여는 문장부호, 뒤의 닫는 문장부호·소유격을 뗀다. `U.S.`처럼 안에 점이 있는 약어의 끝 점은 남긴다.
 * 뒤에 무엇인가 뗐으면(`Korea's`, `Seoul,`) 구의 경계다.
 */
function cleanToken(raw: string): { token: string; boundary: boolean } {
  const stripped = raw.replace(/^[^\p{L}\p{N}]+/u, "");
  let token = stripped.replace(/[^\p{L}\p{N}.]+$/u, "").replace(/['’]s$/u, "");
  token = token.replace(/[^\p{L}\p{N}.]+$/u, "");
  if (token.endsWith(".") && !token.slice(0, -1).includes(".")) token = token.slice(0, -1);
  return { token, boundary: token.length < stripped.length && !stripped.endsWith(".") };
}

function isCandidate(token: string): boolean {
  if (token.length < 2 || !/^\p{Lu}/u.test(token)) return false;
  if (/^\p{N}+$/u.test(token)) return false;
  return !STOPWORDS.has(token.toLowerCase());
}

export function properNounsOf(title: string): string[] {
  const tokens = title.normalize("NFC").split(/\s+/).map(cleanToken);
  const phrases: string[] = [];
  let current: string[] = [];
  const close = () => {
    if (current.length > 0) phrases.push(current.join(" "));
    current = [];
  };
  for (let i = 0; i < tokens.length; i++) {
    const { token, boundary } = tokens[i] ?? { token: "", boundary: true };
    if (isCandidate(token)) {
      if (current.length >= MAX_PHRASE_WORDS) close();
      current.push(token);
      if (boundary) close();
      continue;
    }
    const next = tokens[i + 1]?.token ?? "";
    if (
      token.toLowerCase() === "of" &&
      !boundary &&
      current.length > 0 &&
      current.length + 2 <= MAX_PHRASE_WORDS &&
      isCandidate(next)
    ) {
      current.push(token);
      continue;
    }
    close();
  }
  close();
  const seen = new Set<string>();
  return phrases.filter((phrase) => {
    const key = phrase.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
