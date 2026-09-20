#!/bin/sh
# PreToolUse(Agent|Bash): 컨트롤러가 서브에이전트(Agent) 또는 백그라운드 Bash를 띄울 때 Herdr 오른쪽 pane에
# scripts/agent-monitor를 연다. 모니터는 idle 90초 뒤 스스로 종료하고 pane도 닫는다(비율 메인 50 : 모니터 50).
# 서브에이전트 안(agent_id 있음), Herdr 밖, 포그라운드 Bash면 아무것도 하지 않는다. 살아 있는 모니터 pane은 재사용.
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
ti=h.get("tool_input") or {}
print("agent_id=%s" % shlex.quote(str(h.get("agent_id") or "")))
print("session_id=%s" % shlex.quote(str(h.get("session_id") or "")))
print("cwd=%s" % shlex.quote(str(h.get("cwd") or "")))
print("tool_name=%s" % shlex.quote(str(h.get("tool_name") or "")))
print("bg=%s" % ("1" if ti.get("run_in_background") else "0"))
')"
[ -z "$agent_id" ] || exit 0
[ -n "$session_id" ] || exit 0
case "$tool_name" in
  Agent) ;;
  Bash) [ "$bg" = "1" ] || exit 0 ;;
  *) exit 0 ;;
esac
root="${CLAUDE_PROJECT_DIR:-$cwd}"
[ -x "$root/scripts/agent-monitor" ] || exit 0

slug="$(printf '%s' "$root" | tr '/' '-')"
tasks_dir="/private/tmp/claude-$(id -u)/$slug/$session_id/tasks"
state="$root/.scratch/.agent-monitor-pane"
mkdir -p "$root/.scratch"

# 이미 모니터가 돌고 있으면 그대로 둔다(같은 세션이면 같은 tasks_dir).
if [ -f "$state" ]; then
  old="$(cat "$state")"
  if herdr pane get "$old" >/dev/null 2>&1; then
    if herdr pane read "$old" 2>/dev/null | grep -q "$session_id"; then exit 0; fi
    herdr pane close "$old" >/dev/null 2>&1 || true
  fi
  rm -f "$state"
fi

pane="$(herdr pane split --pane "$HERDR_PANE_ID" --direction right --ratio 0.5 --cwd "$root" --no-focus 2>/dev/null \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])' 2>/dev/null || true)"
[ -n "$pane" ] || exit 0
printf '%s\n' "$pane" > "$state"
herdr pane rename "$pane" "agents" >/dev/null 2>&1 || true
herdr pane run "$pane" "clear; $root/scripts/agent-monitor '$tasks_dir' --idle-exit 90; rm -f '$state'; herdr pane close '$pane'" >/dev/null 2>&1 || true
exit 0
