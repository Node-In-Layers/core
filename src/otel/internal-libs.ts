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
import { capForLogging } from '../globals/libs.js'
import type {
  AttributesMap,
  CounterLike,
  HistogramLike,
  SpanLike,
  SpanWrappable,
} from './types.js'

const noop = (): void => undefined

/** Prefix for correlation id attributes on OTel log/span export. */
export const OTEL_ID_ATTRIBUTE_PREFIX = 'id_'

const FRAMEWORK_OTEL_LOG_KEYS = new Set([
  'id',
  'logger',
  'environment',
  'logLevel',
  'message',
  'datetime',
  'domain',
  'layer',
  'function',
  'model',
  'error',
  'args',
  'result',
])

const isIdOtelAttributeKey = (key: string): boolean =>
  key.startsWith(OTEL_ID_ATTRIBUTE_PREFIX)

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
 * Convert ids to OTel attributes with {@link OTEL_ID_ATTRIBUTE_PREFIX} on each key.
 */
export const idsToOtelAttributes = (
  ids: readonly LogId[] | undefined
): AttributesMap | undefined => {
  const flat = idsToAttributes(ids)
  if (!flat) {
    return undefined
  }
  const entries = Object.entries(flat).map(
    ([key, value]) =>
      [`${OTEL_ID_ATTRIBUTE_PREFIX}${key}`, value] as [string, string]
  )
  return Object.fromEntries(entries) as AttributesMap
}

/**
 * Convert ids (e.g. from logger.getIds()) to flat OTel attribute keys (unprefixed).
 * Used internally before applying {@link OTEL_ID_ATTRIBUTE_PREFIX}.
 */
export const idsToAttributes = (
  ids: readonly LogId[] | undefined
): AttributesMap | undefined => {
  if (!ids?.length) {
    return undefined
  }

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

  const entries = Object.entries(grouped).flatMap(([key, values]) =>
    values.map((v, idx) => {
      const finalKey = idx === 0 ? key : `${key}_${idx + 1}`
      return [finalKey, v] as [string, string]
    })
  )

  if (!entries.length) {
    return undefined
  }

  const out = entries.reduce(
    (acc, [key, value]) => merge(acc, { [key]: value }),
    {} as Record<string, string>
  )

  return out as AttributesMap
}

const capOtelPayloadValue = (
  value: unknown,
  maxLogChars: number | undefined
): unknown => {
  if (value === undefined) {
    return undefined
  }
  return capForLogging(value, maxLogChars)
}

/**
 * Maps a {@link LogMessage} to flat OTel log attributes.
 * Caps only args, result, error, and custom fields — never ids (id_*) or framework envelope.
 */
export const logMessageToOtelAttributes = <TConfig extends Config = Config>(
  logMessage: LogMessage,
  context: CommonContext<TConfig>
): Record<string, unknown> => {
  const maxLogChars =
    context.config[CoreNamespace.root].logging.maxLogSizeInCharacters

  const idAttrs = idsToOtelAttributes(logMessage.ids) ?? {}
  const messageRecord = logMessage as Record<string, unknown>
  const envelope = {
    id: logMessage.id,
    logger: logMessage.logger,
    environment: logMessage.environment,
    logLevel: logMessage.logLevel,
    message: logMessage.message,
    datetime:
      logMessage.datetime instanceof Date
        ? logMessage.datetime.toISOString()
        : String(logMessage.datetime),
    ...idAttrs,
  }

  const layerAttrs = (['domain', 'layer', 'function', 'model'] as const).reduce(
    (acc, key) => {
      const value = messageRecord[key]
      return value === undefined ? acc : merge(acc, { [key]: value })
    },
    {} as Record<string, unknown>
  )

  const cappedKnown = merge(
    {},
    messageRecord.args !== undefined
      ? { args: capOtelPayloadValue(messageRecord.args, maxLogChars) }
      : {},
    messageRecord.result !== undefined
      ? { result: capOtelPayloadValue(messageRecord.result, maxLogChars) }
      : {},
    messageRecord.error !== undefined
      ? { error: capOtelPayloadValue(messageRecord.error, maxLogChars) }
      : {}
  )

  const customAttrs = Object.entries(messageRecord).reduce(
    (acc, [key, value]) => {
      if (FRAMEWORK_OTEL_LOG_KEYS.has(key) || isIdOtelAttributeKey(key)) {
        return acc
      }
      if (
        key === 'domain' ||
        key === 'layer' ||
        key === 'function' ||
        key === 'model' ||
        key === 'args' ||
        key === 'result' ||
        key === 'error'
      ) {
        return acc
      }
      return merge(acc, { [key]: capOtelPayloadValue(value, maxLogChars) })
    },
    {} as Record<string, unknown>
  )

  return merge({}, envelope, layerAttrs, cappedKnown, customAttrs)
}

/**
 * Returns a LogMethod that forwards each LogMessage to context.services.otel.logs.emit when present.
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
      const attributes = logMessageToOtelAttributes(logMessage, context)
      emit({
        body: logMessage.message,
        severityNumber: logLevelToOtelSeverity(logMessage.logLevel),
        severityText: logMessage.logLevel,
        attributes: logMessage.error
          ? merge(attributes, {
              error: attributes.error ?? logMessage.error,
            })
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

export const layerSpanName = (
  layerName: string,
  domain: string,
  functionName: string
): string => `${layerName}:${domain}:${functionName}`

export const layerMetricAttrs = (
  layerName: string,
  domain: string,
  functionName: string
): AttributesMap => ({
  layer: layerName,
  domain: domain,
  function: functionName,
})

/** OpenTelemetry SpanKind.INTERNAL */
export const SPAN_KIND_INTERNAL = 0
/** OpenTelemetry SpanKind.SERVER */
export const SPAN_KIND_SERVER = 1
/** OpenTelemetry SpanKind.CLIENT */
export const SPAN_KIND_CLIENT = 2

export const spanKindForLayer = (layerName: string): number => {
  if (layerName === 'services') {
    return SPAN_KIND_CLIENT
  }
  if (layerName === 'entries' || layerName === 'features') {
    return SPAN_KIND_SERVER
  }
  return SPAN_KIND_INTERNAL
}

export const spanAttributesFromIds = (
  ids: readonly LogId[] | undefined,
  layerName: string,
  domain: string,
  functionName: string
): Record<string, unknown> => {
  return {
    ...idsToOtelAttributes(ids),
    domain,
    layer: layerName,
    function: functionName,
  }
}
