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
import { capForLogging } from '../globals/libs.js'
import {
  createNoopCounter,
  createNoopHistogram,
  createNoopSpan,
  layerMetricAttrs,
  layerSpanName,
  spanAttributesFromIds,
  spanKindForLayer,
  toOtelAttributes,
  wrapOtelSpan,
} from './internal-libs.js'
import type {
  AttributesMap,
  OtelLogsService,
  OtelMetricsService,
  OtelServices,
  OtelTraceService,
  RunWithTraceAndMetricsOptions,
  SpanContextLike,
  SpanWrappable,
} from './types.js'

type OtelTracer = {
  startSpan: (
    name: string,
    options?: {
      attributes?: Record<string, unknown>
      kind?: number
    }
  ) => SpanWrappable
  startActiveSpan?: <T>(
    name: string,
    options: { attributes?: Record<string, unknown>; kind?: number },
    fn: (span: SpanWrappable) => T
  ) => T
}
type OtelTraceApi = {
  getTracer: (name: string, version?: string) => OtelTracer
  getActiveSpan: () => SpanWrappable | undefined
  setSpan: (context: unknown, span: SpanWrappable) => unknown
}
type OtelContextApi = {
  active: () => unknown
  with: <T>(context: unknown, fn: () => T) => T
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
  context: OtelContextApi
}

type OtelLogEmitRecord = {
  body?: string
  severityNumber?: number
  severityText?: string
  attributes?: Record<string, unknown>
  traceId?: string
  spanId?: string
}
type OtelLogger = { emit: (record: OtelLogEmitRecord) => void }
type OtelLogsApi = {
  getLogger: (name: string, version?: string) => OtelLogger
}
type CachedOtelLogsApi = {
  logs: OtelLogsApi
}

const SPAN_STATUS_ERROR = 2
const SPAN_KIND_INTERNAL = 0

const _recordWrapSpanEvents = (
  rawSpan: SpanWrappable,
  options: RunWithTraceAndMetricsOptions,
  context: ServicesContext<Config>,
  phase: 'start' | 'end',
  result?: unknown
): void => {
  if (!rawSpan.addEvent || !options.wrapSpanEvents) {
    return
  }
  const wrap = options.wrapSpanEvents
  if (wrap.omitWrapPayload) {
    return
  }
  const maxLogChars =
    context.config[CoreNamespace.root].logging.maxLogSizeInCharacters
  if (phase === 'start' && wrap.argsForExecuting !== undefined) {
    rawSpan.addEvent('nil.execute.start', {
      args: capForLogging(wrap.argsForExecuting, maxLogChars),
    })
    return
  }
  if (phase === 'end' && wrap.recordResult && result !== undefined) {
    rawSpan.addEvent('nil.execute.end', {
      result: capForLogging(result, maxLogChars),
    })
  }
}

export const create = (context: ServicesContext<Config>): OtelServices => {
  const _getOtelConfig = (): OtelConfig | undefined =>
    context.config[CoreNamespace.root].logging?.otel

  const _isTraceEnabled = memoizeValueSync(
    (): boolean => _getOtelConfig()?.trace?.enabled === true
  )
  const _isMetricsEnabled = memoizeValueSync(
    (): boolean => _getOtelConfig()?.metrics?.enabled === true
  )
  const _isLogsEnabled = memoizeValueSync(
    (): boolean => _getOtelConfig()?.logs?.enabled === true
  )

  const _getServiceName = (): string =>
    _getOtelConfig()?.serviceName ??
    context.config.systemName ??
    'node-in-layers'
  const _getVersion = (): string => _getOtelConfig()?.version ?? '1.0.0'

  const _otelApis = requiresInitialization(async () => {
    const otelConfig = _getOtelConfig()
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
    await _otelApis.initialize()
  }

  const _getActiveSpanContext = (): SpanContextLike | undefined => {
    const cached = _otelApis.getInstance()
    const active = cached?.api.trace?.getActiveSpan?.()
    const spanContext = active?.spanContext?.()
    if (spanContext?.traceId && spanContext?.spanId) {
      return { traceId: spanContext.traceId, spanId: spanContext.spanId }
    }
    return undefined
  }

  const _endSpanWithStatus = (
    rawSpan: SpanWrappable,
    error?: unknown
  ): void => {
    if (error !== undefined) {
      rawSpan.setStatus({
        code: SPAN_STATUS_ERROR,
        message: error instanceof Error ? error.message : String(error),
      })
    }
    rawSpan.end()
  }

  const _runInActiveSpan = <T>(
    spanName: string,
    attributes: Record<string, unknown> | undefined,
    kind: number,
    onComplete: (durationMs: number, hadError: boolean) => void,
    runFn: (rawSpan: SpanWrappable) => T | Promise<T>
  ): T | Promise<T> => {
    if (!_isTraceEnabled()) {
      return runFn(createNoopSpan() as unknown as SpanWrappable)
    }
    const cached = _otelApis.getInstance()
    if (!cached?.api.trace) {
      return runFn(createNoopSpan() as unknown as SpanWrappable)
    }
    const tracer = cached.api.trace.getTracer(_getServiceName(), _getVersion())
    const startMs = typeof Date.now === 'function' ? Date.now() : 0
    const spanOptions = { attributes, kind }

    const _runInsideSpan = (rawSpan: SpanWrappable): T | Promise<T> => {
      const _finish = (error?: unknown) => {
        _endSpanWithStatus(rawSpan, error)
        const durationMs =
          (typeof Date.now === 'function' ? Date.now() : 0) - startMs
        onComplete(durationMs, error !== undefined)
      }

      // eslint-disable-next-line functional/no-try-statements
      try {
        const result = runFn(rawSpan)
        if (isPromise(result)) {
          return (result as Promise<T>)
            .then(r => {
              _finish()
              return r
            })
            .catch(e => {
              _finish(e)
              throw e
            })
        }
        _finish()
        return result
      } catch (e) {
        _finish(e)
        throw e
      }
    }

    if (tracer.startActiveSpan) {
      return tracer.startActiveSpan(spanName, spanOptions, _runInsideSpan)
    }

    const rawSpan = tracer.startSpan(spanName, spanOptions)
    const ctx = cached.api.trace.setSpan(cached.api.context.active(), rawSpan)
    return cached.api.context.with(ctx, () => _runInsideSpan(rawSpan))
  }

  const startSpan: OtelTraceService['startSpan'] = (name, options) => {
    if (!_isTraceEnabled()) {
      return createNoopSpan()
    }
    const api = _otelApis.getInstance()
    if (!api?.api.trace) {
      return createNoopSpan()
    }
    const tracer = api.api.trace.getTracer(_getServiceName(), _getVersion())
    const span = tracer.startSpan(name, {
      attributes: toOtelAttributes(options?.attributes),
    })
    return wrapOtelSpan(span)
  }

  const runWithSpan: OtelTraceService['runWithSpan'] = (name, fn, options) => {
    return _runInActiveSpan(
      name,
      toOtelAttributes(options?.attributes),
      SPAN_KIND_INTERNAL,
      () => undefined,
      rawSpan => Promise.resolve(fn(wrapOtelSpan(rawSpan)))
    )
  }

  const getActiveSpan: OtelTraceService['getActiveSpan'] = () => {
    if (!_isTraceEnabled()) {
      return undefined
    }
    const api = _otelApis.getInstance()
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
    if (!_isMetricsEnabled()) {
      return
    }
    const api = _otelApis.getInstance()
    if (!api?.api.metrics) {
      return
    }
    const meter = api.api.metrics.getMeter(_getServiceName(), _getVersion())
    const histogram = meter.createHistogram(name, { unit: 'ms' })
    histogram.record(durationMs, toOtelAttributes(attributes))
  }

  const incrementCounter: OtelMetricsService['incrementCounter'] = (
    name,
    value,
    attributes
  ) => {
    if (!_isMetricsEnabled()) {
      return
    }
    const api = _otelApis.getInstance()
    if (!api?.api.metrics) {
      return
    }
    const meter = api.api.metrics.getMeter(_getServiceName(), _getVersion())
    const counter = meter.createCounter(name)
    counter.add(value ?? 1, toOtelAttributes(attributes))
  }

  const createHistogram: OtelMetricsService['createHistogram'] = (
    name,
    options
  ) => {
    if (!_isMetricsEnabled()) {
      return createNoopHistogram()
    }
    const api = _otelApis.getInstance()
    if (!api?.api.metrics) {
      return createNoopHistogram()
    }
    const meter = api.api.metrics.getMeter(_getServiceName(), _getVersion())
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
    if (!_isMetricsEnabled()) {
      return createNoopCounter()
    }
    const api = _otelApis.getInstance()
    if (!api?.api.metrics) {
      return createNoopCounter()
    }
    const meter = api.api.metrics.getMeter(_getServiceName(), _getVersion())
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
    if (!_isLogsEnabled()) {
      return
    }
    const api = _otelApis.getInstance()
    if (!api?.logsApi.logs) {
      return
    }
    const logger = api.logsApi.logs.getLogger(_getServiceName(), _getVersion())
    const spanContext = _getActiveSpanContext()
    logger.emit({
      body: record.body,
      severityNumber: record.severityNumber,
      severityText: record.severityText,
      attributes: record.attributes,
      traceId: spanContext?.traceId,
      spanId: spanContext?.spanId,
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
    const spanAttrs = spanAttributesFromIds(
      options.getIds(),
      options.layerName,
      options.domain,
      options.functionName
    )
    const kind = spanKindForLayer(options.layerName)

    return _runInActiveSpan(
      spanName,
      spanAttrs,
      kind,
      (durationMs, hadError) => {
        metrics.recordDuration(
          'layer.function.duration',
          durationMs,
          metricAttrs
        )
        metrics.incrementCounter('layer.function.calls', 1, metricAttrs)
        if (hadError) {
          metrics.incrementCounter('layer.function.errors', 1, {
            ...metricAttrs,
            'error.code': 'INTERNAL_ERROR',
          })
        } else {
          metrics.incrementCounter('layer.function.success', 1, metricAttrs)
        }
      },
      rawSpan => {
        _recordWrapSpanEvents(rawSpan, options, context, 'start')
        const _run = () => {
          const result = fn()
          if (isPromise(result)) {
            return (result as Promise<T>).then(r => {
              _recordWrapSpanEvents(rawSpan, options, context, 'end', r)
              return r
            })
          }
          _recordWrapSpanEvents(rawSpan, options, context, 'end', result)
          return result
        }
        return _run()
      }
    )
  }

  return {
    setupOtel,
    trace,
    metrics,
    logs,
    runWithTraceAndMetrics,
  }
}
