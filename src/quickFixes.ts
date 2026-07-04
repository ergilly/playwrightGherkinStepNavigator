import { MatchResult } from './types';
import { normaliseStepLabel, stripLeadingStepKeyword } from './utils/text';

export interface StepWordingSuggestion {
  label: string;
  replacementText: string;
  score: number;
}

export function createFuzzyExactMatchSuggestions(
  sourceLabel: string,
  matches: MatchResult[],
  maxSuggestions = 3
): StepWordingSuggestion[] {
  const sourceNormalised = normaliseStepLabel(sourceLabel, false);
  const suggestions = matches
    .filter((match) => match.kind === 'fuzzy')
    .map((match) => ({
      label: match.entry.label,
      replacementText: stripLeadingStepKeyword(match.entry.label).trim(),
      score: match.score
    }))
    .filter((suggestion) =>
      suggestion.replacementText.length > 0
      && normaliseStepLabel(suggestion.replacementText, false) !== sourceNormalised
    )
    .sort((left, right) => right.score - left.score);

  return dedupeSuggestions(suggestions).slice(0, maxSuggestions);
}

function dedupeSuggestions(suggestions: StepWordingSuggestion[]): StepWordingSuggestion[] {
  const byReplacement = new Map<string, StepWordingSuggestion>();

  for (const suggestion of suggestions) {
    const key = normaliseStepLabel(suggestion.replacementText, false);
    const existing = byReplacement.get(key);

    if (!existing || suggestion.score > existing.score) {
      byReplacement.set(key, suggestion);
    }
  }

  return Array.from(byReplacement.values());
}
