/**
 * Return the weaker probability from Jev's explicitness and relevance checks.
 * @param candidate Jev probabilities for one source candidate.
 * @returns Probability that the candidate both states and supports the WHY.
 */
export function combinedWhyCandidateProbability(candidate) {
    return Math.min(candidate.probability, candidate.relevanceProbability ?? candidate.probability);
}
