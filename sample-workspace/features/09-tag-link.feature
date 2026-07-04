Feature: Tag linking

  @tag-link-single
  Scenario: single feature tag links to a Playwright annotation tag
    Given the single tag fixture is ready

  @tag-link-array @tag-link-smoke
  Scenario: multiple feature tags link to Playwright annotation tag arrays
    Given the tag array fixture is ready
