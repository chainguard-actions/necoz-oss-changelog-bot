/**
 * Deliver generated changelog to the configured destination.
 * WHY: Decoupling delivery from generation ensures ReleaseResult is validated
 * and rendered purely before any filesystem or git side effects occur.
 * @param payload Generated changelog artifacts and delivery metadata.
 * @param deps External write and logging adapters.
 * @returns Result of delivery operation.
 */
export async function deliverChangelog(payload, deps) {
    const { destination, outcome, version, changelogPath, updatedChangelog, releaseSectionMarkdown, token, deliveryMetadata, } = payload;
    if (outcome?.kind === 'no-changes') {
        if (destination === 'pull-request') {
            deps.log(`No changes found for release v${version}; skipping PR creation.`);
            return {
                destination: 'pull-request',
                skipped: true,
                reason: 'no-changes',
            };
        }
        if (destination === 'file') {
            deps.log(`No changes found for release v${version}; skipping file update.`);
            return {
                destination: 'file',
                changelogPath,
                skipped: true,
                reason: 'no-changes',
            };
        }
        deps.log(`No changes found for release v${version}; nothing to output.`);
        return {
            destination: 'stdout',
            skipped: true,
            reason: 'no-changes',
        };
    }
    switch (destination) {
        case 'pull-request': {
            deps.ensureGithubTokenRequired(false, token);
            deps.writeChangelog(changelogPath, updatedChangelog);
            const prNumber = await deps.createPR({
                owner: deliveryMetadata.owner,
                repo: deliveryMetadata.repo,
                baseBranch: deliveryMetadata.baseBranch,
                branchName: deliveryMetadata.branchName,
                title: deliveryMetadata.title,
                body: deliveryMetadata.body,
                labels: [...deliveryMetadata.labels],
                token: token,
                changelogEntry: changelogPath,
            });
            deps.log(`Created PR #${prNumber}`);
            return { destination: 'pull-request', prNumber, skipped: false };
        }
        case 'file': {
            deps.writeChangelog(changelogPath, updatedChangelog);
            deps.log(`Updated ${changelogPath} for release v${version}`);
            return { destination: 'file', changelogPath, skipped: false };
        }
        case 'stdout': {
            deps.writeStdout(releaseSectionMarkdown);
            return { destination: 'stdout', skipped: false };
        }
    }
}
