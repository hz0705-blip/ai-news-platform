#!/bin/sh
# SessionStart: Herdr 안이면 오른쪽에 pane을 하나 열어 scripts/agent-monitor로 서브에이전트 작업을 보여준다.
# 서브에이전트(agent_id 있음)나 Herdr 밖이면 아무것도 하지 않는다. 이미 살아 있는 모니터 pane이 있으면 재사용.
set -eu
input="$(cat 2>/dev/null || true)"
[ "${HERDR_ENV:-}" = "1" ] || exit 0
[ -n "${HERDR_PANE_ID:-}" ] || exit 0
command -v herdr >/dev/null 2>&1 || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

eval "$(printf '%s' "$input" | python3 -c '
import json,sys,shlex
try: h=json.load(sys.stdin)
except Exception: h={}
print("agent_id=%s" % shlex.quote(str(h.get("agent_id") or "")))
print("session_id=%s" % shlex.quote(str(h.get("session_id") or "")))
print("cwd=%s" % shlex.quote(str(h.get("cwd") or "")))
')"
[ -z "$agent_id" ] || exit 0
[ -n "$session_id" ] || exit 0
root="${CLAUDE_PROJECT_DIR:-$cwd}"
[ -x "$root/scripts/agent-monitor" ] || exit 0

slug="$(printf '%s' "$root" | tr '/' '-')"
tasks_dir="/private/tmp/claude-$(id -u)/$slug/$session_id/tasks"
state="$root/.scratch/.agent-monitor-pane"
mkdir -p "$root/.scratch"

if [ -f "$state" ]; then
  old="$(cat "$state")"
  if herdr pane get "$old" >/dev/null 2>&1; then
    herdr pane send-keys "$old" ctrl+c >/dev/null 2>&1 || true
    herdr pane run "$old" "clear; $root/scripts/agent-monitor '$tasks_dir'" >/dev/null 2>&1 && exit 0
  fi
fi

pane="$(herdr pane split --pane "$HERDR_PANE_ID" --direction right --ratio 0.34 --cwd "$root" --no-focus 2>/dev/null \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])' 2>/dev/null || true)"
[ -n "$pane" ] || exit 0
printf '%s\n' "$pane" > "$state"
herdr pane rename "$pane" "agents" >/dev/null 2>&1 || true
herdr pane run "$pane" "clear; $root/scripts/agent-monitor '$tasks_dir'" >/dev/null 2>&1 || true
exit 0
