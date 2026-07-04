import { Position, Range, Uri } from 'vscode';
import { extractFeatureDescriptions, extractFeatureSteps, extractPlaywrightDescriptions, extractPlaywrightSteps } from '../src/extractors';
import { findMatchingIndexEntries } from '../src/matching';
import { parseFeatureScenarioLine, parseFeatureStepLine, parseFeatureTags } from '../src/parsers/feature';
import { parsePlaywrightStepAtPosition } from '../src/parsers/playwright';
import { createFuzzyExactMatchSuggestions } from '../src/quickFixes';
import { NavigatorConfig, StepIndexEntry } from '../src/types';
import { normaliseStepLabel } from '../src/utils/text';

const baseConfig: NavigatorConfig = {
  specFileGlobs: ['**/*.spec.ts'],
  pageObjectFileGlobs: ['**/*.page.ts'],
  featureFileGlobs: ['**/*.feature'],
  excludeGlobs: [],
  includeKeywordInMatch: true,
  enableDiagnostics: true,
  enableCodeLens: false,
  enableFuzzyMatching: true,
  fuzzyMatchThreshold: 0.82,
  enableRegexMatching: true,
  enablePlaceholderMatching: true,
  enableDebugLogging: false
};

describe('feature parsing', () => {
  it('parses feature steps with the keyword included', () => {
    expect(parseFeatureStepLine('  Given the user logs in ', baseConfig)).toEqual({
      keyword: 'Given',
      text: 'the user logs in',
      label: 'Given the user logs in'
    });
  });

  it('parses scenario titles and tags', () => {
    expect(parseFeatureScenarioLine('  Scenario: should display the login form')).toBe('should display the login form');
    expect(parseFeatureTags('  @login @smoke-test')).toEqual([
      { label: '@login', start: 2, end: 8 },
      { label: '@smoke-test', start: 9, end: 20 }
    ]);
  });

  it('normalises whitespace and smart quotes', () => {
    expect(normaliseStepLabel('Given   \u201cFancy\u201d   text')).toBe('"fancy" text');
  });

  it('extracts feature step ranges without the BDD keyword prefix', () => {
    const steps = extractFeatureSteps('    Given the customer opens checkout', Uri.file('checkout.feature'), baseConfig);

    expect(steps[0].range.start.character).toBe(10);
    expect(steps[0].range.end.character).toBe(37);
    expect(steps[0].label).toBe('Given the customer opens checkout');
  });
});

describe('step matching', () => {
  const uri = Uri.file('example.spec.ts');
  const entries: StepIndexEntry[] = [
    createEntry('Given the user logs in as {role}', uri, 0),
    createEntry('regex:^Then the form should show .+ credentials$', uri, 1),
    createEntry('When the user views the login form', uri, 2)
  ];

  it('matches placeholders', () => {
    expect(findMatchingIndexEntries('Given the user logs in as admin', entries, baseConfig)[0].kind).toBe('placeholder');
  });

  it('ignores BDD prefixes when matching exact labels', () => {
    expect(findMatchingIndexEntries('Then the user views the login form', entries, baseConfig)[0].kind).toBe('exact');
  });

  it('ignores BDD prefixes when matching placeholders', () => {
    expect(findMatchingIndexEntries('Then the user logs in as admin', entries, baseConfig)[0].kind).toBe('placeholder');
  });

  it('matches placeholders when the source label is the pattern', () => {
    const concreteFeatureEntries = [
      createEntry('When the user logs in as "standard-user"', uri, 3)
    ];

    expect(findMatchingIndexEntries('When the user logs in as {role}', concreteFeatureEntries, baseConfig)[0].kind).toBe('placeholder');
  });

  it('matches regex labels', () => {
    expect(findMatchingIndexEntries('Then the form should show pre-filled credentials', entries, baseConfig)[0].kind).toBe('regex');
  });

  it('ignores BDD prefixes when matching regex labels', () => {
    expect(findMatchingIndexEntries('And the form should show pre-filled credentials', entries, baseConfig)[0].kind).toBe('regex');
  });

  it('matches regex labels when the source label is the pattern', () => {
    const concreteFeatureEntries = [
      createEntry('Then the dashboard should show 3 widgets', uri, 4)
    ];

    expect(findMatchingIndexEntries('regex:^Then the dashboard should show \\d+ widgets$', concreteFeatureEntries, baseConfig)[0].kind).toBe('regex');
  });

  it('falls back to fuzzy matches', () => {
    expect(findMatchingIndexEntries('When the user view the login form', entries, baseConfig)[0].kind).toBe('fuzzy');
  });
});

describe('quick fix wording suggestions', () => {
  it('suggests exact wording from fuzzy matches without the BDD prefix', () => {
    const uri = Uri.file('example.spec.ts');
    const candidates = [
      createEntry('Then the account recovery email should be sent', uri, 0),
      createEntry('Then the dashboard should show 3 widgets', uri, 1)
    ];
    const matches = findMatchingIndexEntries(
      'Then the account recovery emai should be sent',
      candidates,
      baseConfig
    );

    const suggestions = createFuzzyExactMatchSuggestions(
      'Then the account recovery emai should be sent',
      matches
    );

    expect(suggestions[0]).toEqual(expect.objectContaining({
      label: 'Then the account recovery email should be sent',
      replacementText: 'the account recovery email should be sent'
    }));
  });

  it('does not suggest wording updates for non-fuzzy matches', () => {
    const uri = Uri.file('example.spec.ts');
    const candidates = [
      createEntry('Then the dashboard should show 3 widgets', uri, 0)
    ];
    const matches = findMatchingIndexEntries(
      'Given the dashboard should show 3 widgets',
      candidates,
      baseConfig
    );

    const suggestions = createFuzzyExactMatchSuggestions('Given the dashboard should show 3 widgets', matches);

    expect(matches[0].kind).toBe('exact');
    expect(suggestions).toEqual([]);
  });
});

describe('Playwright extraction', () => {
  it('extracts Playwright step ranges without the BDD keyword prefix', () => {
    const source = 'await test.step("Given the customer opens checkout", async () => {});';
    const steps = extractPlaywrightSteps(source, Uri.file('example.spec.ts'), baseConfig);

    expect(steps[0].range.start.character).toBe(source.indexOf('the customer opens checkout'));
    expect(steps[0].range.end.character).toBe(source.indexOf('", async'));
    expect(steps[0].label).toBe('Given the customer opens checkout');
  });

  it('parses Playwright step ranges without the BDD keyword prefix', () => {
    const source = 'await test.step("Given the customer opens checkout", async () => {});';
    const document = {
      positionAt: (offset: number) => new Position(0, offset)
    };
    const parsedStep = parsePlaywrightStepAtPosition(source, source.indexOf('Given'), document);

    expect(parsedStep?.range.start.character).toBe(source.indexOf('the customer opens checkout'));
    expect(parsedStep?.range.end.character).toBe(source.indexOf('", async'));
  });

  it('extracts test descriptions, describe descriptions, and annotation tags', () => {
    const playwrightSource = `
test("should display the login form", { tag: ["@login", "@smoke"] }, async () => {
  await test.step("Given the user is on the login page", async () => {});
});
test.describe("login mode", () => {});
`;
    const descriptions = extractPlaywrightDescriptions(playwrightSource, Uri.file('example.spec.ts'), baseConfig);

    expect(descriptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'test', label: 'should display the login form' }),
      expect.objectContaining({ kind: 'tag', label: '@login' }),
      expect.objectContaining({ kind: 'tag', label: '@smoke' }),
      expect.objectContaining({ kind: 'describe', label: 'login mode' })
    ]));
  });
});

describe('feature description extraction', () => {
  it('extracts scenario descriptions and tags for CodeLens counts', () => {
    const featureSource = `
@login @smoke
Scenario: should display the login form
  Given the user is on the login page
`;
    const descriptions = extractFeatureDescriptions(featureSource, Uri.file('login.feature'), baseConfig);

    expect(descriptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'tag', label: '@login' }),
      expect.objectContaining({ kind: 'tag', label: '@smoke' }),
      expect.objectContaining({ kind: 'scenario', label: 'should display the login form' })
    ]));
  });
});

function createEntry(label: string, uri: Uri, line: number): StepIndexEntry {
  return {
    label,
    normalised: normaliseStepLabel(label),
    uri,
    range: new Range(new Position(line, 0), new Position(line, 1)),
    source: 'playwright'
  };
}
