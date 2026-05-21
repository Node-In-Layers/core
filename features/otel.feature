@otel
Feature: OpenTelemetry integration

  Scenario: feature-level ids are preserved when one feature calls another
    Given I use the "otel" config
    And I load the system
    When I call domain1 callPing with feature ids "outer-feature" and "inner-feature"
    Then the collector logs should contain two id_featureId attributes

  Scenario: callPing is traced through the collector
    Given I use the "otel" config
    And I load the system
    When I call domain1 callPing
    Then I should see telemetry in the collector
    And the collector trace spans for callPing should share one traceId
    And the collector trace span "services:domain1:ping" should be nested under "features:domain1:callPing"

  Scenario: nested feature and service calls share one trace
    Given I use the "otel" config
    And I load the system
    When I run the multi-domain trace demo
    Then the collector trace should have one traceId
    And the collector trace should contain spans:
      | name                                  | parent                              |
      | features:domainOrchestrator:runFlow   | root                                |
      | features:domainB:processOrder         | features:domainOrchestrator:runFlow |
      | services:domainB:validate             | features:domainB:processOrder         |
      | services:domainB:charge               | features:domainB:processOrder       |
    And the collector logs should be correlated to the trace
