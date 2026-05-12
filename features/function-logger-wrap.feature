@wrap-demo
Feature: Function logger wrap (example system)

  A small in-memory domain demonstrates `getFunctionLogger(...).wrap()` and nested
  `getFunctionLogger` scopes the same way application code would inside a feature.

  Scenario: nested wrap emits layer-style executing and executed logs
    Given I use the "wrap-demo" config
    And I load the system
    When I run the wrap demo pipeline
    Then the captured logs show nested wrap execution
