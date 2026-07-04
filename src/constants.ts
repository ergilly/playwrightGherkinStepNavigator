export const CONFIG_SECTION = 'playwrightGherkinStepNavigator';
export const STEP_KEYWORDS = ['Given', 'When', 'Then', 'And', 'But', '*'];
export const TEST_STEP_PATTERN = new RegExp("test\\s*\\.\\s*step\\s*\\(\\s*(['\\\"\\x60])((?:\\\\.|(?!\\1)[\\s\\S])*?)\\1", 'g');
export const PLAYWRIGHT_TEST_PATTERN = new RegExp("\\btest(?:\\s*\\.\\s*(?:only|skip|fixme|slow))?\\s*\\(\\s*(['\\\"\\x60])((?:\\\\.|(?!\\1)[\\s\\S])*?)\\1\\s*(?:,\\s*\\{([\\s\\S]*?)\\})?", 'g');
export const PLAYWRIGHT_DESCRIBE_PATTERN = new RegExp("\\btest\\s*\\.\\s*describe(?:\\s*\\.\\s*(?:only|skip|serial|parallel))?\\s*\\(\\s*(['\\\"\\x60])((?:\\\\.|(?!\\1)[\\s\\S])*?)\\1", 'g');
