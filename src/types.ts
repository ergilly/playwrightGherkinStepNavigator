import * as vscode from 'vscode';

export type MatchKind = 'exact' | 'placeholder' | 'regex' | 'fuzzy';
export type StepSource = 'playwright' | 'feature';
export type DescriptionKind = 'scenario' | 'test' | 'describe' | 'tag';
export type NavigateDirection = 'playwright' | 'feature';

export interface StepIndexEntry {
  label: string;
  normalised: string;
  uri: vscode.Uri;
  range: vscode.Range;
  source: StepSource;
}

export interface DescriptionIndexEntry {
  label: string;
  normalised: string;
  uri: vscode.Uri;
  range: vscode.Range;
  kind: DescriptionKind;
}

export interface NavigatorConfig {
  specFileGlobs: string[];
  pageObjectFileGlobs: string[];
  featureFileGlobs: string[];
  excludeGlobs: string[];
  includeKeywordInMatch: boolean;
  enableDiagnostics: boolean;
  enableCodeLens: boolean;
  enableFuzzyMatching: boolean;
  fuzzyMatchThreshold: number;
  enableRegexMatching: boolean;
  enablePlaceholderMatching: boolean;
  enableDebugLogging: boolean;
}

export interface ParsedFeatureStep {
  keyword: string;
  text: string;
  label: string;
}

export interface ParsedPlaywrightLabel {
  label: string;
  range: vscode.Range;
}

export interface MatchResult {
  entry: StepIndexEntry;
  kind: MatchKind;
  score: number;
}

export interface NavigateCommandArgs {
  label: string;
  sourceUri: string;
  direction: NavigateDirection;
}
