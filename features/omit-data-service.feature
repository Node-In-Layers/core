@omit-data-service
Feature: Service layer omits wrap payloads when logging.overrides.omitData is set

  A feature calls a service with crossLayerPropsWithLoggingOverrides({ omitData: true }, ...)
  so the service layer wrap logs omit args and result on the wrap lines.

  Scenario: omitData on the downstream service call
    Given I use the "omit-data-service" config
    And I load the system
    When I call omit-data service with omitData enabled
    Then the captured logs show Executing services function without args for secretEcho
    And the captured logs show Executed services function without result for secretEcho

  Scenario: service wrap logs still include payloads when omitData is not set
    Given I use the "omit-data-service" config
    And I load the system
    When I call omit-data service with omitData disabled
    Then the captured logs show secretEcho service wrap with args and result
