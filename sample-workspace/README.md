# Playwright Gherkin Step Navigator Test Workspace

Open this folder as a separate VS Code workspace when running the extension in an Extension Development Host.

## How to Use

1. From the extension project, run `npm run compile`.
2. Press `F5` in VS Code to launch an Extension Development Host.
3. In the Extension Development Host, open this folder: `sample-workspace`.
4. Open the numbered files under `features/` and try Ctrl+click, Go to Definition, context menu commands, CodeLens, diagnostics, and the Explorer `Playwright Steps` view.

## Coverage Map

Each capability has its own feature file and, where applicable, a matching spec file:

| Feature file | Proves |
| --- | --- |
| `features/01-exact-step-match.feature` | Exact feature step to `test.step()` matching |
| `features/02-prefix-insensitive-match.feature` | `Given` / `When` / `Then` prefixes are ignored during matching |
| `features/03-placeholder-match.feature` | Placeholder labels such as `{role}` and `{workspaceName}` match concrete values |
| `features/04-regex-match.feature` | Regex labels such as `regex:^Then ...$` match dynamic values |
| `features/05-fuzzy-match.feature` | Fuzzy matching tolerates small text differences and offers an exact-wording quick fix |
| `features/06-page-object-steps.feature` | `test.step()` calls inside page objects are indexed |
| `features/07-reusable-steps.feature` | Shared step helper files are indexed |
| `features/08-scenario-description-link.feature` | Scenario descriptions link to `test(...)` and `test.describe(...)` descriptions |
| `features/09-tag-link.feature` | Feature tags link to Playwright annotation tags, including tag arrays |
| `features/10-undefined-step-quick-fix.feature` | Undefined-step diagnostics and quick fixes appear when no match exists |
| `features/11-catalogue-and-logging.feature` | Indexed steps appear in the catalogue and debug logging can be viewed |

The matching Playwright files use the same numbering under `tests/`. The undefined-step fixture deliberately has no `10-...spec.ts` file.

## Reusable Step Fixtures

- Page-object steps live in `pages/login.page.ts`.
- Shared helper steps live in `steps/auth.steps.ts`.
- Exclusion behavior is represented by `excluded/ignored.spec.ts`, which should not appear in the catalogue because `.vscode/settings.json` excludes `**/excluded/**`.

## Intentional Oddities

Some tests are not meant to be executed. This workspace is a navigation fixture, so the code is shaped to exercise extension indexing and matching behavior rather than run against a real application.
