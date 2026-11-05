<!-- markdownlint-disable -->

# Hardening Report: nyaomaru--changelog-bot/v0.11.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **nyaomaru--changelog-bot/v0.11.0** was hardened automatically. 1 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

The composite action step `uses: actions/setup-node@v7` points to a mutable version tag, not a full 40-character commit SHA.

Locations:

- `action.yml:14`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses

**Notes:**

Pinned actions/setup-node@v7 to 949feb2413d6458794dcd2491c4babbbce0c15c1 (# v7) in action.yml. No other changes were needed; inputs already go through env vars and a bash array.

