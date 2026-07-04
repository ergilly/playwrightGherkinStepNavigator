# Playwright Gherkin Step Navigator

Navigate between Gherkin .feature steps and matching Playwright test.step() calls.

This extension does not require Cucumber, playwright-bdd, generated step definitions, or any other BDD framework. It matches feature steps to Playwright `test.step()` labels, including exact, placeholder, regex, and fuzzy matches.

## Example

Feature file:

```gherkin
Scenario: Login
  Given I am on the login page
  When I sign in with valid credentials
  Then I should see the dashboard
```

Playwright test:

```ts
test('Login', async ({ page }) => {
  await test.step('Given I am on the login page', async () => {});
  await test.step("When I sign in with valid credentials", async () => {});
  await test.step(`Then I should see the dashboard`, async () => {});
});
```

Ctrl+click, Go to Definition, and Peek Definition work in both directions:

- from a Gherkin feature step to matching Playwright test.step() calls
- from a Playwright test.step() label back to matching Gherkin feature steps, including from specs, page objects, and shared step files

If multiple matching locations exist, VS Code will show multiple locations. Feature-file navigation only returns Playwright spec/test files, and reverse navigation only returns `.feature` files.

## Matching

Matching starts with exact string matching after normalisation: trim whitespace, collapse duplicate spaces, normalise smart quotes, and compare case-insensitively.

If no exact match is found, the extension can also match:

- placeholders in Playwright labels, such as `Given the user logs in as {role}`, `Given the user logs in as <role>`, or `Given the user logs in as :role`
- regex Playwright labels written as `regex:^Then the form should show .+ credentials$` or `/^Then the form should show .+ credentials$/`
- fuzzy matches above `playwrightGherkinStepNavigator.fuzzyMatchThreshold`

Supported labels: test.step('...'), test.step("..."), and test.step(`...`).

Reverse navigation underlines the full test.step() label string and activates from anywhere inside that label.

Scenario descriptions also link to matching `test("...")` or `test.describe("...")` descriptions. Feature tags link to Playwright annotations such as:

```ts
test("should display the login form", { tag: "@login" }, async () => {});
```

## Configuration

```json
{
  "playwrightGherkinStepNavigator.specFileGlobs": ["**/*.spec.ts", "**/*.test.ts", "**/*.spec.js", "**/*.test.js"],
  "playwrightGherkinStepNavigator.featureFileGlobs": ["**/*.feature"],
  "playwrightGherkinStepNavigator.excludeGlobs": ["**/node_modules/**", "**/dist/**", "**/out/**", "**/playwright-report/**", "**/test-results/**"],
  "playwrightGherkinStepNavigator.includeKeywordInMatch": false,
  "playwrightGherkinStepNavigator.enableDiagnostics": true,
  "playwrightGherkinStepNavigator.enableCodeLens": false,
  "playwrightGherkinStepNavigator.enableFuzzyMatching": true,
  "playwrightGherkinStepNavigator.fuzzyMatchThreshold": 0.82,
  "playwrightGherkinStepNavigator.enableRegexMatching": true,
  "playwrightGherkinStepNavigator.enablePlaceholderMatching": true,
  "playwrightGherkinStepNavigator.pageObjectFileGlobs": ["**/pages/**/*.ts", "**/page-objects/**/*.ts", "**/*.page.ts", "**/*.steps.ts"],
  "playwrightGherkinStepNavigator.enableDebugLogging": false
}
```

BDD keywords such as `Given`, `When`, `Then`, `And`, `But`, and `*` are always ignored during matching. The `includeKeywordInMatch` setting is deprecated and no longer changes matching behavior.

## Reusable steps and page objects

Reusable Playwright steps work best when they live in ordinary TypeScript files that still call `test.step()`. By default the extension indexes page-object and shared-step files under `pages`, `page-objects`, `*.page.ts`, and `*.steps.ts`.

For example:

```ts
export class LoginPage {
  async openInLoginMode() {
    await test.step("Given the user is on the login page in login mode", async () => {
      // ...
    });
  }
}
```

Adjust `playwrightGherkinStepNavigator.pageObjectFileGlobs` if your project uses a different structure.

## Catalogue and commands

The Explorer includes a `Playwright Steps` view with the workspace-wide step catalogue. You can also run:

- `Playwright Gherkin: Go to Playwright Step`
- `Playwright Gherkin: Go to Feature Step`
- `Playwright Gherkin: Show Step Catalogue`
- `Playwright Gherkin: Show Output`

## CodeLens

Feature steps, feature tags, scenario descriptions, Playwright `test.step()` labels, Playwright test descriptions, `test.describe()` descriptions, and Playwright annotation tags show inline match counts such as `No Playwright matches`, `1 Playwright match`, or `3 feature matches`. Click a CodeLens item to navigate to the match list or matching step. Disable this with `playwrightGherkinStepNavigator.enableCodeLens`.

## Diagnostics

Feature steps with no matching Playwright `test.step()` are shown as warnings in `.feature` files. Disable this with `playwrightGherkinStepNavigator.enableDiagnostics` if you only want navigation.

Undefined-step diagnostics include a quick fix that copies a matching `await test.step(...)` snippet to the clipboard. When diagnostics are enabled and a feature step is matched fuzzily, a hint diagnostic surfaces a quick fix to update the feature wording to the exact matched Playwright step label.

## Development

```bash
npm install
npm run compile
npm test
```

Press F5 in VS Code to start an Extension Development Host.

Use the `Run Extension Against Sample Workspace` launch configuration to open `sample-workspace`, a separate fixture project that exercises exact, fuzzy, regex, placeholder, page-object, reusable-step, scenario, tag, diagnostics, logging, command, and catalogue behavior.

The extension entrypoint is intentionally small. Core logic lives in focused modules under `src`:

- `parsers` for feature and Playwright label parsing
- `extractors.ts` for indexing source files
- `matching.ts` for exact, placeholder, regex, and fuzzy matching
- `stepIndex.ts` for workspace index state and collection
- `navigatorRuntime.ts` for VS Code providers, commands, diagnostics, and views

Unit tests use Jest and mock the small slice of the VS Code API needed by the pure modules.

## Packaging and Publishing

```bash
npm install
npm run package
npm run publish
```

Before publishing, replace your-publisher-name in package.json with your Marketplace publisher ID and configure vsce with a Marketplace personal access token.

## Compatibility

If another Gherkin extension, such as Cucumber (Gherkin) Full Support, also provides definitions for .feature files, VS Code may combine its definition results with this extension's DefinitionProvider results. To keep Ctrl+click focused on Playwright specs, this extension also provides command-backed document links on feature steps. Those links use only this extension's index and avoid returning the feature step itself.
