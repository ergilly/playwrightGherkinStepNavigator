Feature: Page object step indexing

  Scenario: page object test.step calls are indexed
    Given the user is on the login page in login mode
    When the user views the login form
    Then the form should show pre-filled credentials
