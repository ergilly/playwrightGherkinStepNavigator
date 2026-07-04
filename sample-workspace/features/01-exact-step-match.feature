Feature: Exact step matching

  Scenario: exact step labels navigate to matching Playwright steps
    Given the exact customer record is loaded
    When the exact customer record is saved
    Then the exact save confirmation is shown
