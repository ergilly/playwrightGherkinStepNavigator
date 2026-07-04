Feature: Undefined step quick fix

  Scenario: undefined steps show diagnostics and quick fixes
    Given the undefined step fixture is ready
    Then this undefined navigation step should offer a quick fix
