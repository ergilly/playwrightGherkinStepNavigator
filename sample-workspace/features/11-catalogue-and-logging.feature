Feature: Catalogue and debug logging

  Scenario: indexed steps appear in the workspace catalogue
    Given the catalogue fixture has a Playwright step
    Then the debug output should mention indexed steps
