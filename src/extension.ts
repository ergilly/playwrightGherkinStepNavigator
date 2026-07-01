import * as vscode from 'vscode';

const CONFIG_SECTION = 'playwrightGherkinStepNavigator';
const STEP_KEYWORDS = ['Given', 'When', 'Then', 'And', 'But', '*'];
const TEST_STEP_PATTERN = new RegExp("test\\s*\\.\\s*step\\s*\\(\\s*(['\\\"\\x60])((?:\\\\.|(?!\\1)[\\s\\S])*?)\\1", 'g');

export interface StepIndexEntry {
  label: string;
  normalised: string;
  uri: vscode.Uri;
  range: vscode.Range;
}

export interface NavigatorConfig {
  specFileGlobs: string[];
  featureFileGlobs: string[];
  excludeGlobs: string[];
  includeKeywordInMatch: boolean;
}

export interface ParsedFeatureStep {
  keyword: string;
  text: string;
  label: string;
}

export interface ParsedPlaywrightStep {
  label: string;
  range: vscode.Range;
}

interface NavigateCommandArgs {
  label: string;
  sourceUri: string;
  direction: 'playwright' | 'feature';
}

let playwrightStepIndex: StepIndexEntry[] = [];
let featureStepIndex: StepIndexEntry[] = [];
let rebuildTimer: NodeJS.Timeout | undefined;
let indexReady: Promise<void> | undefined;
let fileWatchers: vscode.FileSystemWatcher[] = [];

export function activate(context: vscode.ExtensionContext): void {
  const featureDefinitionProvider = vscode.languages.registerDefinitionProvider(
    { scheme: 'file', language: 'feature', pattern: '**/*.feature' },
    {
      async provideDefinition(document, position) {
        if (!isFeatureUri(document.uri)) {
          return undefined;
        }

        await ensureIndexReady();

        const parsedStep = parseFeatureStepLine(document.lineAt(position.line).text, getNavigatorConfig());

        if (!parsedStep) {
          return undefined;
        }

        const locations = findMatchingPlaywrightSteps(parsedStep.label, getNavigatorConfig())
          .filter((match) => !isSameUri(match.uri, document.uri))
          .map(toLocation);

        return locations.length > 0 ? locations : null;
      }
    }
  );

  const playwrightDefinitionProvider = vscode.languages.registerDefinitionProvider(
    [
      { scheme: 'file', pattern: '**/*.spec.ts' },
      { scheme: 'file', pattern: '**/*.test.ts' },
      { scheme: 'file', pattern: '**/*.spec.js' },
      { scheme: 'file', pattern: '**/*.test.js' }
    ],
    {
      async provideDefinition(document, position) {
        await ensureIndexReady();

        if (!isPlaywrightSpecUri(document.uri)) {
          return undefined;
        }

        const parsedStep = parsePlaywrightStepAtPosition(document.getText(), document.offsetAt(position), document);

        if (!parsedStep) {
          return undefined;
        }

        const locations = findMatchingFeatureSteps(parsedStep.label, getNavigatorConfig())
          .filter((match) => !isSameUri(match.uri, document.uri))
          .map(toLocation);

        return locations.length > 0 ? locations : null;
      }
    }
  );

  const featureDocumentLinkProvider = vscode.languages.registerDocumentLinkProvider(
    { scheme: 'file', language: 'feature', pattern: '**/*.feature' },
    {
      provideDocumentLinks(document) {
        if (!isFeatureUri(document.uri)) {
          return [];
        }

        return createFeatureStepDocumentLinks(document, getNavigatorConfig());
      }
    }
  );

  const playwrightDocumentLinkProvider = vscode.languages.registerDocumentLinkProvider(
    [
      { scheme: 'file', pattern: '**/*.spec.ts' },
      { scheme: 'file', pattern: '**/*.test.ts' },
      { scheme: 'file', pattern: '**/*.spec.js' },
      { scheme: 'file', pattern: '**/*.test.js' }
    ],
    {
      provideDocumentLinks(document) {
        if (!isPlaywrightSpecUri(document.uri)) {
          return [];
        }

        return createPlaywrightStepDocumentLinks(document);
      }
    }
  );

  const navigateCommand = vscode.commands.registerCommand(
    'playwrightGherkinStepNavigator.goToMatch',
    async (args: NavigateCommandArgs) => navigateToMatch(args)
  );

  context.subscriptions.push(
    featureDefinitionProvider,
    playwrightDefinitionProvider,
    featureDocumentLinkProvider,
    playwrightDocumentLinkProvider,
    navigateCommand
  );
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration(CONFIG_SECTION)) {
      disposeWatchers();
      registerFileWatchers(context);
      void rebuildIndex();
    }
  }));

  registerFileWatchers(context);
  indexReady = buildIndex();
}

export function deactivate(): void {
  disposeWatchers();
}

export async function buildIndex(): Promise<void> {
  const config = getNavigatorConfig();

  const [playwrightEntries, featureEntries] = await Promise.all([
    collectPlaywrightIndexEntries(config),
    collectFeatureIndexEntries(config)
  ]);

  playwrightStepIndex = playwrightEntries;
  featureStepIndex = featureEntries;
}

export async function rebuildIndex(): Promise<void> {
  indexReady = buildIndex();
  await indexReady;
}

async function ensureIndexReady(): Promise<void> {
  if (!indexReady) {
    indexReady = buildIndex();
  }

  await indexReady;
}

export function findMatchingSteps(label: string, config = getNavigatorConfig()): StepIndexEntry[] {
  return findMatchingPlaywrightSteps(label, config);
}

export function findMatchingPlaywrightSteps(label: string, config = getNavigatorConfig()): StepIndexEntry[] {
  const normalised = normaliseStepLabel(label, config.includeKeywordInMatch);

  return playwrightStepIndex.filter((entry) => entry.normalised === normalised && isPlaywrightSpecUri(entry.uri));
}

export function findMatchingFeatureSteps(label: string, config = getNavigatorConfig()): StepIndexEntry[] {
  const normalised = normaliseStepLabel(label, config.includeKeywordInMatch);

  return featureStepIndex.filter((entry) => entry.normalised === normalised && isFeatureUri(entry.uri));
}

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
  const label = config.includeKeywordInMatch ? keyword + ' ' + text : text;

  return { keyword, text, label };
}

export function normaliseStepLabel(label: string, includeKeywordInMatch = true): string {
  let normalised = label
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .trim()
    .replace(/\s+/g, ' ');

  if (!includeKeywordInMatch) {
    normalised = stripLeadingStepKeyword(normalised);
  }

  return normalised.toLocaleLowerCase();
}

export function extractPlaywrightSteps(source: string, uri: vscode.Uri, config: NavigatorConfig): StepIndexEntry[] {
  const entries: StepIndexEntry[] = [];
  const lineStarts = getLineStarts(source);

  TEST_STEP_PATTERN.lastIndex = 0;

  for (const match of source.matchAll(TEST_STEP_PATTERN)) {
    const rawLabel = unescapeJavaScriptString(match[2]);
    const startOffset = match.index ?? 0;
    const endOffset = startOffset + match[0].length;

    entries.push({
      label: rawLabel,
      normalised: normaliseStepLabel(rawLabel, config.includeKeywordInMatch),
      uri,
      range: new vscode.Range(positionAtOffset(lineStarts, startOffset), positionAtOffset(lineStarts, endOffset))
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

    const firstNonWhitespace = line.search(/\S/);
    const startCharacter = firstNonWhitespace < 0 ? 0 : firstNonWhitespace;
    const range = new vscode.Range(
      new vscode.Position(lineNumber, startCharacter),
      new vscode.Position(lineNumber, line.length)
    );

    entries.push({
      label: parsedStep.label,
      normalised: normaliseStepLabel(parsedStep.label, config.includeKeywordInMatch),
      uri,
      range
    });
  }

  return entries;
}

export function parsePlaywrightStepAtPosition(source: string, offset: number, document: Pick<vscode.TextDocument, 'positionAt'>): ParsedPlaywrightStep | undefined {
  TEST_STEP_PATTERN.lastIndex = 0;

  for (const match of source.matchAll(TEST_STEP_PATTERN)) {
    const startOffset = match.index ?? 0;
    const quoteOffsetInMatch = match[0].indexOf(match[1]);

    if (quoteOffsetInMatch < 0) {
      continue;
    }

    const labelStartOffset = startOffset + quoteOffsetInMatch + 1;
    const labelEndOffset = labelStartOffset + match[2].length;

    if (offset < labelStartOffset || offset > labelEndOffset) {
      continue;
    }

    return {
      label: unescapeJavaScriptString(match[2]),
      range: new vscode.Range(document.positionAt(labelStartOffset), document.positionAt(labelEndOffset))
    };
  }

  return undefined;
}

async function collectPlaywrightIndexEntries(config: NavigatorConfig): Promise<StepIndexEntry[]> {
  return collectIndexEntries(config.specFileGlobs, config, extractPlaywrightSteps, isPlaywrightSpecUri);
}

async function collectFeatureIndexEntries(config: NavigatorConfig): Promise<StepIndexEntry[]> {
  return collectIndexEntries(config.featureFileGlobs, config, extractFeatureSteps, isFeatureUri);
}

async function collectIndexEntries(
  includeGlobs: string[],
  config: NavigatorConfig,
  extractor: (source: string, uri: vscode.Uri, config: NavigatorConfig) => StepIndexEntry[],
  uriFilter: (uri: vscode.Uri) => boolean
): Promise<StepIndexEntry[]> {
  const urisByPath = new Map<string, vscode.Uri>();
  const excludePattern = toBraceGlob(config.excludeGlobs);

  for (const includeGlob of includeGlobs) {
    const uris = await vscode.workspace.findFiles(includeGlob, excludePattern);

    for (const uri of uris) {
      if (uriFilter(uri)) {
        urisByPath.set(uri.toString(), uri);
      }
    }
  }

  const entries: StepIndexEntry[] = [];

  await Promise.all(Array.from(urisByPath.values()).map(async (uri) => {
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      entries.push(...extractor(document.getText(), uri, config));
    } catch (error) {
      console.warn('Unable to index steps from ' + uri.toString(), error);
    }
  }));

  return entries;
}

function getNavigatorConfig(): NavigatorConfig {
  const configuration = vscode.workspace.getConfiguration(CONFIG_SECTION);

  return {
    specFileGlobs: configuration.get<string[]>('specFileGlobs', ['**/*.spec.ts', '**/*.test.ts', '**/*.spec.js', '**/*.test.js']),
    featureFileGlobs: configuration.get<string[]>('featureFileGlobs', ['**/*.feature']),
    excludeGlobs: configuration.get<string[]>('excludeGlobs', ['**/node_modules/**', '**/dist/**', '**/out/**', '**/playwright-report/**', '**/test-results/**']),
    includeKeywordInMatch: configuration.get<boolean>('includeKeywordInMatch', true)
  };
}

function registerFileWatchers(context: vscode.ExtensionContext): void {
  const config = getNavigatorConfig();
  const watchedGlobs = [...config.specFileGlobs, ...config.featureFileGlobs];

  for (const watchedGlob of watchedGlobs) {
    const watcher = vscode.workspace.createFileSystemWatcher(watchedGlob);
    const schedule = (uri: vscode.Uri) => {
      if (!isExcluded(uri, config.excludeGlobs)) {
        scheduleIndexRebuild();
      }
    };

    watcher.onDidCreate(schedule, undefined, context.subscriptions);
    watcher.onDidChange(schedule, undefined, context.subscriptions);
    watcher.onDidDelete(schedule, undefined, context.subscriptions);
    context.subscriptions.push(watcher);
    fileWatchers.push(watcher);
  }
}

function scheduleIndexRebuild(): void {
  if (rebuildTimer) {
    clearTimeout(rebuildTimer);
  }

  rebuildTimer = setTimeout(() => {
    indexReady = rebuildIndex();
  }, 250);
}

function disposeWatchers(): void {
  for (const watcher of fileWatchers) {
    watcher.dispose();
  }

  fileWatchers = [];
}

function toLocation(entry: StepIndexEntry): vscode.Location {
  return new vscode.Location(entry.uri, entry.range);
}

function createFeatureStepDocumentLinks(document: vscode.TextDocument, config: NavigatorConfig): vscode.DocumentLink[] {
  const links: vscode.DocumentLink[] = [];

  for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber += 1) {
    const line = document.lineAt(lineNumber);
    const parsedStep = parseFeatureStepLine(line.text, config);

    if (!parsedStep) {
      continue;
    }

    const firstNonWhitespace = line.text.search(/\S/);
    const startCharacter = firstNonWhitespace < 0 ? 0 : firstNonWhitespace;
    const range = new vscode.Range(
      new vscode.Position(lineNumber, startCharacter),
      new vscode.Position(lineNumber, line.text.length)
    );

    links.push(new vscode.DocumentLink(range, createNavigateCommandUri({
      label: parsedStep.label,
      sourceUri: document.uri.toString(),
      direction: 'playwright'
    })));
  }

  return links;
}

function createPlaywrightStepDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
  const links: vscode.DocumentLink[] = [];
  const source = document.getText();

  TEST_STEP_PATTERN.lastIndex = 0;

  for (const match of source.matchAll(TEST_STEP_PATTERN)) {
    const startOffset = match.index ?? 0;
    const quoteOffsetInMatch = match[0].indexOf(match[1]);

    if (quoteOffsetInMatch < 0) {
      continue;
    }

    const labelStartOffset = startOffset + quoteOffsetInMatch + 1;
    const labelEndOffset = labelStartOffset + match[2].length;
    const range = new vscode.Range(
      document.positionAt(labelStartOffset),
      document.positionAt(labelEndOffset)
    );

    links.push(new vscode.DocumentLink(range, createNavigateCommandUri({
      label: unescapeJavaScriptString(match[2]),
      sourceUri: document.uri.toString(),
      direction: 'feature'
    })));
  }

  return links;
}

function createNavigateCommandUri(args: NavigateCommandArgs): vscode.Uri {
  return vscode.Uri.parse(
    'command:playwrightGherkinStepNavigator.goToMatch?' + encodeURIComponent(JSON.stringify([args]))
  );
}

async function navigateToMatch(args: NavigateCommandArgs): Promise<void> {
  await ensureIndexReady();

  const sourceUri = vscode.Uri.parse(args.sourceUri);
  const matches = (args.direction === 'playwright'
    ? findMatchingPlaywrightSteps(args.label, getNavigatorConfig())
    : findMatchingFeatureSteps(args.label, getNavigatorConfig()))
    .filter((match) => !isSameUri(match.uri, sourceUri));

  if (matches.length === 0) {
    void vscode.window.showInformationMessage('No matching Playwright Gherkin step found.');
    return;
  }

  const selected = matches.length === 1 ? matches[0] : await pickMatch(matches);

  if (!selected) {
    return;
  }

  await openMatch(selected);
}

async function pickMatch(matches: StepIndexEntry[]): Promise<StepIndexEntry | undefined> {
  const items = matches.map((match) => ({
    label: vscode.workspace.asRelativePath(match.uri),
    description: match.label,
    detail: 'Line ' + (match.range.start.line + 1),
    match
  }));
  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select matching step'
  });

  return selected?.match;
}

async function openMatch(match: StepIndexEntry): Promise<void> {
  const document = await vscode.workspace.openTextDocument(match.uri);
  const editor = await vscode.window.showTextDocument(document);

  editor.selection = new vscode.Selection(match.range.start, match.range.start);
  editor.revealRange(match.range, vscode.TextEditorRevealType.InCenter);
}

function isFeatureUri(uri: vscode.Uri): boolean {
  return normaliseFsPath(uri).endsWith('.feature');
}

function isPlaywrightSpecUri(uri: vscode.Uri): boolean {
  return /\.(spec|test)\.[jt]s$/i.test(normaliseFsPath(uri));
}

function normaliseFsPath(uri: vscode.Uri): string {
  return uri.fsPath.replace(/\\/g, '/').toLocaleLowerCase();
}

function isSameUri(left: vscode.Uri, right: vscode.Uri): boolean {
  return normaliseFsPath(left) === normaliseFsPath(right);
}

function toBraceGlob(globs: string[]): string {
  return globs.length === 0 ? '' : '{' + globs.join(',') + '}';
}

function isExcluded(uri: vscode.Uri, excludeGlobs: string[]): boolean {
  const relativePath = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/');

  return excludeGlobs.some((glob) => {
    const ignoredDirectory = glob.match(/\*\*\/([^/*]+)\/\*\*/)?.[1];

    return Boolean(ignoredDirectory && relativePath.split('/').includes(ignoredDirectory));
  });
}

function stripLeadingStepKeyword(label: string): string {
  const keywordPattern = STEP_KEYWORDS.map(escapeRegExp).join('|');

  return label.replace(new RegExp('^(' + keywordPattern + ')\\s+', 'i'), '');
}

function unescapeJavaScriptString(value: string): string {
  return value
    .replace(/\\\x60/g, String.fromCharCode(96))
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
}

function getLineStarts(source: string): number[] {
  const lineStarts = [0];

  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) {
      lineStarts.push(index + 1);
    }
  }

  return lineStarts;
}

function positionAtOffset(lineStarts: number[], offset: number): vscode.Position {
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
}
