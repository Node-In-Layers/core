import {
  type Config,
  CoreNamespace,
  type OtelConfig,
  type ServicesContext,
} from '../types.js'
import {
  memoizeValueSync,
  isPromise,
  requiresInitialization,
} from '../utils.js'
import type {
  AttributesMap,
  OtelLogsService,
  OtelMetricsService,
  OtelServices,
  OtelTraceService,
  RunWithTraceAndMetricsOptions,
  SpanWrappable,
} from './types.js'
import {
  createNoopCounter,
  createNoopHistogram,
  createNoopSpan,
  idsToAttributes,
  layerMetricAttrs,
  layerSpanName,
  toOtelAttributes,
  wrapOtelSpan,
} from './libs.js'

// --- Internal types for optional OTel API (not consumed; avoid depending on OTel package types) ---

type OtelTracer = {
  startSpan: (
    name: string,
    options?: { attributes?: Record<string, unknown> }
  ) => SpanWrappable
}
type OtelTraceApi = {
  getTracer: (name: string, version?: string) => OtelTracer
  getActiveSpan: () => SpanWrappable | undefined
}

type OtelHistogram = {
  record: (value: number, attrs?: Record<string, unknown>) => void
}
type OtelCounter = {
  add: (value?: number, attrs?: Record<string, unknown>) => void
}
type OtelMeter = {
  createHistogram: (name: string, options?: { unit?: string }) => OtelHistogram
  createCounter: (name: string, options?: { unit?: string }) => OtelCounter
}
type OtelMetricsApi = {
  getMeter: (name: string, version?: string) => OtelMeter
}

type CachedOtelApi = {
  trace: OtelTraceApi
  metrics: OtelMetricsApi
}

type OtelLogEmitRecord = {
  body?: string
  severityNumber?: number
  severityText?: string
  attributes?: Record<string, unknown>
}
type OtelLogger = { emit: (record: OtelLogEmitRecord) => void }
type OtelLogsApi = {
  getLogger: (name: string, version?: string) => OtelLogger
}
type CachedOtelLogsApi = {
  logs: OtelLogsApi
}

/**
 * Create the OTel domain services. Returns setupOtel, trace, metrics, and logs.
 * When a signal is not enabled in config, methods no-op. Uses memoized is*Enabled
 * so config is read once at first use. Uses dynamic import for optional @opentelemetry/api
 * (and optionally api-logs) so core works without them installed.
 */
export const create = (context: ServicesContext<Config>): OtelServices => {
  const getOtelConfig = (): OtelConfig | undefined =>
    context.config[CoreNamespace.root].logging?.otel

  const isTraceEnabled = memoizeValueSync(
    (): boolean => getOtelConfig()?.trace?.enabled === true
  )
  const isMetricsEnabled = memoizeValueSync(
    (): boolean => getOtelConfig()?.metrics?.enabled === true
  )
  const isLogsEnabled = memoizeValueSync(
    (): boolean => getOtelConfig()?.logs?.enabled === true
  )

  const getServiceName = (): string =>
    getOtelConfig()?.serviceName ??
    context.config.systemName ??
    'node-in-layers'
  const getVersion = (): string => getOtelConfig()?.version ?? '1.0.0'

  const otelApis = requiresInitialization(async () => {
    const otelConfig = getOtelConfig()
    if (!otelConfig) {
      return Promise.resolve(undefined)
    }
    const api = await import('@opentelemetry/api').then(m => {
      return m as unknown as CachedOtelApi
    })
    const logsApi = await import('@opentelemetry/api-logs').then(m => {
      return m as unknown as CachedOtelLogsApi
    })
    return {
      api,
      logsApi,
    }
  })

  const setupOtel = async (): Promise<void> => {
    await otelApis.initialize()
  }

  const startSpan: OtelTraceService['startSpan'] = (name, options) => {
    if (!isTraceEnabled()) {
      return createNoopSpan()
    }
    const api = otelApis.getInstance()
    if (!api?.api.trace) {
      return createNoopSpan()
    }
    const tracer = api.api.trace.getTracer(getServiceName(), getVersion())
    const span = tracer.startSpan(name, {
      attributes: toOtelAttributes(options?.attributes),
    })
    return wrapOtelSpan(span)
  }

  const runWithSpan: OtelTraceService['runWithSpan'] = (name, fn, options) => {
    const span = startSpan(name, options)
    return Promise.resolve(fn(span))
      .then(result => {
        span.end()
        return result
      })
      .catch(e => {
        span.end()
        throw e
      })
  }

  const getActiveSpan: OtelTraceService['getActiveSpan'] = () => {
    if (!isTraceEnabled()) {
      return undefined
    }
    const api = otelApis.getInstance()
    if (!api?.api.trace?.getActiveSpan) {
      return undefined
    }
    const span = api.api.trace.getActiveSpan()
    if (!span) {
      return undefined
    }
    return wrapOtelSpan(span)
  }

  const trace: OtelTraceService = {
    startSpan,
    runWithSpan,
    getActiveSpan,
  }

  const recordDuration: OtelMetricsService['recordDuration'] = (
    name,
    durationMs,
    attributes
  ) => {
    if (!isMetricsEnabled()) {
      return
    }
    const api = otelApis.getInstance()
    if (!api?.api.metrics) {
      return
    }
    const meter = api.api.metrics.getMeter(getServiceName(), getVersion())
    const histogram = meter.createHistogram(name, { unit: 'ms' })
    histogram.record(durationMs, toOtelAttributes(attributes))
  }

  const incrementCounter: OtelMetricsService['incrementCounter'] = (
    name,
    value,
    attributes
  ) => {
    if (!isMetricsEnabled()) {
      return
    }
    const api = otelApis.getInstance()
    if (!api?.api.metrics) {
      return
    }
    const meter = api.api.metrics.getMeter(getServiceName(), getVersion())
    const counter = meter.createCounter(name)
    counter.add(value ?? 1, toOtelAttributes(attributes))
  }

  const createHistogram: OtelMetricsService['createHistogram'] = (
    name,
    options
  ) => {
    if (!isMetricsEnabled()) {
      return createNoopHistogram()
    }
    const api = otelApis.getInstance()
    if (!api?.api.metrics) {
      return createNoopHistogram()
    }
    const meter = api.api.metrics.getMeter(getServiceName(), getVersion())
    const histogram = meter.createHistogram(name, { unit: options?.unit })
    return {
      record: (value: number, attrs?: AttributesMap) => {
        histogram.record(value, toOtelAttributes(attrs))
      },
    }
  }

  const createCounter: OtelMetricsService['createCounter'] = (
    name,
    options
  ) => {
    if (!isMetricsEnabled()) {
      return createNoopCounter()
    }
    const api = otelApis.getInstance()
    if (!api?.api.metrics) {
      return createNoopCounter()
    }
    const meter = api.api.metrics.getMeter(getServiceName(), getVersion())
    const counter = meter.createCounter(name, { unit: options?.unit })
    return {
      add: (value?: number, attrs?: AttributesMap) => {
        counter.add(value, toOtelAttributes(attrs))
      },
    }
  }

  const metrics: OtelMetricsService = {
    recordDuration,
    incrementCounter,
    createHistogram,
    createCounter,
  }

  const emit: OtelLogsService['emit'] = record => {
    if (!isLogsEnabled()) {
      return
    }
    const api = otelApis.getInstance()
    if (!api?.logsApi.logs) {
      return
    }
    const logger = api.logsApi.logs.getLogger(getServiceName(), getVersion())
    logger.emit({
      body: record.body,
      severityNumber: record.severityNumber,
      severityText: record.severityText,
      attributes: record.attributes,
    })
  }

  const logs: OtelLogsService = { emit }

  const runWithTraceAndMetrics = <T>(
    options: RunWithTraceAndMetricsOptions,
    fn: () => T | Promise<T>
  ): T | Promise<T> => {
    const spanName = layerSpanName(
      options.layerName,
      options.domain,
      options.functionName
    )
    const metricAttrs = layerMetricAttrs(
      options.layerName,
      options.domain,
      options.functionName
    )
    const span = trace.startSpan(spanName, {
      attributes: idsToAttributes(options.getIds()),
    })
    const startMs = typeof Date.now === 'function' ? Date.now() : 0
    const endSpanAndRecordMetrics = () => {
      span.end()
      const durationMs =
        (typeof Date.now === 'function' ? Date.now() : 0) - startMs
      metrics.recordDuration('layer.function.duration', durationMs, metricAttrs)
      metrics.incrementCounter('layer.function.calls', 1, metricAttrs)
    }
    const result = fn()
    const isPromiseLike = isPromise(result)
    if (isPromiseLike) {
      return (result as Promise<T>)
        .then(r => {
          endSpanAndRecordMetrics()
          return r
        })
        .catch(e => {
          endSpanAndRecordMetrics()
          throw e
        })
    }
    endSpanAndRecordMetrics()
    return result
  }

  return {
    setupOtel,
    trace,
    metrics,
    logs,
    runWithTraceAndMetrics,
  }
}
