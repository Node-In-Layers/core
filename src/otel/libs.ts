import merge from 'lodash/merge.js'
import get from 'lodash/get.js'
import type {
  CommonContext,
  Config,
  LogId,
  LogMessage,
  LogMethod,
} from '../types.js'
import { CoreNamespace, LogLevelNames } from '../types.js'
import type {
  AttributesMap,
  CounterLike,
  HistogramLike,
  SpanLike,
  SpanWrappable,
} from './types.js'

const noop = (): void => undefined

/** Map NIL log level to OTel severity number (TRACE=1, DEBUG=5, INFO=9, WARN=13, ERROR=17). */
/* eslint-disable no-magic-numbers */
export const logLevelToOtelSeverity = (logLevel: LogLevelNames): number => {
  const map: Record<LogLevelNames, number> = {
    [LogLevelNames.trace]: 1,
    [LogLevelNames.debug]: 5,
    [LogLevelNames.info]: 9,
    [LogLevelNames.warn]: 13,
    [LogLevelNames.error]: 17,
    [LogLevelNames.silent]: 0,
  }
  return map[logLevel] ?? 9
}
/* eslint-enable no-magic-numbers */

/** Minimal shape we need from context.services[CoreNamespace.otel] for log forwarding. */
type OtelServicesForLogging = {
  logs?: {
    emit: (r: {
      body: string
      severityNumber?: number
      severityText?: string
      attributes?: Record<string, unknown>
    }) => void
  }
}

/**
 * Returns a LogMethod that forwards each LogMessage to context.services.otel.logs.emit when present.
 * Use with LogFormat.otel so the framework pipeline sends logs to OTel.
 */
export const createOtelLogMethod = <
  TConfig extends Config = Config,
>(): LogMethod<TConfig> => {
  return (context: CommonContext<TConfig>) => {
    const otel = get(context, `services.${CoreNamespace.otel}`) as
      | OtelServicesForLogging
      | undefined
    if (!otel?.logs?.emit) {
      return () => undefined
    }
    const emit = otel.logs.emit
    return (logMessage: LogMessage) => {
      const idAttrs = idsToAttributes(logMessage.ids)
      const attributes: Record<string, unknown> = {
        logger: logMessage.logger,
        environment: logMessage.environment,
        ...(idAttrs ?? {}),
      }
      emit({
        body: logMessage.message,
        severityNumber: logLevelToOtelSeverity(logMessage.logLevel),
        severityText: logMessage.logLevel,
        attributes: logMessage.error
          ? merge(attributes, { error: logMessage.error })
          : attributes,
      })
    }
  }
}

export const createNoopSpan = (): SpanLike => ({
  end: noop,
  setAttribute: noop as SpanLike['setAttribute'],
  setStatus: noop as SpanLike['setStatus'],
})

export const createNoopHistogram = (): HistogramLike => ({
  record: noop as HistogramLike['record'],
})

export const createNoopCounter = (): CounterLike => ({
  add: noop as CounterLike['add'],
})

/** Wrap a span-like object (e.g. from OTel API) to our SpanLike so app code does not depend on OTel types. */
export const wrapOtelSpan = (span: SpanWrappable): SpanLike => ({
  end: () => {
    span.end()
  },
  setAttribute: (key, value) => {
    span.setAttribute(key, value)
  },
  setStatus: status => {
    span.setStatus(status)
  },
})

export const toOtelAttributes = (
  attrs?: AttributesMap
): Record<string, unknown> | undefined => attrs

/** Span name for a layer function (used by framework when wrapping with OTel trace). */
export const layerSpanName = (
  layerName: string,
  domain: string,
  functionName: string
): string => `${layerName}:${domain}:${functionName}`

/** Metric attributes for a layer function (used by framework when recording duration/count). */
export const layerMetricAttrs = (
  layerName: string,
  domain: string,
  functionName: string
): AttributesMap => ({
  layer: layerName,
  domain: domain,
  function: functionName,
})

/**
 * Convert ids (e.g. from logger.getIds()) to OTel attributes.
 *
 * Multiple values for the same key are preserved by generating unique keys:
 *   [{ featureId: 'a' }, { featureId: 'b' }]
 *   -> { featureId: 'a', featureId-2: 'b' }
 *
 * This keeps AttributesMap simple (no array types) while still allowing
 * precise querying (e.g. on featureId, featureId-2, etc.).
 */
export const idsToAttributes = (
  ids: readonly LogId[] | undefined
): AttributesMap | undefined => {
  if (!ids?.length) {
    return undefined
  }

  // 1. Group values by key across all ids
  const grouped = ids.reduce(
    (acc, id) => {
      if (!id || typeof id !== 'object') {
        return acc
      }
      const entry = Object.entries(id)[0]
      if (!entry) {
        return acc
      }
      const [key, value] = entry
      if (value === undefined || value === null) {
        return acc
      }
      const v = value as string | number | boolean
      const existing = acc[key] ?? []
      return merge(acc, { [key]: [...existing, v] })
    },
    {} as Record<string, string[]>
  )

  // 2. For each key's values, generate key / key-2 / key-3 ... entries
  const entries = Object.entries(grouped).flatMap(([key, values]) =>
    values.map((v, idx) => {
      const finalKey = idx === 0 ? key : `${key}_${idx + 1}`
      return [finalKey, v] as [string, string]
    })
  )

  if (!entries.length) {
    return undefined
  }

  // 3. Reduce to a single AttributesMap
  const out = entries.reduce(
    (acc, [key, value]) => merge(acc, { [key]: value }),
    {} as Record<string, string>
  )

  return out as AttributesMap
}
