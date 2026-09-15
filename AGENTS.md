# AGENTS.md — Codex (executor)

Codex's role in this repo: **research, implement, test**. Claude Code plans, reviews and supervises via `CLAUDE.md`. Do not take on those roles.

## Role

- Work only from GitHub issues labelled `ready-for-agent`. On `needs-triage` / `needs-info` tickets: comment what is missing and stop.
- Implement exactly what the ticket specifies. Scope questions go back to the ticket as a comment, not into code.
- Test-first when the ticket has acceptance criteria. Run the full test suite before opening a PR.
- One PR per ticket, body starts with `Closes #N`. Summarise what was done, how it was tested, what was left out.
- Do not merge. Do not edit `CLAUDE.md`, `docs/agents/`, `docs/adr/` or `CONTEXT.md`; propose changes in the PR description.

## Project

Shared facts (stack, commands, conventions): `docs/agents/project.md`. Read it when starting a ticket.

## Agent skills

### Issue tracker

GitHub Issues via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default roles, label strings equal to role names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
