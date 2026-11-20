---
name: test-skill
description: Practice skill that shows every way a skill can receive dynamic parameters (raw text, positional, named, quoted, key=value, flags, paths, URLs, numbers, lists, JSON, defaults, missing values). Run it only when the user types /test-skill; it changes nothing.
argument-hint: "<title> <count> <mode> [--dry] [key=value ...] [path-or-url ...]"
arguments: [title, count, mode]
disable-model-invocation: true
allowed-tools: Bash(date:*), Bash(git branch:*)
---

# test-skill: parameter playground

This skill only REPORTS what it received. Do not create, edit or delete any file. Do not run commands other than the two shown in "Live context" below.

## What the user typed

- Raw (everything after the skill name): `$ARGUMENTS`
- Positional: first = `$ARGUMENTS[0]`, second = `$ARGUMENTS[1]`, third = `$ARGUMENTS[2]`
- Named (from the `arguments:` list in the frontmatter): title = `$title`, count = `$count`, mode = `$mode`

If a placeholder above was left as literal text (for example you still see a dollar sign followed by a name), say so: this Claude Code version does not substitute that kind.

## Live context (runs before you read this)

- Today: !`date +%F`
- Git branch: !`git branch --show-current`
- Skill folder: ${CLAUDE_SKILL_DIR}
- Session id: ${CLAUDE_SESSION_ID}

## Your job

1. Take the raw text and parse it like this:
   - `title`: the first token. A quoted phrase such as `"red box"` is ONE token.
   - `count`: the second token. Must be an integer from 1 to 99. Default: 3.
   - `mode`: the third token. Must be one of `fast`, `safe`, `debug`. Default: `safe`.
   - Flags: `--dry` (boolean, default false), `--verbose` (boolean, default false).
   - `key=value` tokens (for example `width=120 height=80 color=#ff0000`): collect them into a map.
   - Everything else: a list of "items". Classify each item as `file path` (starts with `/`, `./`, `~` or `@`), `URL` (starts with `http://` or `https://`), `JSON` (starts with `{` or `[`, check it parses), `number`, `comma list` (contains commas), or `word`.
2. If `title` is missing, ask the user for it (one short question) and wait. All other missing values use the defaults above, without asking.
3. If a value is invalid (`count` not a number, `mode` not in the list), say which one and why, use the default, and carry on.
4. Print one table: Parameter | Value received | Type | Source (positional / named / flag / key=value / default / asked).
5. Under the table, print two lines: "Valid: yes/no" and the exact slash command that would reproduce this run.
6. Finish with a one-line tip about a parameter style the user did NOT use this time.
