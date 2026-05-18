import {
  Before,
  After,
  Given,
  When,
  Then,
  setWorldConstructor,
} from '@cucumber/cucumber'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { metrics, trace } from '@opentelemetry/api'
import { logs } from '@opentelemetry/api-logs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
import assert from 'node:assert'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { CoreNamespace, LogFormat, LogLevelNames } from '../../src/types.js'
import { loadSystem } from '../../src/entries.js'
import { crossLayerPropsWithLoggingOverrides } from '../../src/libs.js'
import { compositeLogger } from '../../src/globals/logging.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dataDir = path.resolve(__dirname, '..', 'data')
const collectorDir = path.join(dataDir, 'collector')
const collectorLogPath = path.join(collectorDir, 'features-otel.json')

/**
 * NodeSDK.shutdown() shuts providers but does not unregister @opentelemetry/api globals.
 * In particular, api-logs ignores a second setGlobalLoggerProvider if a global already
 * exists, so the next scenario would keep using a shut-down logger provider and export
 * nothing. Clearing globals after shutdown makes back-to-back @otel scenarios reliable.
 */
const resetOpenTelemetryApiGlobals = (): void => {
  trace.disable()
  metrics.disable()
  logs.disable()
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const execFileAsync = promisify(execFile)

const composeCwd = path.resolve(__dirname, '..', '..')
const composeArgs = (args: readonly string[]) => [
  'compose',
  '-f',
  'docker-compose-features.yml',
  ...args,
]

// Reusable helpers to manage the OTEL collector via docker compose at scenario level.
const runDockerCompose = (args: readonly string[]) =>
  execFileAsync('docker', composeArgs(args), { cwd: composeCwd }).then(
    () => undefined
  )

const startCollector = () =>
  runDockerCompose(['up', '-d']).then(async () => {
    await sleep(5000)
  })
const stopCollector = () => runDockerCompose(['down'])

// Capture container stdout/stderr (including shutdown messages) before tearing down.
const getCollectorLogs = (): Promise<string> =>
  execFileAsync(
    'docker',
    composeArgs([
      'logs',
      '--no-color',
      'node-in-layers-core-features-otel-collector',
    ]),
    {
      cwd: composeCwd,
      maxBuffer: 1024 * 1024,
    }
  )
    .then(({ stdout, stderr }) =>
      [stdout, stderr].filter(Boolean).join('\n').trim()
    )
    .catch(() => '')

// Read the collector file, handling truncation/null bytes and retrying until it has content.
const readCollectorFile = async (maxAttempts = 30): Promise<string> => {
  const attemptRead = async (remaining: number): Promise<string> => {
    if (remaining <= 0) {
      return ''
    }

    try {
      const rawContent = await fs.readFile(collectorLogPath, 'utf8')
      // Strip any null bytes that may exist due to truncation while the collector holds the file open.
      const cleaned = rawContent.replace(/\0/g, '')
      if (cleaned && cleaned.length > 0) {
        return cleaned
      }
    } catch {
      // file may not exist yet; ignore and retry
    }

    await sleep(250)
    return attemptRead(remaining - 1)
  }

  return attemptRead(maxAttempts)
}

const createDomain1 = () => ({
  name: 'domain1',
  services: {
    create: () => ({
      ping: x => {
        return 'pong'
      },
    }),
  },
  features: {
    create: context => ({
      callPing: (crossLayerProps: any) =>
        context.services.domain1.ping(crossLayerProps),
    }),
  },
})

const createDomainWrapDemo = () => ({
  name: 'wrapDemo',
  services: {
    create: () => ({
      noop: async () => undefined,
    }),
  },
  features: {
    create: (context: any) => ({
      runWrappedPipeline: async (crossLayerProps?: Record<string, unknown>) => {
        const log = context.log.getFunctionLogger(
          'runWrappedPipeline',
          crossLayerProps
        )
        return log.wrap(
          async () => {
            const innerLog = log.getFunctionLogger('innerStep')
            return innerLog.wrap(
              async () => {
                innerLog.trace('inner trace', { detail: 'nested' })
                return { step: 'inner-done' }
              },
              { args: [{ phase: 'inner' }] }
            )
          },
          { args: [{ phase: 'outer' }] }
        )
      },
    }),
  },
})

const wrapDemoMessages: any[] = []
const omitDataServiceMessages: any[] = []

const createDomainOmitDataServiceDemo = () => ({
  name: 'omitDataSvc',
  services: {
    create: () => ({
      secretEcho: (payload: { secret: string }) => ({
        len: payload.secret.length,
      }),
    }),
  },
  features: {
    create: (context: any) => ({
      callWithOmit: () => {
        const next = crossLayerPropsWithLoggingOverrides(
          { omitData: true },
          { logging: { ids: [{ omitDataFeatureTest: 'with-omit' }] } }
        )
        return context.services.omitDataSvc.secretEcho(
          { secret: 'classified' },
          next
        )
      },
      callWithoutOmit: () => {
        const next = {
          logging: { ids: [{ omitDataFeatureTest: 'no-omit' }] },
        }
        return context.services.omitDataSvc.secretEcho(
          { secret: 'visible' },
          next
        )
      },
    }),
  },
})

// Test-only config factories keyed by name so step text can choose which to use.
const CONFIGS = {
  otel: () => ({
    systemName: 'nil-core-features',
    environment: 'cucumber-test',
    [CoreNamespace.root]: {
      apps: [createDomain1()],
      layerOrder: ['services', 'features', 'entries'],
      logging: {
        logLevel: LogLevelNames.info,
        logFormat: [LogFormat.otel],
        otel: {
          serviceName: 'nil-core-features',
          version: '1.0.0',
          trace: { enabled: true },
          logs: { enabled: true },
          metrics: { enabled: true },
        },
      },
    },
  }),
  'wrap-demo': () => ({
    systemName: 'nil-core-wrap-demo',
    environment: 'cucumber-test',
    [CoreNamespace.root]: {
      apps: [createDomainWrapDemo()],
      layerOrder: ['services', 'features'],
      logging: {
        logLevel: LogLevelNames.trace,
        logFormat: [LogFormat.simple],
        customLogger: {
          getLogger: (context: unknown, props?: unknown) => {
            return compositeLogger([
              () => logMessage => {
                wrapDemoMessages.push(logMessage)
              },
            ]).getLogger(context as any, props as any)
          },
        },
      },
    },
  }),
  'omit-data-service': () => ({
    systemName: 'nil-core-omit-data-service',
    environment: 'cucumber-test',
    [CoreNamespace.root]: {
      apps: [createDomainOmitDataServiceDemo()],
      layerOrder: ['services', 'features'],
      logging: {
        logLevel: LogLevelNames.trace,
        logFormat: [LogFormat.simple],
        customLogger: {
          getLogger: (context: unknown, props?: unknown) => {
            return compositeLogger([
              () => logMessage => {
                omitDataServiceMessages.push(logMessage)
              },
            ]).getLogger(context as any, props as any)
          },
        },
      },
    },
  }),
} as const

class TestWorld {
  system: any | undefined
  configKey: keyof typeof CONFIGS | undefined
  sdk: NodeSDK | undefined
}

setWorldConstructor(TestWorld)

Before({ tags: '@otel', timeout: 10_000 }, async function () {
  // Ensure test/collector directories exist.
  await fs.mkdir(collectorDir, { recursive: true })

  // If a prior scenario ended without running Then/After (or only partially), globals may
  // still be registered and would block the next NodeSDK.start().
  resetOpenTelemetryApiGlobals()

  // Ensure any previous collector instance is stopped, then start a fresh one.
  await stopCollector().catch(() => undefined)
  // Drop stale OTLP export file so a later scenario cannot read the previous run's data,
  // and so an empty file always means "this scenario produced nothing yet".
  await fs.rm(collectorLogPath, { force: true }).catch(() => undefined)

  await startCollector()

  // Register trace + log export so layer spans and LogFormat.otel records reach the collector.
  this.sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({
      url: 'http://localhost:4318/v1/traces',
    }),
    logRecordProcessors: [
      new BatchLogRecordProcessor(
        new OTLPLogExporter({
          url: 'http://localhost:4318/v1/logs',
        })
      ),
    ],
  })
  await this.sdk.start()
})

Before({ tags: '@wrap-demo' }, async function () {
  wrapDemoMessages.length = 0
})

Before({ tags: '@omit-data-service' }, async function () {
  omitDataServiceMessages.length = 0
})

After({ tags: '@otel' }, async function () {
  if (this.sdk) {
    await this.sdk.shutdown()
    this.sdk = undefined
  }
  resetOpenTelemetryApiGlobals()
  const collectorContainerLogs = await getCollectorLogs()
  if (collectorContainerLogs) {
    console.log(
      '\n--- Collector logs (this scenario) ---\n' +
        collectorContainerLogs +
        '\n---\n'
    )
  }
  await stopCollector()
})

Given('I use the {string} config', function (key: string) {
  if (!(key in CONFIGS)) {
    throw new Error(
      `Unknown config key "${key}". Known keys: ${Object.keys(CONFIGS).join(', ')}`
    )
  }
  this.configKey = key as keyof typeof CONFIGS
})

Given('I load the system', async function () {
  const key = this.configKey ?? ('otel' as keyof typeof CONFIGS)
  const createConfig = CONFIGS[key]
  // @ts-ignore - test-only config; structural typing is enough here
  this.system = await loadSystem({
    environment: 'cucumber-test',
    config: createConfig(),
  })
})

When('I call domain1 callPing', async function () {
  const result = await this.system.features.domain1.callPing()
  assert.strictEqual(result, 'pong')
})

When(
  'I call domain1 callPing with feature ids {string} and {string}',
  async function (outerId: string, innerId: string) {
    const crossLayerProps = {
      logging: {
        ids: [{ featureId: outerId }, { featureId: innerId }],
      },
    }
    const result = await this.system.features.domain1.callPing(crossLayerProps)
    assert.strictEqual(result, 'pong')
  }
)

Then(
  'I should see telemetry in the collector',
  { timeout: 30_000 },
  async function () {
    // Shut down this scenario's SDK so any in-process spans/logs are flushed to the collector.
    if (this.sdk) {
      await this.sdk.shutdown()
      this.sdk = undefined
    }
    resetOpenTelemetryApiGlobals()

    // Collector batch + file exporter need time after process shutdown (esp. when multiple scenarios run).
    await sleep(4500)
    const content = await readCollectorFile()

    assert.ok(
      content && content.length > 0,
      'expected collector log file to contain telemetry, but it was empty or missing after waiting'
    )
  }
)

Then(
  'the collector logs should contain two featureId attributes',
  { timeout: 30_000 },
  async function () {
    // Shut down this scenario's SDK so any in-process spans/logs are flushed to the collector.
    if (this.sdk) {
      await this.sdk.shutdown()
      this.sdk = undefined
    }
    resetOpenTelemetryApiGlobals()

    await sleep(4500)
    const content = await readCollectorFile()

    assert.ok(
      content && content.length > 0,
      'expected collector log file to contain telemetry, but it was empty or missing after waiting'
    )

    // File is JSON Lines (one OTLP payload per line). Find the logs payload.
    const lines = content
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)

    const logsLine = lines.find(line => line.includes('"resourceLogs"'))
    assert.ok(logsLine, 'expected a resourceLogs payload in the collector file')

    const logsPayload = JSON.parse(logsLine)
    const resourceLogs = logsPayload.resourceLogs ?? []

    const featureIdCount = (resourceLogs as any[])
      .flatMap(rl => (rl?.scopeLogs ?? []) as any[])
      .flatMap(sl => (sl?.logRecords ?? []) as any[])
      .flatMap(lr => (lr?.attributes ?? []) as any[])
      .filter((attr: any) => attr?.key === 'featureId').length

    assert.strictEqual(
      featureIdCount,
      2,
      `expected exactly two featureId attributes in collector logs, but found ${featureIdCount}`
    )
  }
)

When('I run the wrap demo pipeline', async function () {
  const result = await this.system.features.wrapDemo.runWrappedPipeline()
  assert.deepStrictEqual(result, { step: 'inner-done' })
})

When('I call omit-data service with omitData enabled', async function () {
  const result = await this.system.features.omitDataSvc.callWithOmit()
  assert.deepStrictEqual(result, { len: 10 })
})

When('I call omit-data service with omitData disabled', async function () {
  const result = await this.system.features.omitDataSvc.callWithoutOmit()
  assert.deepStrictEqual(result, { len: 7 })
})

Then(
  'the captured logs show Executing services function without args for secretEcho',
  async function () {
    const hit = omitDataServiceMessages.find(
      (m: { message?: string; function?: string }) =>
        m.message === 'Executing services function' &&
        m.function === 'secretEcho'
    )
    assert.ok(
      hit,
      `expected Executing services function for secretEcho; messages: ${JSON.stringify(
        omitDataServiceMessages.map(
          (m: { message?: string; function?: string }) => ({
            message: m.message,
            function: m.function,
          })
        )
      )}`
    )
    assert.ok(
      !Object.prototype.hasOwnProperty.call(hit, 'args'),
      'Executing services log should not include args when omitData is set'
    )
  }
)

Then(
  'the captured logs show Executed services function without result for secretEcho',
  async function () {
    const hit = omitDataServiceMessages.find(
      (m: { message?: string; function?: string }) =>
        m.message === 'Executed services function' &&
        m.function === 'secretEcho'
    )
    assert.ok(hit, 'expected Executed services function for secretEcho')
    assert.ok(
      !Object.prototype.hasOwnProperty.call(hit, 'result'),
      'Executed services log should not include result when omitData is set'
    )
  }
)

Then(
  'the captured logs show secretEcho service wrap with args and result',
  async function () {
    const executing = omitDataServiceMessages.find(
      (m: { message?: string; function?: string }) =>
        m.message === 'Executing services function' &&
        m.function === 'secretEcho'
    )
    assert.ok(executing, 'expected Executing services function for secretEcho')
    assert.ok(
      Object.prototype.hasOwnProperty.call(executing, 'args'),
      'expected args on Executing log when omitData is off'
    )
    const executed = omitDataServiceMessages.find(
      (m: { message?: string; function?: string }) =>
        m.message === 'Executed services function' &&
        m.function === 'secretEcho'
    )
    assert.ok(executed, 'expected Executed services function for secretEcho')
    assert.ok(
      Object.prototype.hasOwnProperty.call(executed, 'result'),
      'expected result on Executed log when omitData is off'
    )
  }
)

Then('the captured logs show nested wrap execution', async function () {
  const hasWrapArgPhase = (
    m: { message?: string; args?: unknown },
    phase: string
  ) => {
    if (m.message !== 'Executing features function') {
      return false
    }
    const args = m.args
    return (
      Array.isArray(args) &&
      args.some(
        a =>
          Boolean(a) &&
          typeof a === 'object' &&
          (a as { phase?: string }).phase === phase
      )
    )
  }

  const outerWrapExecuting = wrapDemoMessages.filter(m =>
    hasWrapArgPhase(m as { message?: string; args?: unknown }, 'outer')
  )
  const innerWrapExecuting = wrapDemoMessages.filter(m =>
    hasWrapArgPhase(m as { message?: string; args?: unknown }, 'inner')
  )

  assert.strictEqual(
    outerWrapExecuting.length,
    1,
    `expected exactly one outer wrap Executing log (args phase outer), found ${outerWrapExecuting.length}`
  )
  assert.strictEqual(
    innerWrapExecuting.length,
    1,
    `expected exactly one inner wrap Executing log (args phase inner), found ${innerWrapExecuting.length}`
  )

  const innerWrapExecuted = wrapDemoMessages.filter(
    (m: { message?: string; function?: string; result?: { step?: string } }) =>
      m.message === 'Executed features function' &&
      m.function === 'innerStep' &&
      m.result &&
      typeof m.result === 'object' &&
      m.result.step === 'inner-done'
  )
  assert.strictEqual(
    innerWrapExecuted.length,
    1,
    'expected exactly one Executed log for innerStep with the inner wrap return value'
  )

  const runWrappedPipelineExecuted = wrapDemoMessages.filter(
    (m: { message?: string; function?: string; result?: { step?: string } }) =>
      m.message === 'Executed features function' &&
      m.function === 'runWrappedPipeline' &&
      m.result &&
      typeof m.result === 'object' &&
      m.result.step === 'inner-done'
  )
  assert.ok(
    runWrappedPipelineExecuted.length >= 1,
    `expected at least one Executed log for runWrappedPipeline (layer and/or explicit wrap), found ${runWrappedPipelineExecuted.length}`
  )

  const traceHit = wrapDemoMessages.find(
    (m: { message?: string }) => m.message === 'inner trace'
  )
  assert.ok(traceHit, 'expected an inner trace log line')

  const functions = wrapDemoMessages
    .map((m: { function?: string }) => m.function)
    .filter((f): f is string => Boolean(f))
  assert.ok(
    functions.includes('runWrappedPipeline'),
    `expected runWrappedPipeline in log function fields: ${JSON.stringify(functions)}`
  )
  assert.ok(
    functions.includes('innerStep'),
    `expected innerStep in log function fields: ${JSON.stringify(functions)}`
  )
})
