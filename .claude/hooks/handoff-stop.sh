#!/bin/sh
# 세션 인계: 작업 단위 완료 마커(.scratch/.task-done)가 있으면 wrap-up 스킬 실행을 지시한다.
# 등록: .claude/settings.json Stop 훅. 설계: CLAUDE.md "세션 인계" 절.
set -eu

input="$(cat 2>/dev/null || true)"
[ -n "${CLAUDE_PROJECT_DIR:-}" ] || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

marker="${CLAUDE_PROJECT_DIR}/.scratch/.task-done"
[ -f "$marker" ] || exit 0

HOOK_INPUT="$input" python3 - <<'PY'
import json, os, sys
try:
    data = json.loads(os.environ.get("HOOK_INPUT") or "{}")
except json.JSONDecodeError:
    data = {}
if data.get("stop_hook_active") or data.get("agent_id"):
    sys.exit(0)
reason = (
    "작업 단위가 완료되었다. Skill 도구로 wrap-up 스킬을 실행해 .scratch/handoff.md를 작성하고 "
    ".scratch/.task-done을 삭제한 뒤, 사용자에게 세션을 종료해도 된다고 알려라."
)
print(json.dumps({"decision": "block", "reason": reason}, ensure_ascii=False))
PY
