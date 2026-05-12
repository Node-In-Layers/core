@otel
Feature: OpenTelemetry integration

  Scenario: feature-level ids are preserved when one feature calls another
    Given I use the "otel" config
    And I load the system
    When I call domain1 callPing with feature ids "outer-feature" and "inner-feature"
    Then the collector logs should contain two featureId attributes

  Scenario: callPing is traced through the collector
    Given I use the "otel" config
    And I load the system
    When I call domain1 callPing
    Then I should see telemetry in the collector
