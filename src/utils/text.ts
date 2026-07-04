import * as vscode from 'vscode';
import { STEP_KEYWORDS } from '../constants';

export function normaliseStepLabel(label: string, _includeKeywordInMatch = true): string {
  const normalised = stripLeadingStepKeyword(label
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .trim()
    .replace(/\s+/g, ' '));

  return normalised.toLocaleLowerCase();
}

export function stripLeadingStepKeyword(label: string): string {
  const keywordPattern = STEP_KEYWORDS.map(escapeRegExp).join('|');

  return label.replace(new RegExp('^(' + keywordPattern + ')\\s+', 'i'), '');
}

export function getStepTextStartOffset(label: string): number {
  const keywordPattern = STEP_KEYWORDS.map(escapeRegExp).join('|');
  const match = label.match(new RegExp('^(' + keywordPattern + ')\\s+', 'i'));

  return match ? match[0].length : 0;
}

export function unescapeJavaScriptString(value: string): string {
  return value
    .replace(/\\\x60/g, String.fromCharCode(96))
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
}

export function escapeJavaScriptSingleQuotedString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

export function getLineStarts(source: string): number[] {
  const lineStarts = [0];

  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) {
      lineStarts.push(index + 1);
    }
  }

  return lineStarts;
}

export function positionAtOffset(lineStarts: number[], offset: number): vscode.Position {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);

    if (lineStarts[mid] <= offset) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const line = Math.max(0, low - 1);

  return new vscode.Position(line, offset - lineStarts[line]);
}

export function offsetAtPosition(source: string, position: vscode.Position): number {
  const lineStarts = getLineStarts(source);
  const lineStart = lineStarts[position.line] ?? source.length;

  return Math.min(source.length, lineStart + position.character);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
}
