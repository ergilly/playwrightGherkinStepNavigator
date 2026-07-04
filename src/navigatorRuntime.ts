import * as vscode from 'vscode';
import { CONFIG_SECTION, TEST_STEP_PATTERN } from './constants';
import { getNavigatorConfig } from './config';
import { extractFeatureDescriptions, extractFeatureSteps, extractPlaywrightDescriptions, extractPlaywrightSteps } from './extractors';
import { getFeatureStepTextStartCharacter, parseFeatureScenarioLine, parseFeatureStepLine, parseFeatureTagAtPosition, parseFeatureTags } from './parsers/feature';
import { parsePlaywrightDescriptionAtPosition, parsePlaywrightStepAtPosition } from './parsers/playwright';
import { createFuzzyExactMatchSuggestions } from './quickFixes';
import { StepIndex } from './stepIndex';
import { DescriptionIndexEntry, NavigateCommandArgs, NavigateDirection, NavigatorConfig, StepIndexEntry } from './types';
import { escapeJavaScriptSingleQuotedString, getStepTextStartOffset, normaliseStepLabel, unescapeJavaScriptString } from './utils/text';
import { isExcluded, isFeatureUri, isPlaywrightImplementationUri, isSameUri } from './utils/uri';

export class NavigatorRuntime {
  private readonly index = new StepIndex();
  private readonly diagnosticCollection = vscode.languages.createDiagnosticCollection('playwright-gherkin-step-navigator');
  private readonly codeLensRefreshEmitter = new vscode.EventEmitter<void>();
  private readonly stepCatalogueRefreshEmitter = new vscode.EventEmitter<void>();
  private readonly outputChannel = vscode.window.createOutputChannel('Playwright Gherkin Step Navigator');
  private fileWatchers: vscode.FileSystemWatcher[] = [];
  private rebuildTimer: NodeJS.Timeout | undefined;
  private indexReady: Promise<void> | undefined;

  activate(context: vscode.ExtensionContext): void {
    const featureDefinitionProvider = vscode.languages.registerDefinitionProvider(
      { scheme: 'file', language: 'feature', pattern: '**/*.feature' },
      {
        provideDefinition: async (document, position) => this.provideFeatureDefinition(document, position)
      }
    );

    const playwrightDocumentSelector = [
      { scheme: 'file', pattern: '**/*.ts' },
      { scheme: 'file', pattern: '**/*.js' }
    ];

    const playwrightDefinitionProvider = vscode.languages.registerDefinitionProvider(
      playwrightDocumentSelector,
      {
        provideDefinition: async (document, position) => this.providePlaywrightDefinition(document, position)
      }
    );

    const featureDocumentLinkProvider = vscode.languages.registerDocumentLinkProvider(
      { scheme: 'file', language: 'feature', pattern: '**/*.feature' },
      {
        provideDocumentLinks: (document) => isFeatureUri(document.uri)
          ? this.createFeatureDocumentLinks(document, getNavigatorConfig())
          : []
      }
    );

    const playwrightDocumentLinkProvider = vscode.languages.registerDocumentLinkProvider(
      playwrightDocumentSelector,
      {
        provideDocumentLinks: (document) => isPlaywrightImplementationUri(document.uri)
          ? this.createPlaywrightDocumentLinks(document)
          : []
      }
    );

    const codeLensProvider = this.createStepCodeLensProvider();
    const featureCodeLensProvider = vscode.languages.registerCodeLensProvider(
      { scheme: 'file', language: 'feature', pattern: '**/*.feature' },
      codeLensProvider
    );
    const playwrightCodeLensProvider = vscode.languages.registerCodeLensProvider(
      playwrightDocumentSelector,
      codeLensProvider
    );

    const stepCatalogueView = vscode.window.createTreeView('playwrightGherkinStepNavigator.stepCatalogue', {
      treeDataProvider: this.createStepCatalogueProvider()
    });

    context.subscriptions.push(
      featureDefinitionProvider,
      playwrightDefinitionProvider,
      featureDocumentLinkProvider,
      playwrightDocumentLinkProvider,
      featureCodeLensProvider,
      playwrightCodeLensProvider,
      vscode.commands.registerCommand('playwrightGherkinStepNavigator.goToMatch', async (args: NavigateCommandArgs) => this.navigateToMatch(args)),
      vscode.commands.registerCommand('playwrightGherkinStepNavigator.goToPlaywrightStep', async () => this.navigateFromActiveEditor('playwright')),
      vscode.commands.registerCommand('playwrightGherkinStepNavigator.goToFeatureStep', async () => this.navigateFromActiveEditor('feature')),
      vscode.commands.registerCommand('playwrightGherkinStepNavigator.showStepCatalogue', async () => this.showStepCatalogueQuickPick()),
      vscode.commands.registerCommand('playwrightGherkinStepNavigator.showOutput', () => this.outputChannel.show()),
      vscode.commands.registerCommand('playwrightGherkinStepNavigator.createStepImplementation', async (uri?: vscode.Uri, range?: vscode.Range) => this.createStepImplementationFromFeatureLine(uri, range)),
      vscode.languages.registerCodeActionsProvider(
        { scheme: 'file', language: 'feature', pattern: '**/*.feature' },
        this.createFeatureStepCodeActionProvider(),
        { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
      ),
      this.codeLensRefreshEmitter,
      this.stepCatalogueRefreshEmitter,
      this.outputChannel,
      stepCatalogueView,
      this.diagnosticCollection
    );

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(CONFIG_SECTION)) {
        this.disposeWatchers();
        this.registerFileWatchers(context);
        void this.rebuildIndex();
      }
    }));

    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((document) => {
      if (isFeatureUri(document.uri)) {
        void this.refreshFeatureDiagnostics(document);
      }
    }));

    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
      if (isFeatureUri(event.document.uri)) {
        void this.refreshFeatureDiagnostics(event.document);
        this.codeLensRefreshEmitter.fire();
        return;
      }

      if (isPlaywrightImplementationUri(event.document.uri)) {
        this.codeLensRefreshEmitter.fire();
      }
    }));

    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((document) => {
      if (isFeatureUri(document.uri)) {
        this.diagnosticCollection.delete(document.uri);
      }
    }));

    this.registerFileWatchers(context);
    this.indexReady = this.buildIndex();
    void this.indexReady.then(() => this.refreshAllFeatureDiagnostics());
  }

  deactivate(): void {
    this.disposeWatchers();
    this.diagnosticCollection.dispose();
    this.codeLensRefreshEmitter.dispose();
    this.stepCatalogueRefreshEmitter.dispose();
    this.outputChannel.dispose();
  }

  async buildIndex(): Promise<void> {
    await this.index.build(getNavigatorConfig(), (message) => this.logDebug(message));
    this.codeLensRefreshEmitter.fire();
    this.stepCatalogueRefreshEmitter.fire();
  }

  async rebuildIndex(): Promise<void> {
    this.indexReady = this.buildIndex();
    await this.indexReady;
    await this.refreshAllFeatureDiagnostics();
  }

  private async ensureIndexReady(): Promise<void> {
    if (!this.indexReady) {
      this.indexReady = this.buildIndex();
    }

    await this.indexReady;
  }

  private async provideFeatureDefinition(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Definition | undefined | null> {
    if (!isFeatureUri(document.uri)) {
      return undefined;
    }

    await this.ensureIndexReady();

    const lineText = document.lineAt(position.line).text;
    const parsedScenario = parseFeatureScenarioLine(lineText);

    if (parsedScenario) {
      const locations = this.index.findMatchingPlaywrightDescriptions(parsedScenario, getNavigatorConfig())
        .filter((match) => !isSameUri(match.uri, document.uri))
        .map(toDescriptionLocation);

      return locations.length > 0 ? locations : null;
    }

    const parsedTag = parseFeatureTagAtPosition(lineText, position.character);

    if (parsedTag) {
      const locations = this.index.findMatchingPlaywrightTags(parsedTag)
        .filter((match) => !isSameUri(match.uri, document.uri))
        .map(toDescriptionLocation);

      return locations.length > 0 ? locations : null;
    }

    const parsedStep = parseFeatureStepLine(lineText, getNavigatorConfig());

    if (!parsedStep) {
      return undefined;
    }

    const locations = this.index.findMatchingPlaywrightSteps(parsedStep.label, getNavigatorConfig())
      .filter((match) => !isSameUri(match.uri, document.uri))
      .map(toLocation);

    return locations.length > 0 ? locations : null;
  }

  private async providePlaywrightDefinition(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Definition | undefined | null> {
    await this.ensureIndexReady();

    if (!isPlaywrightImplementationUri(document.uri)) {
      return undefined;
    }

    const parsedDescription = parsePlaywrightDescriptionAtPosition(document.getText(), document.offsetAt(position), document, getNavigatorConfig());

    if (parsedDescription) {
      const locations = this.index.featureDescriptions
        .filter((match) => match.normalised === normaliseStepLabel(parsedDescription.label, true))
        .filter((match) => !isSameUri(match.uri, document.uri))
        .map(toDescriptionLocation);

      return locations.length > 0 ? locations : null;
    }

    const parsedStep = parsePlaywrightStepAtPosition(document.getText(), document.offsetAt(position), document);

    if (!parsedStep) {
      return undefined;
    }

    const locations = this.index.findMatchingFeatureSteps(parsedStep.label, getNavigatorConfig())
      .filter((match) => !isSameUri(match.uri, document.uri))
      .map(toLocation);

    return locations.length > 0 ? locations : null;
  }

  private async navigateToMatch(args: NavigateCommandArgs): Promise<void> {
    await this.ensureIndexReady();

    const sourceUri = vscode.Uri.parse(args.sourceUri);
    const config = getNavigatorConfig();
    const stepMatches = (args.direction === 'playwright'
      ? this.index.findMatchingPlaywrightSteps(args.label, config)
      : this.index.findMatchingFeatureSteps(args.label, config))
      .filter((match) => !isSameUri(match.uri, sourceUri));

    if (stepMatches.length > 0) {
      const selected = stepMatches.length === 1 ? stepMatches[0] : await this.pickStepMatch(stepMatches);

      if (selected) {
        await openStepMatch(selected);
      }

      return;
    }

    const descriptionMatches = args.direction === 'playwright'
      ? [...this.index.findMatchingPlaywrightDescriptions(args.label, config), ...this.index.findMatchingPlaywrightTags(args.label)]
        .filter((match) => !isSameUri(match.uri, sourceUri))
      : this.index.featureDescriptions
        .filter((match) => match.normalised === normaliseStepLabel(args.label, true) && !isSameUri(match.uri, sourceUri));

    if (descriptionMatches.length === 0) {
      void vscode.window.showInformationMessage('No matching Playwright Gherkin step found.');
      return;
    }

    const selected = descriptionMatches.length === 1 ? descriptionMatches[0] : await this.pickDescriptionMatch(descriptionMatches);

    if (selected) {
      await openDescriptionMatch(selected);
    }
  }

  private async navigateFromActiveEditor(direction: NavigateDirection): Promise<void> {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      void vscode.window.showInformationMessage('Open a feature or Playwright file to navigate.');
      return;
    }

    const document = editor.document;
    const position = editor.selection.active;
    const lineText = document.lineAt(position.line).text;
    let label: string | undefined;

    if (direction === 'playwright') {
      label = parseFeatureTagAtPosition(lineText, position.character)
        ?? parseFeatureScenarioLine(lineText)
        ?? parseFeatureStepLine(lineText, getNavigatorConfig())?.label;
    } else {
      label = parsePlaywrightDescriptionAtPosition(document.getText(), document.offsetAt(position), document, getNavigatorConfig())?.label
        ?? parsePlaywrightStepAtPosition(document.getText(), document.offsetAt(position), document)?.label;
    }

    if (!label) {
      void vscode.window.showInformationMessage('No navigable Playwright Gherkin label found at the cursor.');
      return;
    }

    await this.navigateToMatch({
      label,
      sourceUri: document.uri.toString(),
      direction
    });
  }

  private createFeatureDocumentLinks(document: vscode.TextDocument, config: NavigatorConfig): vscode.DocumentLink[] {
    const links: vscode.DocumentLink[] = [];

    for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber += 1) {
      const line = document.lineAt(lineNumber);
      const parsedScenario = parseFeatureScenarioLine(line.text);

      if (parsedScenario) {
        const startCharacter = line.text.indexOf(parsedScenario);
        links.push(new vscode.DocumentLink(
          new vscode.Range(
            new vscode.Position(lineNumber, startCharacter),
            new vscode.Position(lineNumber, startCharacter + parsedScenario.length)
          ),
          createNavigateCommandUri({
            label: parsedScenario,
            sourceUri: document.uri.toString(),
            direction: 'playwright'
          })
        ));
        continue;
      }

      for (const tag of parseFeatureTags(line.text)) {
        links.push(new vscode.DocumentLink(
          new vscode.Range(
            new vscode.Position(lineNumber, tag.start),
            new vscode.Position(lineNumber, tag.end)
          ),
          createNavigateCommandUri({
            label: tag.label,
            sourceUri: document.uri.toString(),
            direction: 'playwright'
          })
        ));
      }

      const parsedStep = parseFeatureStepLine(line.text, config);

      if (!parsedStep) {
        continue;
      }

      const startCharacter = getFeatureStepTextStartCharacter(line.text, parsedStep);
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

  private createPlaywrightDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    const links: vscode.DocumentLink[] = [];
    const source = document.getText();
    const config = getNavigatorConfig();

    for (const entry of extractPlaywrightDescriptions(source, document.uri, config)) {
      links.push(new vscode.DocumentLink(entry.range, createNavigateCommandUri({
        label: entry.label,
        sourceUri: document.uri.toString(),
        direction: 'feature'
      })));
    }

    TEST_STEP_PATTERN.lastIndex = 0;
    for (const match of source.matchAll(TEST_STEP_PATTERN)) {
      const startOffset = match.index ?? 0;
      const quoteOffsetInMatch = match[0].indexOf(match[1]);

      if (quoteOffsetInMatch < 0) {
        continue;
      }

      const rawLabel = unescapeJavaScriptString(match[2]);
      const labelStartOffset = startOffset + quoteOffsetInMatch + 1 + getStepTextStartOffset(rawLabel);
      const labelEndOffset = startOffset + quoteOffsetInMatch + 1 + match[2].length;
      const range = new vscode.Range(
        document.positionAt(labelStartOffset),
        document.positionAt(labelEndOffset)
      );

      links.push(new vscode.DocumentLink(range, createNavigateCommandUri({
        label: rawLabel,
        sourceUri: document.uri.toString(),
        direction: 'feature'
      })));
    }

    return links;
  }

  private createStepCodeLensProvider(): vscode.CodeLensProvider {
    return {
      onDidChangeCodeLenses: this.codeLensRefreshEmitter.event,
      provideCodeLenses: (document) => {
        const config = getNavigatorConfig();

        if (!config.enableCodeLens) {
          return [];
        }

        if (isFeatureUri(document.uri)) {
          const stepCodeLenses = extractFeatureSteps(document.getText(), document.uri, config).map((step) => {
            const count = this.index.findMatchingPlaywrightSteps(step.label, config).length;
            return createMatchCountCodeLens(step, count, 'playwright');
          });
          const descriptionCodeLenses = extractFeatureDescriptions(document.getText(), document.uri, config).map((description) => {
            const count = description.kind === 'tag'
              ? this.index.findMatchingPlaywrightTags(description.label).length
              : this.index.findMatchingPlaywrightDescriptions(description.label, config).length;

            return createDescriptionMatchCountCodeLens(description, count, 'playwright');
          });

          return [...descriptionCodeLenses, ...stepCodeLenses];
        }

        if (isPlaywrightImplementationUri(document.uri)) {
          const stepCodeLenses = extractPlaywrightSteps(document.getText(), document.uri, config).map((step) => {
            const count = this.index.findMatchingFeatureSteps(step.label, config).length;
            return createMatchCountCodeLens(step, count, 'feature');
          });
          const descriptionCodeLenses = extractPlaywrightDescriptions(document.getText(), document.uri, config).map((description) => {
            const count = this.countMatchingFeatureDescriptions(description);

            return createDescriptionMatchCountCodeLens(description, count, 'feature');
          });

          return [...descriptionCodeLenses, ...stepCodeLenses];
        }

        return [];
      }
    };
  }

  private createStepCatalogueProvider(): vscode.TreeDataProvider<StepIndexEntry> {
    return {
      onDidChangeTreeData: this.stepCatalogueRefreshEmitter.event,
      getTreeItem: (entry) => {
        const item = new vscode.TreeItem(entry.label, vscode.TreeItemCollapsibleState.None);
        item.description = entry.source === 'playwright' ? 'Playwright' : 'Feature';
        item.tooltip = vscode.workspace.asRelativePath(entry.uri) + ':' + (entry.range.start.line + 1);
        item.command = {
          command: 'playwrightGherkinStepNavigator.goToMatch',
          title: 'Go to step',
          arguments: [{
            label: entry.label,
            sourceUri: entry.uri.toString(),
            direction: entry.source === 'playwright' ? 'feature' : 'playwright'
          } satisfies NavigateCommandArgs]
        };
        return item;
      },
      getChildren: () => Promise.resolve([...this.index.playwrightSteps, ...this.index.featureSteps]
        .sort((left, right) => left.label.localeCompare(right.label)))
    };
  }

  private countMatchingFeatureDescriptions(description: DescriptionIndexEntry): number {
    const normalised = normaliseStepLabel(description.label, true);

    return this.index.featureDescriptions.filter((entry) => {
      if (description.kind === 'tag') {
        return entry.kind === 'tag' && entry.normalised === normalised;
      }

      return entry.kind === 'scenario' && entry.normalised === normalised;
    }).length;
  }

  private createFeatureStepCodeActionProvider(): vscode.CodeActionProvider {
    return {
      provideCodeActions: (document, range, context) => {
        const actions = context.diagnostics
          .filter((diagnostic) => diagnostic.code === 'undefined-playwright-step')
          .map((diagnostic) => {
            const action = new vscode.CodeAction('Create matching test.step() snippet', vscode.CodeActionKind.QuickFix);
            action.command = {
              command: 'playwrightGherkinStepNavigator.createStepImplementation',
              title: 'Create matching test.step() snippet',
              arguments: [document.uri, diagnostic.range]
            };
            action.diagnostics = [diagnostic];
            action.isPreferred = true;
            return action;
          });

        const fuzzyAction = this.createFuzzyExactMatchCodeAction(document, range);

        if (fuzzyAction) {
          const fuzzyDiagnostic = context.diagnostics.find((diagnostic) => diagnostic.code === 'fuzzy-playwright-step');
          fuzzyAction.diagnostics = fuzzyDiagnostic ? [fuzzyDiagnostic] : undefined;
          actions.unshift(fuzzyAction);
        }

        return actions;
      }
    };
  }

  private createFuzzyExactMatchCodeAction(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction | undefined {
    const line = document.lineAt(range.start.line);
    const parsedStep = parseFeatureStepLine(line.text, getNavigatorConfig());

    if (!parsedStep) {
      return undefined;
    }

    const matches = this.index.findMatchingPlaywrightStepResults(parsedStep.label, getNavigatorConfig());
    const suggestion = createFuzzyExactMatchSuggestions(parsedStep.label, matches, 1)[0];

    if (!suggestion) {
      return undefined;
    }

    const startCharacter = getFeatureStepTextStartCharacter(line.text, parsedStep);
    const replacementRange = new vscode.Range(
      new vscode.Position(range.start.line, startCharacter),
      new vscode.Position(range.start.line, line.text.length)
    );
    const action = new vscode.CodeAction(
      'Update wording to exact match "' + suggestion.replacementText + '"',
      vscode.CodeActionKind.QuickFix
    );
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, replacementRange, suggestion.replacementText);
    action.edit = edit;
    action.isPreferred = true;

    return action;
  }

  private async refreshFeatureDiagnostics(document: vscode.TextDocument): Promise<void> {
    await this.ensureIndexReady();
    this.updateFeatureDiagnostics(document);
  }

  private async refreshAllFeatureDiagnostics(): Promise<void> {
    const config = getNavigatorConfig();

    if (!config.enableDiagnostics) {
      this.diagnosticCollection.clear();
      return;
    }

    for (const document of vscode.workspace.textDocuments) {
      if (isFeatureUri(document.uri)) {
        this.updateFeatureDiagnostics(document, config);
      }
    }
  }

  private updateFeatureDiagnostics(document: vscode.TextDocument, config = getNavigatorConfig()): void {
    if (!isFeatureUri(document.uri)) {
      return;
    }

    if (!config.enableDiagnostics) {
      this.diagnosticCollection.delete(document.uri);
      return;
    }

    const diagnostics = extractFeatureSteps(document.getText(), document.uri, config)
      .flatMap((step) => {
        const matches = this.index.findMatchingPlaywrightStepResults(step.label, config);

        if (matches.length === 0) {
          const diagnostic = new vscode.Diagnostic(
            step.range,
            'No matching Playwright test.step() implementation found.',
            vscode.DiagnosticSeverity.Warning
          );

          diagnostic.source = 'Playwright Gherkin Step Navigator';
          diagnostic.code = 'undefined-playwright-step';

          return [diagnostic];
        }

        const fuzzyMatch = matches.find((match) => match.kind === 'fuzzy');

        if (!fuzzyMatch) {
          return [];
        }

        const diagnostic = new vscode.Diagnostic(
          step.range,
          'Fuzzy Playwright step match found. Quick fix can update this wording to the exact match.',
          vscode.DiagnosticSeverity.Hint
        );

        diagnostic.source = 'Playwright Gherkin Step Navigator';
        diagnostic.code = 'fuzzy-playwright-step';

        return [diagnostic];
      });

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  private async showStepCatalogueQuickPick(): Promise<void> {
    await this.ensureIndexReady();

    const items = [...this.index.playwrightSteps, ...this.index.featureSteps].map((entry) => ({
      label: entry.label,
      description: entry.source === 'playwright' ? 'Playwright' : 'Feature',
      detail: vscode.workspace.asRelativePath(entry.uri) + ':' + (entry.range.start.line + 1),
      entry
    }));

    const selected = await vscode.window.showQuickPick(items, {
      matchOnDescription: true,
      matchOnDetail: true,
      placeHolder: 'Search indexed feature and Playwright steps'
    });

    if (selected) {
      await openStepMatch(selected.entry);
    }
  }

  private async createStepImplementationFromFeatureLine(uri?: vscode.Uri, range?: vscode.Range): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const document = uri ? await vscode.workspace.openTextDocument(uri) : editor?.document;
    const line = range?.start.line ?? editor?.selection.active.line;

    if (!document || line === undefined) {
      void vscode.window.showInformationMessage('Open a feature step to create a Playwright step snippet.');
      return;
    }

    const parsedStep = parseFeatureStepLine(document.lineAt(line).text, getNavigatorConfig());

    if (!parsedStep) {
      void vscode.window.showInformationMessage('No Gherkin step found at the selected line.');
      return;
    }

    const snippet = "await test.step('" + escapeJavaScriptSingleQuotedString(parsedStep.label) + "', async () => {\n  \n});";
    await vscode.env.clipboard.writeText(snippet);
    void vscode.window.showInformationMessage('Copied Playwright test.step() snippet for "' + parsedStep.label + '".');
  }

  private async pickStepMatch(matches: StepIndexEntry[]): Promise<StepIndexEntry | undefined> {
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

  private async pickDescriptionMatch(matches: DescriptionIndexEntry[]): Promise<DescriptionIndexEntry | undefined> {
    const items = matches.map((match) => ({
      label: vscode.workspace.asRelativePath(match.uri),
      description: match.label,
      detail: match.kind + ' at line ' + (match.range.start.line + 1),
      match
    }));
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select matching scenario, test, describe, or tag'
    });

    return selected?.match;
  }

  private registerFileWatchers(context: vscode.ExtensionContext): void {
    const config = getNavigatorConfig();
    const watchedGlobs = [...config.specFileGlobs, ...config.pageObjectFileGlobs, ...config.featureFileGlobs];

    for (const watchedGlob of watchedGlobs) {
      const watcher = vscode.workspace.createFileSystemWatcher(watchedGlob);
      const schedule = (uri: vscode.Uri) => {
        if (!isExcluded(uri, config.excludeGlobs)) {
          this.scheduleIndexRebuild();
        }
      };

      watcher.onDidCreate(schedule, undefined, context.subscriptions);
      watcher.onDidChange(schedule, undefined, context.subscriptions);
      watcher.onDidDelete(schedule, undefined, context.subscriptions);
      context.subscriptions.push(watcher);
      this.fileWatchers.push(watcher);
    }
  }

  private scheduleIndexRebuild(): void {
    if (this.rebuildTimer) {
      clearTimeout(this.rebuildTimer);
    }

    this.rebuildTimer = setTimeout(() => {
      this.indexReady = this.rebuildIndex();
    }, 250);
  }

  private disposeWatchers(): void {
    for (const watcher of this.fileWatchers) {
      watcher.dispose();
    }

    this.fileWatchers = [];
  }

  private logDebug(message: string): void {
    if (!getNavigatorConfig().enableDebugLogging) {
      return;
    }

    this.outputChannel.appendLine('[' + new Date().toISOString() + '] ' + message);
  }
}

function toLocation(entry: StepIndexEntry): vscode.Location {
  return new vscode.Location(entry.uri, entry.range);
}

function toDescriptionLocation(entry: DescriptionIndexEntry): vscode.Location {
  return new vscode.Location(entry.uri, entry.range);
}

function createNavigateCommandUri(args: NavigateCommandArgs): vscode.Uri {
  return vscode.Uri.parse(
    'command:playwrightGherkinStepNavigator.goToMatch?' + encodeURIComponent(JSON.stringify([args]))
  );
}

function createMatchCountCodeLens(
  step: StepIndexEntry,
  count: number,
  direction: NavigateDirection
): vscode.CodeLens {
  const targetLabel = direction === 'playwright' ? 'Playwright' : 'feature';
  const title = count === 0
    ? 'No ' + targetLabel + ' matches'
    : count + ' ' + targetLabel + ' ' + (count === 1 ? 'match' : 'matches');

  return new vscode.CodeLens(step.range, {
    title,
    command: 'playwrightGherkinStepNavigator.goToMatch',
    arguments: [{
      label: step.label,
      sourceUri: step.uri.toString(),
      direction
    } satisfies NavigateCommandArgs]
  });
}

function createDescriptionMatchCountCodeLens(
  description: DescriptionIndexEntry,
  count: number,
  direction: NavigateDirection
): vscode.CodeLens {
  const targetLabel = direction === 'playwright' ? 'Playwright' : 'feature';
  const title = count === 0
    ? 'No ' + targetLabel + ' matches'
    : count + ' ' + targetLabel + ' ' + (count === 1 ? 'match' : 'matches');

  return new vscode.CodeLens(description.range, {
    title,
    command: 'playwrightGherkinStepNavigator.goToMatch',
    arguments: [{
      label: description.label,
      sourceUri: description.uri.toString(),
      direction
    } satisfies NavigateCommandArgs]
  });
}

async function openStepMatch(match: StepIndexEntry): Promise<void> {
  const document = await vscode.workspace.openTextDocument(match.uri);
  const editor = await vscode.window.showTextDocument(document);

  editor.selection = new vscode.Selection(match.range.start, match.range.start);
  editor.revealRange(match.range, vscode.TextEditorRevealType.InCenter);
}

async function openDescriptionMatch(match: DescriptionIndexEntry): Promise<void> {
  const document = await vscode.workspace.openTextDocument(match.uri);
  const editor = await vscode.window.showTextDocument(document);

  editor.selection = new vscode.Selection(match.range.start, match.range.start);
  editor.revealRange(match.range, vscode.TextEditorRevealType.InCenter);
}
