Feature: Reusable step indexing

  Scenario: reusable step files are indexed
    When the user logs in as "admin-user"
    Then the reusable login helper should complete
