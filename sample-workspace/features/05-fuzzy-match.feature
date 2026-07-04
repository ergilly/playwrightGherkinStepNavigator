Feature: Fuzzy step matching

  Scenario: fuzzy labels tolerate small text differences
    Given the fuzzy customer profile is open
    Then the welcome message should greet the user
