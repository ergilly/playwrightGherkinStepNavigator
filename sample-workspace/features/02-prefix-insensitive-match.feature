Feature: Prefix insensitive step matching

  Scenario: BDD keywords are ignored during step matching
    Given the cross-prefix customer starts checkout
    When the cross-prefix customer confirms checkout
    Then the cross-prefix checkout receipt is displayed
