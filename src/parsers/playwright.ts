import * as vscode from 'vscode';
import { NavigatorConfig, ParsedPlaywrightLabel } from '../types';
import { extractPlaywrightDescriptions } from '../extractors';
import { TEST_STEP_PATTERN } from '../constants';
import { getStepTextStartOffset, offsetAtPosition, unescapeJavaScriptString } from '../utils/text';

export function parsePlaywrightStepAtPosition(
  source: string,
  offset: number,
  document: Pick<vscode.TextDocument, 'positionAt'>
): ParsedPlaywrightLabel | undefined {
  TEST_STEP_PATTERN.lastIndex = 0;

  for (const match of source.matchAll(TEST_STEP_PATTERN)) {
    const startOffset = match.index ?? 0;
    const quoteOffsetInMatch = match[0].indexOf(match[1]);

    if (quoteOffsetInMatch < 0) {
      continue;
    }

    const rawLabel = unescapeJavaScriptString(match[2]);
    const fullLabelStartOffset = startOffset + quoteOffsetInMatch + 1;
    const labelStartOffset = fullLabelStartOffset + getStepTextStartOffset(rawLabel);
    const labelEndOffset = fullLabelStartOffset + match[2].length;

    if (offset < fullLabelStartOffset || offset > labelEndOffset) {
      continue;
    }

    return {
      label: rawLabel,
      range: new vscode.Range(document.positionAt(labelStartOffset), document.positionAt(labelEndOffset))
    };
  }

  return undefined;
}

export function parsePlaywrightDescriptionAtPosition(
  source: string,
  offset: number,
  document: Pick<vscode.TextDocument, 'positionAt'>,
  config: NavigatorConfig
): ParsedPlaywrightLabel | undefined {
  const entries = extractPlaywrightDescriptions(source, vscode.Uri.file('__current__'), config);

  for (const entry of entries) {
    const startOffset = offsetAtPosition(source, entry.range.start);
    const endOffset = offsetAtPosition(source, entry.range.end);

    if (offset >= startOffset && offset <= endOffset) {
      return {
        label: entry.label,
        range: new vscode.Range(document.positionAt(startOffset), document.positionAt(endOffset))
      };
    }
  }

  return undefined;
}
