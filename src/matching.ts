import { MatchResult, NavigatorConfig, StepIndexEntry } from './types';
import { escapeRegExp, normaliseStepLabel } from './utils/text';

export function findMatchingIndexEntries(label: string, entries: StepIndexEntry[], config: NavigatorConfig): MatchResult[] {
  const normalised = normaliseStepLabel(label, config.includeKeywordInMatch);
  const exactMatches = entries
    .filter((entry) => entry.normalised === normalised)
    .map((entry) => ({ entry, kind: 'exact' as const, score: 1 }));

  if (exactMatches.length > 0) {
    return exactMatches;
  }

  const patternMatches: MatchResult[] = [];

  if (config.enablePlaceholderMatching) {
    patternMatches.push(...entries
      .filter((entry) =>
        placeholderLabelMatches(entry.label, label, config.includeKeywordInMatch)
        || placeholderLabelMatches(label, entry.label, config.includeKeywordInMatch)
      )
      .map((entry) => ({ entry, kind: 'placeholder' as const, score: 0.98 })));
  }

  if (config.enableRegexMatching) {
    patternMatches.push(...entries
      .filter((entry) =>
        regexLabelMatches(entry.label, label, config.includeKeywordInMatch)
        || regexLabelMatches(label, entry.label, config.includeKeywordInMatch)
      )
      .map((entry) => ({ entry, kind: 'regex' as const, score: 0.96 })));
  }

  if (patternMatches.length > 0) {
    return dedupeMatchResults(patternMatches);
  }

  if (!config.enableFuzzyMatching) {
    return [];
  }

  return entries
    .map((entry) => ({ entry, kind: 'fuzzy' as const, score: calculateFuzzyScore(normalised, entry.normalised) }))
    .filter((result) => result.score >= config.fuzzyMatchThreshold)
    .sort((left, right) => right.score - left.score)
    .slice(0, 10);
}

export function calculateFuzzyScore(left: string, right: string): number {
  if (left === right) {
    return 1;
  }

  if (!left || !right) {
    return 0;
  }

  const distance = levenshteinDistance(left, right);
  const maxLength = Math.max(left.length, right.length);

  return 1 - distance / maxLength;
}

function placeholderLabelMatches(patternLabel: string, candidateLabel: string, includeKeywordInMatch: boolean): boolean {
  if (!/[{<:]/.test(patternLabel)) {
    return false;
  }

  const pattern = normaliseStepLabel(patternLabel, includeKeywordInMatch)
    .replace(/\{[a-z0-9_.-]+\}/gi, '___PLACEHOLDER___')
    .replace(/<\s*[a-z0-9_.-]+\s*>/gi, '___PLACEHOLDER___')
    .replace(/(^|\s):[a-z0-9_.-]+/gi, '$1___PLACEHOLDER___');
  const regexSource = '^' + escapeRegExp(pattern).replace(/___PLACEHOLDER___/g, '.+?') + '$';

  return new RegExp(regexSource, 'i').test(normaliseStepLabel(candidateLabel, includeKeywordInMatch));
}

function regexLabelMatches(patternLabel: string, candidateLabel: string, includeKeywordInMatch: boolean): boolean {
  const regexSource = parseRegexLabel(patternLabel);

  if (!regexSource) {
    return false;
  }

  try {
    return new RegExp(stripLeadingRegexStepKeyword(regexSource), 'i').test(normaliseStepLabel(candidateLabel, includeKeywordInMatch));
  } catch {
    return false;
  }
}

function parseRegexLabel(label: string): string | undefined {
  const trimmed = label.trim();

  if (trimmed.startsWith('regex:')) {
    return trimmed.slice('regex:'.length).trim();
  }

  const slashRegex = trimmed.match(/^\/(.+)\/([a-z]*)$/i);

  return slashRegex ? slashRegex[1] : undefined;
}

function stripLeadingRegexStepKeyword(regexSource: string): string {
  return regexSource
    .replace(/^\^\s*(Given|When|Then|And|But|\*)\s+/i, '^')
    .replace(/^\s*(Given|When|Then|And|But|\*)\s+/i, '');
}

function dedupeMatchResults(results: MatchResult[]): MatchResult[] {
  const byUriAndRange = new Map<string, MatchResult>();

  for (const result of results) {
    const key = result.entry.uri.toString() + ':' + result.entry.range.start.line + ':' + result.entry.range.start.character;
    const previous = byUriAndRange.get(key);

    if (!previous || result.score > previous.score) {
      byUriAndRange.set(key, result);
    }
  }

  return Array.from(byUriAndRange.values()).sort((left, right) => right.score - left.score);
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost
      );
    }

    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index];
    }
  }

  return previous[right.length];
}
