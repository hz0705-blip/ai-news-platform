import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { OWNERSHIP_TYPES, RIGHTS_TIERS, type Source } from "@newstrail/domain";
import { z } from "zod";

/**
 * 출처 표 파일(#76, docs/spec/v1.md "개발 중 결정 항목" 출처 표). 정본은 저장소의 `packages/db/sources/sources.json`이며
 * 운영자가 검토해 고친다. `sources:sync`가 DB `sources`로 upsert하고, `sources:wikidata`는 차이만 출력한다.
 * 행: 출처 식별자(`id`, 대표 도메인), 도메인 목록, 표시 이름, 국가(`region`, ISO 3166-1 alpha-2 소문자 또는 "미확인"),
 * 소유 형태, 통신사 여부, 언어(ISO 639-1), 제외 여부, 권리 등급, 근거 URL·확인일, Wikidata 항목.
 * 근거 URL·확인일·Wikidata 항목은 검토 기록이라 파일에만 두고 DB에는 넣지 않는다.
 */
export const SOURCES_FILE_PATH = fileURLToPath(new URL("../sources/sources.json", import.meta.url));

const DOMAIN = /^(?!www\.)[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export const SourceRegistryRowSchema = z.object({
  id: z.string().min(1),
  domains: z.array(z.string().regex(DOMAIN, "소문자 호스트, www. 없음")).min(1),
  name: z.string().min(1),
  region: z.union([z.string().regex(/^[a-z]{2}$/), z.literal("미확인")]),
  ownership: z.enum(OWNERSHIP_TYPES),
  isWire: z.boolean(),
  language: z.union([z.string().regex(/^[a-z]{2}$/), z.literal("미확인")]),
  isExcluded: z.boolean(),
  rightsTier: z.enum(RIGHTS_TIERS),
  basisUrl: z.string().url().nullable(),
  checkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  wikidataId: z
    .string()
    .regex(/^Q\d+$/)
    .nullable(),
});

export type SourceRegistryRow = z.infer<typeof SourceRegistryRowSchema>;

/** 파일 전체. 식별자와 도메인은 행 사이에서도 겹치면 안 된다(매칭이 모호해진다). */
export const SourceRegistryFileSchema = z
  .array(SourceRegistryRowSchema)
  .superRefine((rows, ctx) => {
    const ids = new Set<string>();
    const domains = new Set<string>();
    rows.forEach((row, index) => {
      if (ids.has(row.id)) {
        ctx.addIssue({ code: "custom", path: [index, "id"], message: `중복 식별자 ${row.id}` });
      }
      ids.add(row.id);
      for (const domain of row.domains) {
        if (domains.has(domain)) {
          ctx.addIssue({
            code: "custom",
            path: [index, "domains"],
            message: `중복 도메인 ${domain}`,
          });
        }
        domains.add(domain);
      }
    });
  });

export function parseSourceRegistry(json: unknown): SourceRegistryRow[] {
  return SourceRegistryFileSchema.parse(json);
}

export function readSourceRegistryFile(path: string = SOURCES_FILE_PATH): SourceRegistryRow[] {
  return parseSourceRegistry(JSON.parse(readFileSync(path, "utf8")));
}

/** 출처 표 행 → 도메인 출처. 등록 출처는 가상이 아니고 제공자 식별자가 없다. */
export function toSource(row: SourceRegistryRow): Source {
  return {
    id: row.id,
    name: row.name,
    rightsTier: row.rightsTier,
    region: row.region,
    ownership: row.ownership,
    language: row.language,
    isFictional: false,
    domains: row.domains,
    isWire: row.isWire,
    isExcluded: row.isExcluded,
  };
}
