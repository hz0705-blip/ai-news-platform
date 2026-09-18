# #14 M0 pnpm 모노레포 골격과 Biome·Vitest 실행 기반 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 빈 저장소를 `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`가 모두 통과하는 pnpm 워크스페이스로 만들고, 패키지 다섯의 껍데기와 실제 단언이 있는 테스트를 세운다.

**Architecture:** 루트에 pnpm 워크스페이스·Biome·Vitest·tsconfig 기반 파일을 두고, `apps/web`·`apps/worker`·`packages/domain`·`packages/db`·`packages/pipeline` 다섯 패키지가 루트 설정을 상속한다. 도구 devDependencies는 루트에만 있고 도메인 패키지는 런타임 의존성이 없다. 웹·워커 상호 import는 Biome 규칙으로 막고, 도메인 무의존성과 테스트 환경 계약은 테스트로 지킨다.

**Tech Stack:** pnpm 12.4.2(`devEngines.runtime`으로 Node 24.21.0 관리), TypeScript 7.0.2, Biome 2.5.14, Vitest 5.0.1, jsdom 30.1.0, @types/node 24.13.5.

**Spec:** `docs/spec/v1.md` "시스템 구조", "컨벤션", "테스트 결정", "마일스톤과 인수 조건 초안" M0 + GitHub 이슈 #14(`gh issue view 14`). 용어는 `CONTEXT.md`.

## Global Constraints

- 패키지 다섯: 웹 앱, 워커 앱, 도메인(순수 TS, 외부 의존성 0), DB, 파이프라인. 임시 스코프 `@newsplatform/*`. 웹과 워커는 도메인·DB·파이프라인을 import하고 서로는 import하지 않는다.
- Node 24 LTS(`engines`와 버전 파일). TypeScript strict 전부, `any` 금지. Biome으로 린트+포맷(접근성 규칙 포함). Turborepo 없음. pnpm만 쓴다.
- Vitest 하나로 다섯 패키지를 돌리고 패키지별 환경을 정한다(웹만 jsdom, 나머지 node). 테스트는 각 패키지에 병치(`src/*.test.ts`).
- 루트 스크립트: `dev`, `test`, `lint`, `format`, `typecheck`.
- 도메인 패키지 manifest에 런타임 의존성이 없다(`dependencies`·`peerDependencies`·`optionalDependencies` 키 자체를 두지 않는다).
- `pnpm test` 출력에 실제 테스트 1개 이상이 실행·통과로 보인다(빈 실행은 통과가 아니다).
- `.gitignore`가 `.superpowers/`, `.scratch/`, `.claude/worktrees/`, 로컬 환경 파일을 유지한다.
- 고정 버전(2026-09-19 `npm view` 조회, `^` 없이 정확 버전): pnpm `12.4.2`, Node `24.21.0`, `typescript` `7.0.2`, `@biomejs/biome` `2.5.14`, `vitest` `5.0.1`, `jsdom` `30.1.0`, `@types/node` `24.13.5`.
- 도메인 export 문자열은 `CONTEXT.md` 그대로. 토픽 4개 순서 = 상한 도달 처리 우선순위: `한국 관련 해외 보도` → `국제 정치·외교·안보` → `세계 경제·금융` → `기술·AI`. 상충 상태 5종: `단일 출처`, `복수 출처 일치`, `보도 상충`, `상충 해소`, `정정됨`. 가운데 점은 U+00B7 `·`.
- 커밋: Conventional Commits. 타입 영어, 제목 한국어, 스코프 패키지명(루트 전반은 `repo`). 커밋 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- 용어는 `CONTEXT.md`를 따르고 피할 말(카테고리, 섹션, 주제, 뉴스, 신뢰도, 점수 등)을 코드 주석·테스트 이름에 쓰지 않는다.
- Out of scope: Next.js 앱 내용, DB 연결, CI, 배포, UI 토큰. 계획에 없는 파일·의존성을 추가하지 않는다.
- 상대 import는 `.ts` 확장자를 쓴다(`allowImportingTsExtensions: true`, `noEmit`). 모든 패키지는 `"type": "module"`.
- 실행 환경 주의: 이 기기의 시스템 Node는 26이다. 루트 `package.json`의 `devEngines.runtime`이 Node 24.21.0을 pnpm이 내려받게 하므로, 모든 명령은 `pnpm <script>` 또는 `pnpm exec <bin>`으로 실행한다(맨 `node`·`npx` 금지). `pnpm install` 출력에 `+ node 24.21.0`이 보이는 것은 정상이다.

---

## File Structure

| 경로 | 책임 |
|---|---|
| `package.json` | 워크스페이스 루트. 스크립트 5개, `packageManager`, `engines`, `devEngines.runtime`, 도구 devDependencies 전부 |
| `pnpm-workspace.yaml` | 패키지 글롭 `apps/*`, `packages/*` |
| `.node-version` | `24.21.0` (버전 관리자·Railway·CI용 버전 파일) |
| `tsconfig.base.json` | 모든 패키지가 상속하는 strict 컴파일러 옵션 |
| `biome.json` | 린트·포맷·import 정리. Task 3에서 웹·워커 상호 import 금지 overrides 추가 |
| `vitest.config.ts` | 단일 Vitest 설정. `test.projects` 다섯 항목 인라인 |
| `.gitignore` | 기존 항목 유지 + `node_modules/`, 환경 파일, `*.tsbuildinfo`, `coverage/` |
| `apps/web/{package.json,tsconfig.json,src/index.ts}` | 웹 앱 껍데기. DOM lib. Task 3에서 `src/environment.test.ts` |
| `apps/worker/{package.json,tsconfig.json,src/index.ts}` | 워커 앱 껍데기. Task 3에서 `src/environment.test.ts` |
| `packages/domain/{package.json,tsconfig.json,src/index.ts}` | 도메인. Task 2에서 `src/topic.ts`, `src/contradiction-status.ts`와 테스트, Task 3에서 `src/manifest.test.ts` |
| `packages/db/{package.json,tsconfig.json,src/index.ts}` | DB 껍데기 |
| `packages/pipeline/{package.json,tsconfig.json,src/index.ts}` | 파이프라인 껍데기 |

---

### Task 1: 워크스페이스 기반 (manifest·pnpm·tsconfig·Biome·Vitest·패키지 껍데기)

이 태스크만 예외적으로 실패 테스트 없이 기반을 세운다(`docs/agents/project.md` "첫 사이클(M0)"). 검증은 명령 통과 여부다.

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.node-version`
- Create: `tsconfig.base.json`
- Create: `biome.json`
- Create: `vitest.config.ts`
- Modify: `.gitignore`
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/src/index.ts`
- Create: `apps/worker/package.json`, `apps/worker/tsconfig.json`, `apps/worker/src/index.ts`
- Create: `packages/domain/package.json`, `packages/domain/tsconfig.json`, `packages/domain/src/index.ts`
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/src/index.ts`
- Create: `packages/pipeline/package.json`, `packages/pipeline/tsconfig.json`, `packages/pipeline/src/index.ts`
- Create (생성됨): `pnpm-lock.yaml`

**Interfaces:**
- Consumes: 없음(빈 저장소).
- Produces: 루트 스크립트 `pnpm lint | typecheck | test | format | dev`. 패키지 이름 `@newsplatform/web`, `@newsplatform/worker`, `@newsplatform/domain`, `@newsplatform/db`, `@newsplatform/pipeline`. Vitest 프로젝트 이름 `web`(jsdom), `worker`, `domain`, `db`, `pipeline`(node). 각 패키지 `src/index.ts`는 `export {};`.

- [ ] **Step 1: 사전 확인 — pnpm 버전**

Run: `pnpm --version`
Expected: `12.4.2`. 다르면 멈추고 BLOCKED로 보고한다(`packageManager` 값이 어긋난다).

- [ ] **Step 2: 루트 `package.json` 작성**

```json
{
  "name": "newsplatform",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.4.2",
  "engines": {
    "node": "24.x"
  },
  "devEngines": {
    "runtime": {
      "name": "node",
      "version": "24.21.0",
      "onFail": "download"
    }
  },
  "scripts": {
    "dev": "pnpm -r --parallel --filter \"./apps/*\" run dev",
    "test": "vitest run",
    "lint": "biome check .",
    "format": "biome check --write .",
    "typecheck": "pnpm -r run typecheck"
  },
  "devDependencies": {
    "@biomejs/biome": "2.5.14",
    "@types/node": "24.13.5",
    "jsdom": "30.1.0",
    "typescript": "7.0.2",
    "vitest": "5.0.1"
  }
}
```

- [ ] **Step 3: `pnpm-workspace.yaml`과 `.node-version` 작성**

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`.node-version`(개행 하나로 끝냄):
```
24.21.0
```

- [ ] **Step 4: `tsconfig.base.json` 작성**

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

- [ ] **Step 5: `biome.json` 작성**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.14/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "includes": ["**", "!**/pnpm-lock.yaml"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "assist": {
    "actions": {
      "source": {
        "organizeImports": "on"
      }
    }
  }
}
```

- [ ] **Step 6: `vitest.config.ts` 작성**

```ts
import { defineConfig } from "vitest/config";

// 패키지 다섯을 Vitest 하나로 돌린다. 웹만 jsdom, 나머지는 node (docs/spec/v1.md "테스트 결정").
export default defineConfig({
  test: {
    projects: [
      { test: { name: "web", root: "./apps/web", environment: "jsdom" } },
      { test: { name: "worker", root: "./apps/worker", environment: "node" } },
      { test: { name: "domain", root: "./packages/domain", environment: "node" } },
      { test: { name: "db", root: "./packages/db", environment: "node" } },
      { test: { name: "pipeline", root: "./packages/pipeline", environment: "node" } },
    ],
  },
});
```

- [ ] **Step 7: `.gitignore` 갱신**

기존 내용을 유지하고 아래를 덧붙인다. 최종 파일:
```
.DS_Store
.scratch/
.worktrees/
.claude/worktrees/
.superpowers/
.claude/settings.local.json

# 의존성·빌드 산출물
node_modules/
*.tsbuildinfo
coverage/

# 로컬 환경 파일
.env
.env.*
!.env.example
```

- [ ] **Step 8: 패키지 다섯 껍데기 작성**

`apps/web/package.json`:
```json
{
  "name": "@newsplatform/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "echo \"@newsplatform/web dev는 #16에서 정의한다\"",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@newsplatform/db": "workspace:*",
    "@newsplatform/domain": "workspace:*",
    "@newsplatform/pipeline": "workspace:*"
  }
}
```

`apps/web/tsconfig.json`(웹만 DOM lib 추가):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2024", "DOM", "DOM.Iterable"]
  },
  "include": ["src"]
}
```

`apps/worker/package.json`:
```json
{
  "name": "@newsplatform/worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "echo \"@newsplatform/worker dev는 #17에서 정의한다\"",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@newsplatform/db": "workspace:*",
    "@newsplatform/domain": "workspace:*",
    "@newsplatform/pipeline": "workspace:*"
  }
}
```

`packages/domain/package.json`(`dependencies` 계열 키를 두지 않는다):
```json
{
  "name": "@newsplatform/domain",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

`packages/db/package.json`:
```json
{
  "name": "@newsplatform/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@newsplatform/domain": "workspace:*"
  }
}
```

`packages/pipeline/package.json`:
```json
{
  "name": "@newsplatform/pipeline",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@newsplatform/domain": "workspace:*"
  }
}
```

`apps/worker/tsconfig.json`, `packages/domain/tsconfig.json`, `packages/db/tsconfig.json`, `packages/pipeline/tsconfig.json`(네 파일 모두 동일):
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

다섯 패키지의 `src/index.ts`(모두 동일, 개행 하나로 끝냄):
```ts
export {};
```

- [ ] **Step 9: 설치와 lockfile 생성**

Run: `pnpm install`
Expected: 오류 없이 끝남. 출력에 `+ node 24.21.0`과 devDependencies 다섯이 보임. `pnpm-lock.yaml` 생성됨.

Run: `pnpm exec node --version`
Expected: `v24.21.0`

- [ ] **Step 10: 린트·타입 검사 통과 확인**

Run: `pnpm lint`
Expected: `Checked N files in …. No fixes applied.` 오류 0. 포맷 지적이 나오면 `pnpm format`을 한 번 돌리고 다시 `pnpm lint`.

Run: `pnpm typecheck`
Expected: 다섯 패키지 모두 `tsc --noEmit`이 오류 없이 끝남.

- [ ] **Step 11: 테스트 명령의 현재 상태 기록**

Run: `pnpm test`
Expected: 이 시점에는 테스트 파일이 없어 "No test files found" 계열로 종료 코드가 0이 아닐 수 있다. 이것은 Task 2가 채우는 예상 상태다. 출력 첫 줄들을 보고서에 그대로 남긴다. 이 단계에서 `passWithNoTests`를 추가하지 않는다.

- [ ] **Step 12: 커밋**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml .node-version tsconfig.base.json biome.json vitest.config.ts .gitignore apps packages
git commit -m "chore(repo): pnpm 워크스페이스·패키지 다섯 껍데기·Biome·Vitest 기반

- pnpm 12.4.2, devEngines.runtime으로 Node 24.21.0 고정
- TypeScript 7.0.2 strict 전부, Biome 2.5.14, Vitest 5.0.1(웹 jsdom, 나머지 node)
- @newsplatform/{web,worker,domain,db,pipeline} 껍데기와 workspace 의존 관계

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: 도메인 상수 — 토픽 우선순위 순서와 상충 상태 라벨 (TDD)

**Files:**
- Test: `packages/domain/src/topic.test.ts`
- Test: `packages/domain/src/contradiction-status.test.ts`
- Create: `packages/domain/src/topic.ts`
- Create: `packages/domain/src/contradiction-status.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: Task 1의 Vitest 프로젝트 `domain`(root `packages/domain`, node 환경), `.ts` 확장자 상대 import.
- Produces: `@newsplatform/domain`에서 `TOPICS: readonly ["한국 관련 해외 보도", "국제 정치·외교·안보", "세계 경제·금융", "기술·AI"]`, `type Topic`, `CONTRADICTION_STATUSES: readonly ["단일 출처", "복수 출처 일치", "보도 상충", "상충 해소", "정정됨"]`, `type ContradictionStatus`.

- [ ] **Step 1: 실패 테스트 작성 — 토픽**

`packages/domain/src/topic.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { TOPICS } from "./topic.ts";

describe("TOPICS", () => {
  it("상한 도달 처리 우선순위 순서로 토픽 4개를 CONTEXT.md 문자열 그대로 담는다", () => {
    expect(TOPICS).toEqual(["한국 관련 해외 보도", "국제 정치·외교·안보", "세계 경제·금융", "기술·AI"]);
  });

  it("중복 없이 정확히 4개다", () => {
    expect(new Set(TOPICS).size).toBe(4);
  });
});
```

- [ ] **Step 2: 실패 테스트 작성 — 상충 상태**

`packages/domain/src/contradiction-status.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { CONTRADICTION_STATUSES } from "./contradiction-status.ts";

describe("CONTRADICTION_STATUSES", () => {
  it("상충 상태 5종을 CONTEXT.md 순서와 문자열 그대로 담는다", () => {
    expect(CONTRADICTION_STATUSES).toEqual([
      "단일 출처",
      "복수 출처 일치",
      "보도 상충",
      "상충 해소",
      "정정됨",
    ]);
  });

  it("중복 없이 정확히 5개다", () => {
    expect(new Set(CONTRADICTION_STATUSES).size).toBe(5);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm test`
Expected: FAIL. `domain` 프로젝트에서 `./topic.ts`, `./contradiction-status.ts`를 찾지 못해 두 테스트 파일이 실패한다. 실패 출력 요약을 보고서에 남긴다.

- [ ] **Step 4: 구현 — 토픽**

`packages/domain/src/topic.ts`:
```ts
/**
 * 서비스가 다루는 토픽 넷 (CONTEXT.md "토픽").
 * 배열 순서는 배치가 비용 상한에 도달했을 때 사건을 처리하는 우선순위다
 * (docs/spec/v1.md "배치와 비용": 기사 수 동률이면 이 순서).
 */
export const TOPICS = [
  "한국 관련 해외 보도",
  "국제 정치·외교·안보",
  "세계 경제·금융",
  "기술·AI",
] as const;

export type Topic = (typeof TOPICS)[number];
```

- [ ] **Step 5: 구현 — 상충 상태**

`packages/domain/src/contradiction-status.ts`:
```ts
/**
 * 상충 상태 5종 (CONTEXT.md "상충 상태").
 * 한 주장에 대해 보도 원점들이 어떻게 갈리는지 나타내며, 사건의 상충 상태는
 * 현재 주장들의 상태와 열린 상충 에피소드에서 파생된다(ADR-0009).
 */
export const CONTRADICTION_STATUSES = [
  "단일 출처",
  "복수 출처 일치",
  "보도 상충",
  "상충 해소",
  "정정됨",
] as const;

export type ContradictionStatus = (typeof CONTRADICTION_STATUSES)[number];
```

- [ ] **Step 6: `index.ts`에서 re-export**

`packages/domain/src/index.ts`(기존 `export {};`를 대체):
```ts
export { CONTRADICTION_STATUSES, type ContradictionStatus } from "./contradiction-status.ts";
export { TOPICS, type Topic } from "./topic.ts";
```

- [ ] **Step 7: 통과 확인**

Run: `pnpm test`
Expected: PASS. 출력에 `domain` 프로젝트의 테스트 파일 2개, 테스트 4개 통과가 보인다(`Test Files 2 passed`, `Tests 4 passed`). 다른 프로젝트에 테스트 파일이 없어 전체가 실패하면 그 사실만 보고서에 남기고 멈춘다(컨트롤러가 Ruling한다). 통과 출력의 요약 줄을 보고서에 남긴다.

Run: `pnpm lint && pnpm typecheck`
Expected: 둘 다 오류 0.

- [ ] **Step 8: 커밋**

```bash
git add packages/domain/src
git commit -m "feat(domain): 토픽 우선순위 순서와 상충 상태 라벨 상수

TOPICS 4개(상한 도달 처리 순서)와 CONTRADICTION_STATUSES 5종을 CONTEXT.md 문자열 그대로 export하고
순서·문자열·개수를 테스트로 고정한다.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 경계 보호 — 웹·워커 상호 import 금지, 도메인 무의존성, 테스트 환경 계약

**Files:**
- Test: `packages/domain/src/manifest.test.ts`
- Test: `apps/web/src/environment.test.ts`
- Test: `apps/worker/src/environment.test.ts`
- Modify: `biome.json`(overrides 추가)
- 임시(커밋 금지): `apps/web/src/violation.ts`, `apps/worker/src/violation.ts`

**Interfaces:**
- Consumes: Task 1의 `biome.json`, Vitest 프로젝트 `web`(jsdom)·`worker`(node)·`domain`, 루트 `devEngines.runtime` Node 24.
- Produces: `pnpm lint`가 `apps/web/**`에서 `@newsplatform/worker` import를, `apps/worker/**`에서 `@newsplatform/web` import를 오류로 막는다. 테스트 3파일이 도메인 무의존성·웹 jsdom·워커 node/Node 24 계약을 고정한다.

- [ ] **Step 1: 실패 테스트 작성 — 도메인 manifest 무의존성**

`packages/domain/src/manifest.test.ts`:
```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const MANIFEST_URL = new URL("../package.json", import.meta.url);

async function readManifest(): Promise<Record<string, unknown>> {
  const text = await readFile(MANIFEST_URL, "utf8");
  return JSON.parse(text) as Record<string, unknown>;
}

describe("@newsplatform/domain manifest", () => {
  it("런타임 의존성 키가 하나도 없다(순수 TS, 외부 의존성 0)", async () => {
    const manifest = await readManifest();
    expect(manifest).not.toHaveProperty("dependencies");
    expect(manifest).not.toHaveProperty("peerDependencies");
    expect(manifest).not.toHaveProperty("optionalDependencies");
  });

  it("이름이 @newsplatform/domain 이다", async () => {
    const manifest = await readManifest();
    expect(manifest.name).toBe("@newsplatform/domain");
  });
});
```

- [ ] **Step 2: 빨강 확인 — 임시로 의존성을 넣어 실패시킨다**

`packages/domain/package.json`에 임시로 `"dependencies": { "zod": "0.0.0" }`을 추가한다(설치하지 않는다).

Run: `pnpm test --project domain`
Expected: `manifest.test.ts`의 첫 테스트가 FAIL(`dependencies` 존재). 출력 요약을 보고서에 남긴다.

임시 `dependencies`를 제거해 `packages/domain/package.json`을 Task 1 상태로 되돌린다(`git diff packages/domain/package.json`이 비어야 한다).

Run: `pnpm test --project domain`
Expected: PASS(테스트 파일 3개, 테스트 6개).

- [ ] **Step 3: 실패 테스트 작성 — 웹은 jsdom, 워커는 node·Node 24**

`apps/web/src/environment.test.ts`:
```ts
import { describe, expect, it } from "vitest";

describe("web 테스트 환경", () => {
  it("jsdom 환경이라 document가 있다", () => {
    expect(typeof document).toBe("object");
    expect(document.documentElement.tagName).toBe("HTML");
  });
});
```

`apps/worker/src/environment.test.ts`:
```ts
import { describe, expect, it } from "vitest";

describe("worker 테스트 환경", () => {
  it("node 환경이라 document가 없다", () => {
    expect("document" in globalThis).toBe(false);
  });

  it("Node 24 LTS에서 돈다(devEngines.runtime)", () => {
    expect(process.versions.node.split(".")[0]).toBe("24");
  });
});
```

- [ ] **Step 4: 실패 확인 후 통과 확인**

이 두 테스트는 Task 1의 설정이 맞으면 바로 통과한다. 빨강을 보려면 `vitest.config.ts`의 `web` 항목 `environment`를 임시로 `"node"`로 바꾸고:

Run: `pnpm test --project web`
Expected: FAIL(`document is not defined`). 출력 요약을 보고서에 남긴다.

`environment: "jsdom"`으로 되돌린다(`git diff vitest.config.ts`가 비어야 한다).

Run: `pnpm test`
Expected: PASS. `web` 1개, `worker` 2개, `domain` 6개 테스트 통과. `db`·`pipeline`에 테스트 파일이 없어 전체가 실패한다면 그 두 프로젝트에만 `passWithNoTests: true`를 추가하고 그 사실을 보고서에 남긴다(다른 프로젝트에는 넣지 않는다).

- [ ] **Step 5: Biome overrides — 웹·워커 상호 import 금지**

`biome.json`의 최상위에 `overrides`를 추가한다(다른 항목은 Task 1 그대로):
```json
  "overrides": [
    {
      "includes": ["apps/web/**"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "paths": {
                  "@newsplatform/worker": "웹은 워커를 import하지 않는다 (docs/spec/v1.md 시스템 구조)"
                },
                "patterns": [{ "group": ["@newsplatform/worker/*", "**/apps/worker/**", "../worker/**"] }]
              }
            }
          }
        }
      }
    },
    {
      "includes": ["apps/worker/**"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "paths": {
                  "@newsplatform/web": "워커는 웹을 import하지 않는다 (docs/spec/v1.md 시스템 구조)"
                },
                "patterns": [{ "group": ["@newsplatform/web/*", "**/apps/web/**", "../web/**"] }]
              }
            }
          }
        }
      }
    }
  ]
```

- [ ] **Step 6: 빨강 확인 — 임시 위반 파일**

`apps/web/src/violation.ts`:
```ts
import "@newsplatform/worker";
```
`apps/worker/src/violation.ts`:
```ts
import "@newsplatform/web";
```

Run: `pnpm lint`
Expected: FAIL. 두 파일에서 `lint/style/noRestrictedImports` 오류가 각각 1개씩 보인다. 출력의 오류 줄을 보고서에 남긴다.

두 임시 파일을 삭제한다(`git status`에 남지 않아야 한다).

Run: `pnpm lint`
Expected: 오류 0.

- [ ] **Step 7: 허용 방향은 막히지 않는지 확인**

임시로 `apps/web/src/allowed.ts`에 `import { TOPICS } from "@newsplatform/domain"; export const first = TOPICS[0];`를 만들고:

Run: `pnpm lint && pnpm typecheck`
Expected: 둘 다 오류 0(도메인 import는 허용). 그 뒤 파일을 삭제한다.

- [ ] **Step 8: 전체 통과 확인**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: 모두 통과. `pnpm test` 요약 줄(`Test Files … passed`, `Tests 9 passed`)을 보고서에 남긴다.

- [ ] **Step 9: 커밋**

```bash
git add biome.json packages/domain/src/manifest.test.ts apps/web/src/environment.test.ts apps/worker/src/environment.test.ts
git commit -m "chore(repo): 웹·워커 상호 import 금지 규칙과 경계 계약 테스트

- Biome noRestrictedImports overrides: apps/web는 @newsplatform/worker, apps/worker는 @newsplatform/web 금지
- 도메인 manifest 무의존성, 웹 jsdom·워커 node/Node 24 환경을 테스트로 고정

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

`vitest.config.ts`에 `passWithNoTests`를 넣었다면 그 파일도 같은 커밋에 포함한다.

---

## 인수 조건 대응표 (#14)

| 인수 조건 | 증거 |
|---|---|
| `pnpm install` 뒤 `pnpm lint`, `pnpm typecheck`, `pnpm test` 통과, lockfile 커밋 | Task 1 Step 9~10, Task 3 Step 8, `pnpm-lock.yaml` 커밋 |
| `pnpm test`에 실제 테스트 1개 이상 실행·통과 | Task 2(4개), Task 3(5개) |
| 도메인 manifest에 런타임 의존성 없음 | Task 1 domain `package.json` + Task 3 `manifest.test.ts` |
| 웹·워커 상호 import 차단 장치 | Task 3 Biome overrides(빨강·초록 확인) |
| `.gitignore` 유지 항목 | Task 1 Step 7 |
