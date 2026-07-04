Feature: Placeholder step matching

  Scenario: placeholder labels match concrete feature values
    Given the user logs in as "standard-user"
    When the user opens workspace "north-region"
    Then workspace "north-region" should be active
