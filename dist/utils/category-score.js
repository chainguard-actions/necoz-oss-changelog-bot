import { SECTION_ORDER } from '../constants/changelog.js';
import { BEST_CATEGORY_MIN_SCORE, BEST_CATEGORY_REQUIRED_MARGIN, } from '../constants/category-scoring.js';
import { applyComboHeuristics, applyDependencyBumpHeuristic, applyNegativeSignalAttenuation, clampCategoryScores, collectPrefixScoreDeltas, } from './category-score-heuristics.js';
import { collectKeywordScoreDeltas, createNormalizedPhrases, } from './category-score-keywords.js';
import { isNullable } from './is.js';
import { normalizeTitle } from './title-normalize.js';
/**
 * Initialize an empty score object with zero for every section.
 * @returns Fresh category scores with all sections set to zero.
 */
function createEmptyScores() {
    const categoryScores = {};
    for (const section of SECTION_ORDER)
        categoryScores[section] = 0;
    return categoryScores;
}
/**
 * Add score deltas to a mutable score object.
 * @param scores Score object to mutate.
 * @param deltas Per-section deltas to apply.
 */
function addScoreDeltas(scores, deltas) {
    for (const [sectionName, weight] of Object.entries(deltas)) {
        scores[sectionName] += weight;
    }
}
/**
 * Compute heuristic scores per category from a raw title.
 * @param rawTitle Original PR title or commit subject.
 * @returns Scores for each CHANGELOG section.
 */
export function scoreCategories(rawTitle) {
    const scores = createEmptyScores();
    if (!rawTitle)
        return scores;
    const lowercasedTitle = rawTitle.toLowerCase();
    const normalizedTitle = normalizeTitle(lowercasedTitle);
    const normalizedPhrases = createNormalizedPhrases(normalizedTitle);
    addScoreDeltas(scores, collectPrefixScoreDeltas(rawTitle, lowercasedTitle));
    addScoreDeltas(scores, collectKeywordScoreDeltas(normalizedPhrases));
    applyNegativeSignalAttenuation(scores, normalizedPhrases);
    applyComboHeuristics(scores, normalizedTitle);
    applyDependencyBumpHeuristic(scores, normalizedTitle);
    clampCategoryScores(scores);
    return scores;
}
/**
 * Select the best category using a minimum score and margin rule.
 * @param scores Category scores computed by `scoreCategories`.
 * @returns Best section name, or null if inconclusive.
 */
export function bestCategory(scores) {
    let topSection;
    let secondSection;
    for (const section of SECTION_ORDER) {
        if (isNullable(topSection) || scores[section] > scores[topSection]) {
            secondSection = topSection;
            topSection = section;
        }
        else if (isNullable(secondSection) ||
            scores[section] > scores[secondSection]) {
            secondSection = section;
        }
    }
    if (isNullable(topSection))
        return null;
    const topScore = scores[topSection];
    const secondScore = isNullable(secondSection) ? 0 : scores[secondSection];
    if (topScore >= BEST_CATEGORY_MIN_SCORE &&
        topScore - secondScore >= BEST_CATEGORY_REQUIRED_MARGIN) {
        return topSection;
    }
    return null;
}
