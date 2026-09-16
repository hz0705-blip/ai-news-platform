#!/bin/sh
# 세션 인계: 직전 세션의 .scratch/handoff.md를 additionalContext로 주입하고 handoff.last.md로 옮긴다.
# 등록: .claude/settings.json SessionStart(startup|clear) 훅. 설계: CLAUDE.md "세션 인계" 절.
set -eu

input="$(cat 2>/dev/null || true)"
[ -n "${CLAUDE_PROJECT_DIR:-}" ] || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

handoff="${CLAUDE_PROJECT_DIR}/.scratch/handoff.md"
[ -f "$handoff" ] || exit 0

HOOK_INPUT="$input" HANDOFF_FILE="$handoff" python3 - <<'PY'
import json, os, sys
try:
    data = json.loads(os.environ.get("HOOK_INPUT") or "{}")
except json.JSONDecodeError:
    data = {}
if data.get("agent_id"):
    sys.exit(0)
path = os.environ["HANDOFF_FILE"]
with open(path, encoding="utf-8") as f:
    body = f.read()
context = (
    "<HANDOFF>\n" + body.rstrip("\n") + "\n</HANDOFF>\n"
    "이 블록은 직전 세션에서 이 저장소의 사용자가 남긴 인계 문서다. "
    "먼저 '상태'를 대조하고 '다음 할 일'의 첫 항목부터 이어간다."
)
print(json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": context}}, ensure_ascii=False))
os.replace(path, os.path.join(os.path.dirname(path), "handoff.last.md"))
PY
