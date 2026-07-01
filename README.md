# Playwright Gherkin Step Navigator

Navigate between Gherkin .feature steps and matching Playwright test.step() calls.

This extension does not require Cucumber, playwright-bdd, generated step definitions, or any other BDD framework. It uses exact string matching between feature steps and Playwright test.step() labels.

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
- from a Playwright test.step() label back to matching Gherkin feature steps

If multiple matching locations exist, VS Code will show multiple locations. Feature-file navigation only returns Playwright spec/test files, and reverse navigation only returns `.feature` files.

## Matching

The first version supports exact string matching after normalisation: trim whitespace, collapse duplicate spaces, normalise smart quotes, and compare case-insensitively.

Supported labels: test.step('...'), test.step("..."), and test.step(`...`).

Reverse navigation underlines the full test.step() label string and activates from anywhere inside that label.

## Configuration

```json
{
  "playwrightGherkinStepNavigator.specFileGlobs": ["**/*.spec.ts", "**/*.test.ts", "**/*.spec.js", "**/*.test.js"],
  "playwrightGherkinStepNavigator.featureFileGlobs": ["**/*.feature"],
  "playwrightGherkinStepNavigator.excludeGlobs": ["**/node_modules/**", "**/dist/**", "**/out/**", "**/playwright-report/**", "**/test-results/**"],
  "playwrightGherkinStepNavigator.includeKeywordInMatch": true
}
```

When includeKeywordInMatch is false, the leading Gherkin keyword is ignored during matching.

## Development

```bash
npm install
npm run compile
```

Press F5 in VS Code to start an Extension Development Host.

## Packaging and Publishing

```bash
npm install
npm run package
npm run publish
```

Before publishing, replace your-publisher-name in package.json with your Marketplace publisher ID and configure vsce with a Marketplace personal access token.

## Compatibility

If another Gherkin extension, such as Cucumber (Gherkin) Full Support, also provides definitions for .feature files, VS Code may combine its definition results with this extension's DefinitionProvider results. To keep Ctrl+click focused on Playwright specs, this extension also provides command-backed document links on feature steps. Those links use only this extension's index and avoid returning the feature step itself.
