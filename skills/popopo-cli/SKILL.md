---
name: popopo-cli
description: Use the popopo.js command-line client as an end user. Use when Codex needs to install the `popopo` command, map a user request to concrete `popopo ...` commands, run Popopo account or live-space operations, troubleshoot auth/session issues, or discover supported flags and command groups without discussing library development.
---

# Popopo CLI

Use this skill as a CLI user, not as a library maintainer.

## Quick Start

1. Ensure the command is available.
2. Verify the install with a harmless read command.
3. Run the smallest command that proves auth and target selection are correct before attempting a write flow.

Prefer this install path when the command is not available:

```bash
bun i -g popopo.js
popopo --help
```

## Workflow

1. Translate the user request into one concrete `popopo ...` command.
2. Check required identifiers and auth state before running write operations.
3. Prefer `--json` when the output will be parsed, compared, or quoted back to the user.
4. Start with read-only commands such as `me`, `lookup`, `user get`, `spaces get`, `lives get`, `list`, or `current` when exploring unknown state.
5. Read [references/commands.md](./references/commands.md) only when you need the command catalog or a reminder of available flags.

## Session And Output Rules

- Expect the default session file at `.popopo-session.json` unless `--session-file` overrides it.
- Assume auth-bearing commands persist updated session state automatically unless `--no-persist` is passed.
- Expect object results to print as formatted JSON even without `--json`.
- Use `--json` anyway when output stability matters, because some stream and watch flows have custom human-readable output.
- Pass `--strings <path>` only when the default resource path is missing or the caller explicitly wants another resource set.

## Command Selection

- Use auth commands for sign-in, sign-up, credential linking, phone verification, and token lookup.
- Use `user` commands for profile registration and profile field updates.
- Use `spaces` commands for room lookup, connection info, chat messages, and watch loops.
- Use `lives` commands for live discovery, entering, comments, selections, powers, and audio publish/receive flows.
- Use `skins`, `coins`, `invites`, `notifications`, `push`, `calls`, and `tso` only when the request clearly targets those domains.

## Guardrails

- Verify required flags from `popopo --help` or [references/commands.md](./references/commands.md) before running a command you have not used yet.
- Avoid write commands until you know which account and target resource the current session points at.
- Prefer explicit `--session-file`, `--space-key`, `--live-id`, `--user-id`, and similar identifiers in automation or repeated debugging sessions.
- For long-running watch or audio commands, set timeouts or byte limits when possible so the command terminates predictably.
