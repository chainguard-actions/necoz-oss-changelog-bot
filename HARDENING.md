<!-- markdownlint-disable -->

# Hardening Report: necoz-oss--changelog-bot/v0.12.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **necoz-oss--changelog-bot/v0.12.0** was hardened automatically. 1 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

action.yml references an action by a mutable tag instead of a full 40-character commit SHA: `uses: actions/setup-node@v7`. Pin it to a commit SHA, with the tag in a trailing comment.

Locations:

- `action.yml:103`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses

**Notes:**

In action.yml I pinned actions/setup-node from the v7 tag to commit 949feb2413d6458794dcd2491c4babbbce0c15c1, which lookup_action_sha returned for v7. The tag is kept as a trailing '# v7' comment. A search for other 'uses:' lines in the action's .yml files found only this one. Nothing was run to test the change.

