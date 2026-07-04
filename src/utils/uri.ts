import * as vscode from 'vscode';

export function isFeatureUri(uri: vscode.Uri): boolean {
  return normaliseFsPath(uri).endsWith('.feature');
}

export function isPlaywrightSpecUri(uri: vscode.Uri): boolean {
  return /\.(spec|test)\.[jt]s$/i.test(normaliseFsPath(uri));
}

export function isPlaywrightImplementationUri(uri: vscode.Uri): boolean {
  return /\.[jt]s$/i.test(normaliseFsPath(uri));
}

export function normaliseFsPath(uri: vscode.Uri): string {
  return uri.fsPath.replace(/\\/g, '/').toLocaleLowerCase();
}

export function isSameUri(left: vscode.Uri, right: vscode.Uri): boolean {
  return normaliseFsPath(left) === normaliseFsPath(right);
}

export function toBraceGlob(globs: string[]): string {
  return globs.length === 0 ? '' : '{' + globs.join(',') + '}';
}

export function isExcluded(uri: vscode.Uri, excludeGlobs: string[]): boolean {
  const relativePath = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/');

  return excludeGlobs.some((glob) => {
    const ignoredDirectory = glob.match(/\*\*\/([^/*]+)\/\*\*/)?.[1];

    return Boolean(ignoredDirectory && relativePath.split('/').includes(ignoredDirectory));
  });
}
