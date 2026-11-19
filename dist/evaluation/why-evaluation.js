import { JEV_EVALUATION_THRESHOLDS } from '../constants/jev.js';
import { combinedWhyCandidateProbability } from '../utils/why-candidate-probability.js';
// Array#indexOf uses this sentinel when generated text has no source candidate.
const SOURCE_CANDIDATE_NOT_FOUND_INDEX = -1;
function ratio(numerator, denominator) {
    return denominator === 0 ? null : numerator / denominator;
}
function f1Score(precision, recall) {
    if (precision === null || recall === null || precision + recall === 0) {
        return null;
    }
    return (2 * precision * recall) / (precision + recall);
}
function expectedCandidateIndexes(evaluationCase) {
    return Array.from(new Set([
        ...(evaluationCase.expectedSelectedCandidateIndex === null
            ? []
            : [evaluationCase.expectedSelectedCandidateIndex]),
        ...(evaluationCase.acceptableCandidateIndexes ?? []),
    ]));
}
function sourceCandidateIndex(candidates, why) {
    const candidateIndex = candidates.indexOf(why);
    return candidateIndex === SOURCE_CANDIDATE_NOT_FOUND_INDEX
        ? undefined
        : candidateIndex;
}
function highestProbabilityCandidate(candidates) {
    return candidates.reduce((best, candidate) => {
        if (!best)
            return candidate;
        return combinedWhyCandidateProbability(candidate) >
            combinedWhyCandidateProbability(best)
            ? candidate
            : best;
    }, undefined);
}
function thresholdMetrics(cases, diagnosticsByPrNumber, threshold) {
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    for (const evaluationCase of cases) {
        const diagnostic = diagnosticsByPrNumber.get(evaluationCase.item.prNumber);
        if (!diagnostic) {
            throw new Error(`Jev confidence evaluation is missing diagnostics for PR #${evaluationCase.item.prNumber}`);
        }
        const expectedIndexes = expectedCandidateIndexes(evaluationCase);
        const expectedSelection = expectedIndexes.length > 0;
        const selectedCandidate = highestProbabilityCandidate(diagnostic.candidateProbabilities);
        const selected = selectedCandidate !== undefined &&
            combinedWhyCandidateProbability(selectedCandidate) >= threshold;
        const selectedExpectedCandidate = selected &&
            selectedCandidate !== undefined &&
            expectedIndexes.includes(selectedCandidate.candidateIndex);
        if (selectedExpectedCandidate)
            truePositives += 1;
        if (selected && !selectedExpectedCandidate)
            falsePositives += 1;
        if (expectedSelection && !selectedExpectedCandidate)
            falseNegatives += 1;
    }
    const precision = ratio(truePositives, truePositives + falsePositives);
    const recall = ratio(truePositives, truePositives + falseNegatives);
    return {
        threshold,
        truePositives,
        falsePositives,
        falseNegatives,
        precision,
        recall,
        f1: f1Score(precision, recall),
    };
}
/**
 * Score extractor output against corpus labels without interpreting generated prose.
 * @param cases Labeled candidate sets sent to the extractor.
 * @param output Returned WHY notes.
 * @param options Optional evaluation parameters (e.g. unanchored prose scoring).
 * @returns Acceptance, exact-source-selection, and counterfactual rejection metrics.
 */
export function evaluateWhySelections(cases, output, options) {
    // WHY: Default to strict evidence-grounded scoring so unanchored prose (which cannot be
    // verified without semantic interpretation) does not inflate confirmed true positives.
    const allowParaphrasedEvidence = options?.allowParaphrasedEvidence ?? false;
    const casesByPrNumber = new Map();
    for (const evaluationCase of cases) {
        if (casesByPrNumber.has(evaluationCase.item.prNumber)) {
            throw new Error(`WHY evaluation corpus contains duplicate PR #${evaluationCase.item.prNumber}`);
        }
        casesByPrNumber.set(evaluationCase.item.prNumber, evaluationCase);
    }
    const outputByPrNumber = new Map();
    let unexpectedSelections = 0;
    let duplicateSelections = 0;
    for (const note of output) {
        if (!casesByPrNumber.has(note.prNumber)) {
            unexpectedSelections += 1;
            continue;
        }
        if (outputByPrNumber.has(note.prNumber)) {
            duplicateSelections += 1;
            continue;
        }
        outputByPrNumber.set(note.prNumber, note);
    }
    let expectedSelections = 0;
    let predictedSelections = 0;
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    let decisionTruePositives = 0;
    let exactCandidatePreservations = 0;
    let wrongCandidateSelections = 0;
    let unanchoredSelections = 0;
    let wrongChangeAcceptances = 0;
    let wrongChangeRejections = 0;
    let missingReasonRejections = 0;
    let totalMissingReasonCases = 0;
    const outcomes = [];
    for (const evaluationCase of cases) {
        const expectedIndex = evaluationCase.expectedSelectedCandidateIndex;
        const expectedIndexes = expectedCandidateIndexes(evaluationCase);
        const expectedSelection = expectedIndexes.length > 0;
        const predicted = outputByPrNumber.get(evaluationCase.item.prNumber);
        const predictedSelection = predicted !== undefined;
        const selectedCandidateIndex = predicted
            ? sourceCandidateIndex(evaluationCase.item.candidates, predicted.why)
            : undefined;
        const preservesExpectedCandidate = selectedCandidateIndex !== undefined &&
            expectedIndexes.includes(selectedCandidateIndex);
        // WHY: A note that matches a candidate from the source item but does not match any
        // acceptable candidate index is an explicitly wrong candidate choice.
        const isWrongCandidate = predictedSelection &&
            selectedCandidateIndex !== undefined &&
            !expectedIndexes.includes(selectedCandidateIndex);
        // WHY: A note that does not match any candidate from the source item is unanchored.
        // Generative models may paraphrase evidence, but purely extractive engines should not emit unanchored text.
        const isUnanchored = predictedSelection && selectedCandidateIndex === undefined;
        if (isUnanchored) {
            unanchoredSelections += 1;
        }
        outcomes.push({
            id: evaluationCase.id,
            prNumber: evaluationCase.item.prNumber,
            familyId: evaluationCase.familyId,
            counterfactualRole: evaluationCase.counterfactualRole,
            expectedSelectedCandidateIndex: expectedIndex,
            selected: predictedSelection,
            selectedCandidateIndex: selectedCandidateIndex ?? null,
            preservesExpectedCandidate,
            isWrongCandidate,
            isUnanchored,
        });
        if (expectedSelection)
            expectedSelections += 1;
        if (predictedSelection)
            predictedSelections += 1;
        if (evaluationCase.counterfactualRole === 'missing-reason') {
            totalMissingReasonCases += 1;
        }
        if (expectedSelection && predictedSelection) {
            if (isWrongCandidate) {
                // WHY: Selecting an explicitly wrong candidate is both a false assertion of that candidate
                // and a failure to select the expected candidate.
                falsePositives += 1;
                falseNegatives += 1;
                wrongCandidateSelections += 1;
            }
            else if (isUnanchored) {
                decisionTruePositives += 1;
                if (allowParaphrasedEvidence) {
                    truePositives += 1;
                }
                else {
                    falsePositives += 1;
                    falseNegatives += 1;
                }
            }
            else {
                truePositives += 1;
                decisionTruePositives += 1;
                if (preservesExpectedCandidate) {
                    exactCandidatePreservations += 1;
                }
            }
            continue;
        }
        if (expectedSelection) {
            falseNegatives += 1;
            continue;
        }
        if (predictedSelection) {
            falsePositives += 1;
            if (evaluationCase.counterfactualRole === 'unrelated-rationale') {
                wrongChangeAcceptances += 1;
            }
            continue;
        }
        // Case had expectedSelection === false and predictedSelection === false: correct rejection.
        if (evaluationCase.counterfactualRole === 'unrelated-rationale') {
            wrongChangeRejections += 1;
        }
        else if (evaluationCase.counterfactualRole === 'missing-reason') {
            missingReasonRejections += 1;
        }
    }
    // WHY: Notes for unknown PRs or duplicate notes for a known PR have no unique
    // positive corpus outcome, so both must reduce precision.
    predictedSelections += unexpectedSelections + duplicateSelections;
    falsePositives += unexpectedSelections + duplicateSelections;
    const precision = ratio(truePositives, predictedSelections);
    const recall = ratio(truePositives, expectedSelections);
    const f1 = f1Score(precision, recall);
    const decisionPrecision = ratio(decisionTruePositives, predictedSelections);
    const decisionRecall = ratio(decisionTruePositives, expectedSelections);
    const decisionF1 = f1Score(decisionPrecision, decisionRecall);
    const totalUnrelatedCases = wrongChangeAcceptances + wrongChangeRejections;
    const wrongChangeAcceptanceRate = ratio(wrongChangeAcceptances, totalUnrelatedCases);
    const missingReasonRejectionRate = ratio(missingReasonRejections, totalMissingReasonCases);
    return {
        caseCount: cases.length,
        expectedSelections,
        predictedSelections,
        truePositives,
        falsePositives,
        falseNegatives,
        precision,
        recall,
        f1,
        decisionTruePositives,
        decisionPrecision,
        decisionRecall,
        decisionF1,
        exactCandidatePreservations,
        exactCandidatePreservationRate: ratio(exactCandidatePreservations, expectedSelections),
        unexpectedSelections,
        duplicateSelections,
        wrongCandidateSelections,
        unanchoredSelections,
        wrongChangeAcceptances,
        wrongChangeRejections,
        wrongChangeAcceptanceRate,
        missingReasonRejections,
        missingReasonRejectionRate,
        outcomes,
    };
}
/**
 * Evaluate Jev's raw candidate probabilities independently of the active threshold.
 * @param cases Labeled candidate sets sent to Jev.
 * @param diagnostics Jev decision diagnostics returned for the same candidate sets.
 * @param thresholds Optional probability thresholds to evaluate (defaults to JEV_EVALUATION_THRESHOLDS).
 * @returns Probability calibration proxy and acceptance trade-offs.
 */
export function evaluateJevConfidence(cases, diagnostics, thresholds = JEV_EVALUATION_THRESHOLDS) {
    const diagnosticsByPrNumber = new Map();
    for (const diagnostic of diagnostics) {
        diagnosticsByPrNumber.set(diagnostic.prNumber, diagnostic);
    }
    const positiveProbabilities = [];
    const negativeProbabilities = [];
    let squaredErrorSum = 0;
    let candidateCount = 0;
    for (const evaluationCase of cases) {
        const diagnostic = diagnosticsByPrNumber.get(evaluationCase.item.prNumber);
        if (!diagnostic) {
            throw new Error(`Jev confidence evaluation is missing diagnostics for PR #${evaluationCase.item.prNumber}`);
        }
        const expectedIndexes = expectedCandidateIndexes(evaluationCase);
        for (const candidate of diagnostic.candidateProbabilities) {
            const probability = combinedWhyCandidateProbability(candidate);
            const isExpectedCandidate = expectedIndexes.includes(candidate.candidateIndex);
            squaredErrorSum += (probability - Number(isExpectedCandidate)) ** 2;
            candidateCount += 1;
            if (isExpectedCandidate)
                positiveProbabilities.push(probability);
            else
                negativeProbabilities.push(probability);
        }
    }
    const mean = (values) => values.length === 0
        ? null
        : values.reduce((sum, value) => sum + value, 0) / values.length;
    return {
        candidateCount,
        brierScore: ratio(squaredErrorSum, candidateCount),
        meanPositiveProbability: mean(positiveProbabilities),
        meanNegativeProbability: mean(negativeProbabilities),
        thresholds: thresholds.map((threshold) => thresholdMetrics(cases, diagnosticsByPrNumber, threshold)),
    };
}
