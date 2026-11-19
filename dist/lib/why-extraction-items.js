import { GITHUB_METADATA_CONCURRENCY } from '../constants/github.js';
import { WHY_MAX_TOTAL_PAYLOAD_CHARS } from '../constants/why.js';
import { fetchIssueDetails as defaultFetchIssueDetails } from './github-issues.js';
import { githubWebHost } from './why-extraction-notes.js';
import { mapConcurrent } from '../utils/concurrency.js';
import { formatIssueMetadataFallbackReason, formatMetadataFallbackReason, } from '../utils/github-error.js';
import { createMetadataDiagnostics, recordMetadataLookupOutcome, } from '../utils/metadata-diagnostics.js';
import { extractLinkedIssueNumbers } from '../utils/why-issue-reference.js';
import { preprocessWhyPrBody } from '../utils/why-preprocess.js';
/**
 * Fetch and preprocess PR descriptions selected from changelog bullets.
 * @param params GitHub lookup dependencies, candidate limits, and optional concurrency setting.
 * @param targets Authoritative PR targets selected from the changelog.
 * @returns Trusted provider inputs and collection diagnostics.
 */
export async function collectWhyExtractionItems(params, targets) {
    const metadataDiagnostics = createMetadataDiagnostics();
    const result = {
        items: [],
        prBodiesFetched: 0,
        skippedLowTrust: 0,
        fallbackReasons: [],
        metadataDiagnostics,
    };
    // WHY: Deduplicate target PR numbers before fetching so we make at most one
    // network request per unique PR, bounded by GITHUB_METADATA_CONCURRENCY.
    const uniquePrNumbers = Array.from(new Set(targets.map((target) => target.prNumber)));
    const lookups = await mapConcurrent(uniquePrNumbers, params.concurrency ?? GITHUB_METADATA_CONCURRENCY, async (prNumber) => {
        const lookup = await params.fetchPRDetails(params.owner, params.repo, prNumber, params.token, params.githubApiBase);
        return [prNumber, lookup];
    });
    const lookupByPrNumber = new Map(lookups);
    for (const [prNumber, lookup] of lookups) {
        const fallbackReason = lookup.status !== 'success'
            ? formatMetadataFallbackReason(prNumber, lookup)
            : undefined;
        recordMetadataLookupOutcome(metadataDiagnostics, lookup, fallbackReason);
        if (lookup.status === 'success') {
            result.prBodiesFetched += 1;
        }
    }
    // Scan successfully fetched PR bodies for linked issue references
    const linkedIssueFetcher = params.fetchIssueDetails ?? defaultFetchIssueDetails;
    const repositoryContext = {
        owner: params.owner,
        repo: params.repo,
        host: githubWebHost(params.githubApiBase),
    };
    const linkedIssueNumbersByPr = new Map();
    const allUniqueLinkedIssueNumbers = new Set();
    for (const [prNumber, lookup] of lookups) {
        if (lookup.status !== 'success')
            continue;
        const issueNumbers = extractLinkedIssueNumbers(lookup.data.body, repositoryContext);
        if (issueNumbers.length > 0) {
            linkedIssueNumbersByPr.set(prNumber, issueNumbers);
            for (const issueNumber of issueNumbers) {
                allUniqueLinkedIssueNumbers.add(issueNumber);
            }
        }
    }
    // Fetch linked issues concurrently, bounded by GITHUB_METADATA_CONCURRENCY
    const issueLookupByNumber = new Map();
    if (allUniqueLinkedIssueNumbers.size > 0) {
        const issueLookups = await mapConcurrent(Array.from(allUniqueLinkedIssueNumbers), params.concurrency ?? GITHUB_METADATA_CONCURRENCY, async (issueNumber) => {
            const issueLookup = await linkedIssueFetcher(params.owner, params.repo, issueNumber, params.token, params.githubApiBase);
            return [issueNumber, issueLookup];
        });
        for (const [issueNumber, issueLookup] of issueLookups) {
            issueLookupByNumber.set(issueNumber, issueLookup);
            const fallbackReason = issueLookup.status !== 'success'
                ? formatIssueMetadataFallbackReason(issueNumber, issueLookup)
                : undefined;
            recordMetadataLookupOutcome(metadataDiagnostics, issueLookup, fallbackReason);
        }
    }
    for (const target of targets) {
        const lookup = lookupByPrNumber.get(target.prNumber);
        if (!lookup || lookup.status !== 'success') {
            const fallbackReason = lookup
                ? formatMetadataFallbackReason(target.prNumber, lookup)
                : `Skipped PR #${target.prNumber}: PR details unavailable`;
            result.fallbackReasons.push(fallbackReason);
            continue;
        }
        const linkedIssueNumbers = linkedIssueNumbersByPr.get(target.prNumber) ?? [];
        const targetLinkedIssues = [];
        for (const issueNumber of linkedIssueNumbers) {
            const issueLookup = issueLookupByNumber.get(issueNumber);
            if (issueLookup && issueLookup.status === 'success') {
                targetLinkedIssues.push(issueLookup.data);
            }
        }
        const preprocessed = preprocessWhyPrBody(target, lookup.data, { maxCharsPerPr: params.maxCharsPerPr }, targetLinkedIssues);
        if (preprocessed.item) {
            result.items.push(preprocessed.item);
            continue;
        }
        if (preprocessed.lowTrust)
            result.skippedLowTrust += 1;
        if (preprocessed.skippedReason) {
            result.fallbackReasons.push(preprocessed.skippedReason);
        }
    }
    return result;
}
/**
 * Bound provider inputs by the configured total payload limit.
 * @param items Trusted per-PR WHY candidates.
 * @returns Leading items that fit within the total character budget.
 */
export function truncateWhyPayloadItems(items) {
    const boundedItems = [];
    let usedChars = 0;
    for (const item of items) {
        const itemChars = item.candidates.join('\n').length;
        if (usedChars + itemChars > WHY_MAX_TOTAL_PAYLOAD_CHARS)
            break;
        boundedItems.push(item);
        usedChars += itemChars;
    }
    return boundedItems;
}
