import * as vscode from 'vscode';
import { CONFIG_SECTION } from './constants';
import { NavigatorConfig } from './types';

export function getNavigatorConfig(): NavigatorConfig {
  const configuration = vscode.workspace.getConfiguration(CONFIG_SECTION);

  return {
    specFileGlobs: configuration.get<string[]>('specFileGlobs', ['**/*.spec.ts', '**/*.test.ts', '**/*.spec.js', '**/*.test.js']),
    pageObjectFileGlobs: configuration.get<string[]>('pageObjectFileGlobs', ['**/pages/**/*.ts', '**/page-objects/**/*.ts', '**/*.page.ts', '**/*.steps.ts']),
    featureFileGlobs: configuration.get<string[]>('featureFileGlobs', ['**/*.feature']),
    excludeGlobs: configuration.get<string[]>('excludeGlobs', ['**/node_modules/**', '**/dist/**', '**/out/**', '**/playwright-report/**', '**/test-results/**']),
    includeKeywordInMatch: configuration.get<boolean>('includeKeywordInMatch', false),
    enableDiagnostics: configuration.get<boolean>('enableDiagnostics', true),
    enableCodeLens: configuration.get<boolean>('enableCodeLens', false),
    enableFuzzyMatching: configuration.get<boolean>('enableFuzzyMatching', true),
    fuzzyMatchThreshold: configuration.get<number>('fuzzyMatchThreshold', 0.82),
    enableRegexMatching: configuration.get<boolean>('enableRegexMatching', true),
    enablePlaceholderMatching: configuration.get<boolean>('enablePlaceholderMatching', true),
    enableDebugLogging: configuration.get<boolean>('enableDebugLogging', false)
  };
}
