# Choosing an output destination

A developer’s workflow doesn’t always end with creating a pull request. Sometimes they want to update a changelog locally, preview the generated content, or use the release notes in another tool.

[Changelog-Bot](https://github.com/necoz-oss/changelog-bot) provides three output destinations through the `--output` option: **pull-request**, **file**, and **stdout**.

Let’s see how a developer named Aditya might use them.

## 1. Update the changelog file directly

Aditya has been working on his project. He has added new features, fixed some bugs, and improved existing functionality.

Now he wants to update the project’s `CHANGELOG.md` with the changes from his latest development work.

He runs:

```
pnpm dlx @nyaomaru/changelog-bot \
  --release-tag HEAD \
  --release-name 1.2.0 \
  --changelog-path CHANGELOG.md \
  --output file
```

The file destination updates the specified changelog file directly on disk.

Aditya doesn’t need a new Git branch or a pull request. He can continue working with the updated file in his local project.

## 2. Preview the changelog before updating it

Before making changes to the file, Aditya wants to check what the updated changelog would look like.

He doesn’t want to modify `CHANGELOG.md` yet. He only wants to preview the proposed result and check the provider diagnostics.

He runs the same generation command with `--dry-run`:

```
pnpm dlx @nyaomaru/changelog-bot \
  --release-tag HEAD \
  --release-name 1.2.0 \
  --changelog-path CHANGELOG.md \
  --dry-run
```

The `dry-run` prints the full updated changelog and provider diagnostics to the terminal without writing anything to disk or creating a pull request.

Once Aditya is satisfied with the preview, he can run the command with `--output file` to update the actual file.

**Note:** `--dry-run` is a **preview mode**, not another output destination. It cannot be combined with `--output file` or `--output stdout`. The same restriction applies to `--dry-run-json-report`.

## 3. Use release notes in another tool

Aditya has another requirement. He wants to publish the generated release notes through a separate announcement tool.

He doesn’t need the entire updated `CHANGELOG.md`. He only needs the newly generated release section.

For this, he uses the `stdout` destination:

```
pnpm dlx @nyaomaru/changelog-bot \
  --release-tag HEAD \
  --release-name 1.2.0 \
  --output stdout
```

With **stdout**, changelog-bot prints only the generated release section as Markdown to standard output. Informational logs and status messages are sent to standard error.

Aditya can also redirect the output into a separate file:

```
pnpm dlx @nyaomaru/changelog-bot \
  --release-tag HEAD \
  --release-name 1.2.0 \
  --output stdout > release-notes.md
```

Now *release-notes.md* contains the generated release section, ready to be used by another tool or shared separately.

## 4. Let changelog-bot create a pull request

Finally, suppose Aditya wants the changelog update to be reviewed before it becomes part of the project’s main branch.

He doesn’t need to specify an output destination because pull-request is the default:

```
pnpm dlx @nyaomaru/changelog-bot \
  --release-tag HEAD \
  --release-name 1.2.0
```
Changelog-bot creates a branch, updates the changelog, and opens a pull request.

This requires GitHub authentication with permission to push a branch and create a pull request.


## Repository identity and authentication

When running the CLI directly outside GitHub Actions, repository identity may need to be supplied through `REPO_FULL_NAME` in `owner/repo` format if it cannot be inferred automatically.

Pull-request creation requires GitHub authentication with the necessary write permissions. File and stdout destinations do not require GitHub write authentication. However, private repositories and authenticated GitHub API lookups may still require credentials.

## Quick comparison

| Destination | What it does |
| :--- | :--- |
| `pull-request` | Creates a branch, updates the changelog, and opens a pull request. |
| `file` | Updates the local changelog file directly. |
| `stdout` | Prints only the generated release section to standard output. |
| `--dry-run` | Previews the full updated changelog and diagnostics without writing to disk or creating a pull request. |


