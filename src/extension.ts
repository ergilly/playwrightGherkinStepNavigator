import * as vscode from 'vscode';
import { NavigatorRuntime } from './navigatorRuntime';

let runtime: NavigatorRuntime | undefined;

export function activate(context: vscode.ExtensionContext): void {
  runtime = new NavigatorRuntime();
  runtime.activate(context);
}

export function deactivate(): void {
  runtime?.deactivate();
  runtime = undefined;
}
