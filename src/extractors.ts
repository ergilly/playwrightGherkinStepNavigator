import * as vscode from 'vscode';
import { PLAYWRIGHT_DESCRIBE_PATTERN, PLAYWRIGHT_TEST_PATTERN, TEST_STEP_PATTERN } from './constants';
import { DescriptionIndexEntry, NavigatorConfig, StepIndexEntry } from './types';
import { getFeatureStepTextStartCharacter, parseFeatureScenarioLine, parseFeatureStepLine, parseFeatureTags } from './parsers/feature';
import { getLineStarts, getStepTextStartOffset, normaliseStepLabel, positionAtOffset, unescapeJavaScriptString } from './utils/text';

export function extractPlaywrightSteps(source: string, uri: vscode.Uri, config: NavigatorConfig): StepIndexEntry[] {
  const entries: StepIndexEntry[] = [];
  const lineStarts = getLineStarts(source);

  TEST_STEP_PATTERN.lastIndex = 0;

  for (const match of source.matchAll(TEST_STEP_PATTERN)) {
    const rawLabel = unescapeJavaScriptString(match[2]);
    const startOffset = match.index ?? 0;
    const quoteOffsetInMatch = match[0].indexOf(match[1]);
    const labelStartOffset = quoteOffsetInMatch < 0
      ? startOffset
      : startOffset + quoteOffsetInMatch + 1 + getStepTextStartOffset(rawLabel);
    const labelEndOffset = quoteOffsetInMatch < 0
      ? startOffset + match[0].length
      : startOffset + quoteOffsetInMatch + 1 + match[2].length;

    entries.push({
      label: rawLabel,
      normalised: normaliseStepLabel(rawLabel, config.includeKeywordInMatch),
      uri,
      range: new vscode.Range(positionAtOffset(lineStarts, labelStartOffset), positionAtOffset(lineStarts, labelEndOffset)),
      source: 'playwright'
    });
  }

  return entries;
}

export function extractFeatureSteps(source: string, uri: vscode.Uri, config: NavigatorConfig): StepIndexEntry[] {
  const entries: StepIndexEntry[] = [];
  const lines = source.split(/\r?\n/);

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const line = lines[lineNumber];
    const parsedStep = parseFeatureStepLine(line, config);

    if (!parsedStep) {
      continue;
    }

    const startCharacter = getFeatureStepTextStartCharacter(line, parsedStep);
    const range = new vscode.Range(
      new vscode.Position(lineNumber, startCharacter),
      new vscode.Position(lineNumber, line.length)
    );

    entries.push({
      label: parsedStep.label,
      normalised: normaliseStepLabel(parsedStep.label, config.includeKeywordInMatch),
      uri,
      range,
      source: 'feature'
    });
  }

  return entries;
}

export function extractPlaywrightDescriptions(source: string, uri: vscode.Uri, config: NavigatorConfig): DescriptionIndexEntry[] {
  const entries: DescriptionIndexEntry[] = [];
  const lineStarts = getLineStarts(source);

  PLAYWRIGHT_TEST_PATTERN.lastIndex = 0;
  for (const match of source.matchAll(PLAYWRIGHT_TEST_PATTERN)) {
    const rawLabel = unescapeJavaScriptString(match[2]);
    const startOffset = match.index ?? 0;
    const labelStartOffset = startOffset + match[0].indexOf(match[1]) + 1;
    const labelEndOffset = labelStartOffset + match[2].length;

    entries.push({
      label: rawLabel,
      normalised: normaliseStepLabel(rawLabel, config.includeKeywordInMatch),
      uri,
      range: new vscode.Range(positionAtOffset(lineStarts, labelStartOffset), positionAtOffset(lineStarts, labelEndOffset)),
      kind: 'test'
    });

    const optionsText = match[3] ?? '';
    for (const tag of extractPlaywrightTagsFromOptions(optionsText)) {
      const tagOffsetInMatch = match[0].indexOf(tag.literal);
      const tagStartOffset = tagOffsetInMatch < 0 ? startOffset : startOffset + tagOffsetInMatch + tag.literal.indexOf(tag.label);
      entries.push({
        label: tag.label,
        normalised: normaliseStepLabel(tag.label, true),
        uri,
        range: new vscode.Range(positionAtOffset(lineStarts, tagStartOffset), positionAtOffset(lineStarts, tagStartOffset + tag.label.length)),
        kind: 'tag'
      });
    }
  }

  PLAYWRIGHT_DESCRIBE_PATTERN.lastIndex = 0;
  for (const match of source.matchAll(PLAYWRIGHT_DESCRIBE_PATTERN)) {
    const rawLabel = unescapeJavaScriptString(match[2]);
    const startOffset = match.index ?? 0;
    const labelStartOffset = startOffset + match[0].indexOf(match[1]) + 1;
    const labelEndOffset = labelStartOffset + match[2].length;

    entries.push({
      label: rawLabel,
      normalised: normaliseStepLabel(rawLabel, config.includeKeywordInMatch),
      uri,
      range: new vscode.Range(positionAtOffset(lineStarts, labelStartOffset), positionAtOffset(lineStarts, labelEndOffset)),
      kind: 'describe'
    });
  }

  return entries;
}

export function extractFeatureDescriptions(source: string, uri: vscode.Uri, config: NavigatorConfig): DescriptionIndexEntry[] {
  const entries: DescriptionIndexEntry[] = [];
  const lines = source.split(/\r?\n/);

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const line = lines[lineNumber];
    const scenario = parseFeatureScenarioLine(line);

    if (scenario) {
      const startCharacter = line.indexOf(scenario);
      entries.push({
        label: scenario,
        normalised: normaliseStepLabel(scenario, config.includeKeywordInMatch),
        uri,
        range: new vscode.Range(
          new vscode.Position(lineNumber, startCharacter),
          new vscode.Position(lineNumber, startCharacter + scenario.length)
        ),
        kind: 'scenario'
      });
    }

    for (const tag of parseFeatureTags(line)) {
      entries.push({
        label: tag.label,
        normalised: normaliseStepLabel(tag.label, true),
        uri,
        range: new vscode.Range(
          new vscode.Position(lineNumber, tag.start),
          new vscode.Position(lineNumber, tag.end)
        ),
        kind: 'tag'
      });
    }
  }

  return entries;
}

export function extractPlaywrightTagsFromOptions(optionsText: string): Array<{ label: string; literal: string }> {
  const tags: Array<{ label: string; literal: string }> = [];
  const tagProperty = optionsText.match(/\btag\s*:\s*(\[[\s\S]*?\]|(['"])(.*?)\2)/);

  if (!tagProperty) {
    return tags;
  }

  const tagText = tagProperty[1];
  const literal = tagProperty[0];
  const stringPattern = /(['"])(@[^'"]+)\1/g;

  for (const match of tagText.matchAll(stringPattern)) {
    tags.push({ label: match[2], literal });
  }

  return tags;
}
