import { STEP_KEYWORDS } from '../constants';
import { NavigatorConfig, ParsedFeatureStep } from '../types';
import { escapeRegExp } from '../utils/text';

export function parseFeatureStepLine(line: string, config: NavigatorConfig): ParsedFeatureStep | undefined {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('@')) {
    return undefined;
  }

  const keywordPattern = STEP_KEYWORDS.map(escapeRegExp).join('|');
  const match = trimmed.match(new RegExp('^(' + keywordPattern + ')\\s+(.+)$', 'i'));

  if (!match) {
    return undefined;
  }

  const keyword = match[1];
  const text = match[2].trim();
  const label = keyword + ' ' + text;

  return { keyword, text, label };
}

export function getFeatureStepTextStartCharacter(line: string, parsedStep: ParsedFeatureStep): number {
  const firstNonWhitespace = line.search(/\S/);
  const keywordStart = firstNonWhitespace < 0 ? 0 : firstNonWhitespace;
  let textStart = keywordStart + parsedStep.keyword.length;

  while (textStart < line.length && /\s/.test(line[textStart])) {
    textStart += 1;
  }

  return textStart;
}

export function parseFeatureScenarioLine(line: string): string | undefined {
  const trimmed = line.trim();
  const match = trimmed.match(/^(Scenario(?: Outline)?):\s+(.+)$/i);

  return match ? match[2].trim() : undefined;
}

export function parseFeatureTags(line: string): Array<{ label: string; start: number; end: number }> {
  const tags: Array<{ label: string; start: number; end: number }> = [];
  const tagPattern = /(^|\s)(@[A-Za-z0-9_.:-]+)/g;

  for (const match of line.matchAll(tagPattern)) {
    const prefixLength = match[1].length;
    const start = (match.index ?? 0) + prefixLength;
    const label = match[2];
    tags.push({ label, start, end: start + label.length });
  }

  return tags;
}

export function parseFeatureTagAtPosition(line: string, character: number): string | undefined {
  return parseFeatureTags(line).find((tag) => character >= tag.start && character <= tag.end)?.label;
}
