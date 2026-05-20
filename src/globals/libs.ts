import get from 'lodash/get.js'
import merge from 'lodash/merge.js'
import omit from 'lodash/omit.js'
import { LogLevelNames, CrossLayerProps, Logger } from '../types.js'
import { combineCrossLayerProps } from '../libs.js'

const MAX_LOG_CHARACTERS = 50000

/**
 * Default wrap log level by layer name when config does not override.
 */
export const defaultGetFunctionWrapLogLevel = (
  layerName: string
): LogLevelNames => {
  switch (layerName) {
    case 'features':
    case 'entries':
      return LogLevelNames.info
    case 'services':
      return LogLevelNames.debug
    default:
      return LogLevelNames.debug
  }
}

/**
 * Gets the cross layer props and combines it with information from the logger.
 * @param logger - Logger with current id stack
 * @param crossLayerProps - Optional existing cross-layer props
 */
export const combineLoggingProps = (
  logger: Logger,
  crossLayerProps?: CrossLayerProps
) => {
  const merged = combineCrossLayerProps(
    {
      logging: {
        ids: logger.getIds(),
      },
    },
    crossLayerProps || {}
  ).logging
  if (!merged?.overrides) {
    return merged
  }
  return omit(merged, 'overrides')
}

/**
 * Type guard for cross-layer props that carry logging ids.
 */
export const isCrossLayerLoggingProps = (
  maybe?: CrossLayerProps
): maybe is CrossLayerProps => {
  return Boolean(get(maybe, 'logging.ids'))
}

const MAX_CAP_DEPTH = 18

const CAP_SHRINK_BUDGET_MIN = 120

const CAP_SHRINK_BUDGET_RATIO = 0.5

/**
 * Shrinks JSON-like `data` so JSON.stringify(result) tends to stay under `maxSize` characters.
 */
// eslint-disable-next-line consistent-return
export const capForLogging = (
  input,
  maxSize = MAX_LOG_CHARACTERS,
  depth = 0
) => {
  const stringifyLen = (value: unknown): number | null => {
    // eslint-disable-next-line functional/no-try-statements
    try {
      return JSON.stringify(value).length
    } catch {
      return null
    }
  }

  function safeStringify(obj) {
    // eslint-disable-next-line functional/no-try-statements
    try {
      return JSON.stringify(obj)
    } catch {
      return '[Unserializable]'
    }
  }

  if (depth > MAX_CAP_DEPTH) {
    return '[MaxDepth]'
  }

  if (input instanceof Date) {
    return input
  }

  const inputType = Array.isArray(input)
    ? 'array'
    : typeof input === 'object' && input !== null
      ? 'object'
      : 'other'
  if (inputType === 'other') {
    return input
  }

  const inputJsonLen = stringifyLen(input)
  if (inputJsonLen !== null && inputJsonLen <= maxSize) {
    return input
  }

  const subject =
    inputType === 'object'
      ? Object.fromEntries(
          Object.keys(input).map(key => {
            const v = input[key]
            const next =
              v !== null && typeof v === 'object'
                ? capForLogging(v, maxSize, depth + 1)
                : v
            return [key, next]
          })
        )
      : input

  const subjectJsonLen = stringifyLen(subject)
  if (subjectJsonLen !== null && subjectJsonLen <= maxSize) {
    return subject
  }

  if (Array.isArray(subject)) {
    const len = subject.length
    const build = (arr, idx) => {
      /* c8 ignore next line */
      if (idx >= len) {
        /* c8 ignore next line */
        return arr
        /* c8 ignore next line */
      }

      const el = subject[idx]
      const cappedEl =
        el !== null && typeof el === 'object'
          ? capForLogging(el, maxSize, depth + 1)
          : el
      const nextArr = arr.concat(cappedEl)
      if (
        safeStringify([...nextArr, `[truncated, original length: ${len}]`])
          .length > maxSize
      ) {
        return arr.concat(`[truncated, original length: ${len}]`)
      }
      return build(nextArr, idx + 1)
    }
    return build([], 0)
  }

  if (typeof subject === 'object' && subject !== null) {
    const keys = Object.keys(subject)
    const build = (obj, idx) => {
      /* c8 ignore next line */
      if (idx >= keys.length) {
        /* c8 ignore next line */
        return obj
        /* c8 ignore next line */
      }
      const key = keys[idx]
      const rawVal = subject[key]
      const cappedVal =
        rawVal !== null && typeof rawVal === 'object'
          ? capForLogging(rawVal, maxSize, depth + 1)
          : rawVal
      const nextObj = merge({}, obj, { [key]: cappedVal })
      const truncated = merge({}, obj, {
        '[truncated]': `original keys: ${keys.length}`,
      })
      if (safeStringify(truncated).length > maxSize) {
        const shrunk = capForLogging(
          obj,
          Math.max(
            CAP_SHRINK_BUDGET_MIN,
            Math.min(Math.floor(maxSize * CAP_SHRINK_BUDGET_RATIO), maxSize - 1)
          ),
          depth + 1
        )
        const base =
          typeof shrunk === 'object' &&
          shrunk !== null &&
          !Array.isArray(shrunk)
            ? shrunk
            : { _value: shrunk }
        const withNote = merge(base, {
          '[truncated]': `original keys: ${keys.length}`,
        })
        if (safeStringify(withNote).length <= maxSize) {
          return withNote
        }
        return {
          '[truncated]': `original keys: ${keys.length}`,
          retainedKeys: Object.keys(obj),
        }
      }
      return build(nextObj, idx + 1)
    }
    return build({}, 0)
  }
  return '[MaxSize]'
}
