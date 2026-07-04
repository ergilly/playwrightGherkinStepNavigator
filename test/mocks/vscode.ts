export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number
  ) {}
}

export class Range {
  readonly start: Position;
  readonly end: Position;

  constructor(start: Position, end: Position);
  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number);
  constructor(
    startLineOrPosition: Position | number,
    startCharacterOrPosition: Position | number,
    endLine?: number,
    endCharacter?: number
  ) {
    if (startLineOrPosition instanceof Position && startCharacterOrPosition instanceof Position) {
      this.start = startLineOrPosition;
      this.end = startCharacterOrPosition;
      return;
    }

    this.start = new Position(startLineOrPosition as number, startCharacterOrPosition as number);
    this.end = new Position(endLine ?? 0, endCharacter ?? 0);
  }
}

export class Uri {
  constructor(public readonly fsPath: string) {}

  static file(fsPath: string): Uri {
    return new Uri(fsPath);
  }

  static parse(value: string): Uri {
    return new Uri(value);
  }

  toString(): string {
    return this.fsPath;
  }
}

export class Diagnostic {}
export class EventEmitter<T = void> {
  readonly event = jest.fn();
  fire = jest.fn();
  dispose = jest.fn();
}

export class CodeAction {}
export class TreeItem {}
export class Location {
  constructor(
    public readonly uri: Uri,
    public readonly range: Range
  ) {}
}

export const DiagnosticSeverity = { Warning: 1 };
export const CodeActionKind = { QuickFix: 'quickfix' };
export const TreeItemCollapsibleState = { None: 0 };
export const TextEditorRevealType = { InCenter: 0 };

export const workspace = {
  getConfiguration: jest.fn(() => ({
    get: jest.fn((_key: string, fallback: unknown) => fallback)
  })),
  asRelativePath: jest.fn((uri: Uri) => uri.fsPath),
  findFiles: jest.fn(),
  openTextDocument: jest.fn(),
  textDocuments: []
};

export const window = {
  createOutputChannel: jest.fn(),
  createTreeView: jest.fn(),
  showInformationMessage: jest.fn(),
  showQuickPick: jest.fn(),
  showTextDocument: jest.fn(),
  activeTextEditor: undefined
};

export const languages = {
  createDiagnosticCollection: jest.fn(),
  registerDefinitionProvider: jest.fn(),
  registerDocumentLinkProvider: jest.fn(),
  registerCodeLensProvider: jest.fn(),
  registerCodeActionsProvider: jest.fn()
};

export const commands = {
  registerCommand: jest.fn()
};

export const env = {
  clipboard: {
    writeText: jest.fn()
  }
};
