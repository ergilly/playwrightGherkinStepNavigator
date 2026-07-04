import * as vscode from 'vscode';
import { extractFeatureDescriptions, extractFeatureSteps, extractPlaywrightDescriptions, extractPlaywrightSteps } from './extractors';
import { findMatchingIndexEntries } from './matching';
import { DescriptionIndexEntry, MatchResult, NavigatorConfig, StepIndexEntry } from './types';
import { normaliseStepLabel } from './utils/text';
import { isFeatureUri, isPlaywrightImplementationUri, toBraceGlob } from './utils/uri';

type StepExtractor = (source: string, uri: vscode.Uri, config: NavigatorConfig) => StepIndexEntry[];
type DescriptionExtractor = (source: string, uri: vscode.Uri, config: NavigatorConfig) => DescriptionIndexEntry[];

export class StepIndex {
  playwrightSteps: StepIndexEntry[] = [];
  featureSteps: StepIndexEntry[] = [];
  playwrightDescriptions: DescriptionIndexEntry[] = [];
  featureDescriptions: DescriptionIndexEntry[] = [];

  async build(config: NavigatorConfig, logDebug: (message: string) => void): Promise<void> {
    logDebug('Building step index.');
    const [playwrightSteps, featureSteps, playwrightDescriptions, featureDescriptions] = await Promise.all([
      this.collectPlaywrightStepEntries(config, logDebug),
      this.collectFeatureStepEntries(config, logDebug),
      this.collectPlaywrightDescriptionEntries(config, logDebug),
      this.collectFeatureDescriptionEntries(config, logDebug)
    ]);

    this.playwrightSteps = playwrightSteps;
    this.featureSteps = featureSteps;
    this.playwrightDescriptions = playwrightDescriptions;
    this.featureDescriptions = featureDescriptions;
    logDebug('Indexed ' + playwrightSteps.length + ' Playwright steps, ' + featureSteps.length + ' feature steps, ' + playwrightDescriptions.length + ' Playwright descriptions/tags, and ' + featureDescriptions.length + ' feature scenarios/tags.');
  }

  findMatchingPlaywrightSteps(label: string, config: NavigatorConfig): StepIndexEntry[] {
    return this.findMatchingPlaywrightStepResults(label, config).map((result) => result.entry);
  }

  findMatchingFeatureSteps(label: string, config: NavigatorConfig): StepIndexEntry[] {
    return this.findMatchingFeatureStepResults(label, config).map((result) => result.entry);
  }

  findMatchingPlaywrightStepResults(label: string, config: NavigatorConfig): MatchResult[] {
    return findMatchingIndexEntries(label, this.playwrightSteps, config);
  }

  findMatchingFeatureStepResults(label: string, config: NavigatorConfig): MatchResult[] {
    return findMatchingIndexEntries(label, this.featureSteps, config);
  }

  findMatchingPlaywrightDescriptions(label: string, config: NavigatorConfig): DescriptionIndexEntry[] {
    const normalised = normaliseStepLabel(label, config.includeKeywordInMatch);

    return this.playwrightDescriptions.filter((entry) =>
      (entry.kind === 'test' || entry.kind === 'describe') && entry.normalised === normalised
    );
  }

  findMatchingPlaywrightTags(tag: string): DescriptionIndexEntry[] {
    const normalised = normaliseStepLabel(tag, true);

    return this.playwrightDescriptions.filter((entry) => entry.kind === 'tag' && entry.normalised === normalised);
  }

  private async collectPlaywrightStepEntries(config: NavigatorConfig, logDebug: (message: string) => void): Promise<StepIndexEntry[]> {
    return this.collectStepEntries([...config.specFileGlobs, ...config.pageObjectFileGlobs], config, extractPlaywrightSteps, isPlaywrightImplementationUri, logDebug);
  }

  private async collectFeatureStepEntries(config: NavigatorConfig, logDebug: (message: string) => void): Promise<StepIndexEntry[]> {
    return this.collectStepEntries(config.featureFileGlobs, config, extractFeatureSteps, isFeatureUri, logDebug);
  }

  private async collectPlaywrightDescriptionEntries(config: NavigatorConfig, logDebug: (message: string) => void): Promise<DescriptionIndexEntry[]> {
    return this.collectDescriptionEntries([...config.specFileGlobs, ...config.pageObjectFileGlobs], config, extractPlaywrightDescriptions, isPlaywrightImplementationUri, logDebug);
  }

  private async collectFeatureDescriptionEntries(config: NavigatorConfig, logDebug: (message: string) => void): Promise<DescriptionIndexEntry[]> {
    return this.collectDescriptionEntries(config.featureFileGlobs, config, extractFeatureDescriptions, isFeatureUri, logDebug);
  }

  private async collectStepEntries(
    includeGlobs: string[],
    config: NavigatorConfig,
    extractor: StepExtractor,
    uriFilter: (uri: vscode.Uri) => boolean,
    logDebug: (message: string) => void
  ): Promise<StepIndexEntry[]> {
    const uris = await this.collectUris(includeGlobs, config, uriFilter);
    const entries: StepIndexEntry[] = [];

    await Promise.all(uris.map(async (uri) => {
      try {
        const document = await vscode.workspace.openTextDocument(uri);
        entries.push(...extractor(document.getText(), uri, config));
      } catch (error) {
        logDebug('Unable to index steps from ' + uri.toString() + ': ' + String(error));
      }
    }));

    return entries;
  }

  private async collectDescriptionEntries(
    includeGlobs: string[],
    config: NavigatorConfig,
    extractor: DescriptionExtractor,
    uriFilter: (uri: vscode.Uri) => boolean,
    logDebug: (message: string) => void
  ): Promise<DescriptionIndexEntry[]> {
    const uris = await this.collectUris(includeGlobs, config, uriFilter);
    const entries: DescriptionIndexEntry[] = [];

    await Promise.all(uris.map(async (uri) => {
      try {
        const document = await vscode.workspace.openTextDocument(uri);
        entries.push(...extractor(document.getText(), uri, config));
      } catch (error) {
        logDebug('Unable to index descriptions from ' + uri.toString() + ': ' + String(error));
      }
    }));

    return entries;
  }

  private async collectUris(
    includeGlobs: string[],
    config: NavigatorConfig,
    uriFilter: (uri: vscode.Uri) => boolean
  ): Promise<vscode.Uri[]> {
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

    return Array.from(urisByPath.values());
  }
}
