import get from 'lodash/get.js'
import merge from 'lodash/merge.js'
import omit from 'lodash/omit.js'
import { LogLevelNames, CrossLayerProps, Logger } from '../types.js'
import { combineCrossLayerProps } from '../libs.js'

const MAX_LOG_CHARACTERS = 50000

const defaultGetFunctionWrapLogLevel = (layerName: string): LogLevelNames => {
  switch (layerName) {
    case 'features':
    case 'entries':
      return LogLevelNames.info
    case 'services':
      return LogLevelNames.trace
    default:
      return LogLevelNames.debug
  }
}

/**
 * Gets the cross layer props and combines it with information from the logger.
 * Does this in a "smart" way.
 *
 * The result of this can be dumped directly into applyData.
 *
 * @param {Logger} logger
 * @param {CrossLayerProps} crossLayerProps
 */
const combineLoggingProps = (
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

const isCrossLayerLoggingProps = (
  maybe?: CrossLayerProps
): maybe is CrossLayerProps => {
  return Boolean(get(maybe, 'logging.ids'))
}

// eslint-disable-next-line consistent-return
const capForLogging = (input, maxSize = MAX_LOG_CHARACTERS) => {
  function safeStringify(obj) {
    // eslint-disable-next-line functional/no-try-statements
    try {
      return JSON.stringify(obj)
    } catch {
      return '[Unserializable]'
    }
  }

  const inputType = Array.isArray(input)
    ? 'array'
    : typeof input === 'object' && input !== null
      ? 'object'
      : 'other'
  if (inputType === 'other') {
    return input
  }

  if (safeStringify(input).length <= maxSize) {
    return input
  }

  if (inputType === 'array') {
    // Build a new truncated array functionally
    const build = (arr, idx) => {
      /* c8 ignore next line */
      if (idx >= input.length) {
        /* c8 ignore next line */
        return arr
        /* c8 ignore next line */
      }

      const nextArr = arr.concat(input[idx])
      if (
        safeStringify([
          ...nextArr,
          `[truncated, original length: ${input.length}]`,
        ]).length > maxSize
      ) {
        return arr.concat(`[truncated, original length: ${input.length}]`)
      }
      return build(nextArr, idx + 1)
    }
    return build([], 0)
  }

  if (inputType === 'object') {
    // Build a new truncated object functionally
    const keys = Object.keys(input)
    const build = (obj, idx) => {
      /* c8 ignore next line */
      if (idx >= keys.length) {
        /* c8 ignore next line */
        return obj
        /* c8 ignore next line */
      }
      const key = keys[idx]
      const nextObj = merge(obj, { [key]: input[key] })
      const truncated = merge(obj, {
        '[truncated]': `original keys: ${keys.length}`,
      })
      if (safeStringify(truncated).length > maxSize) {
        return truncated
      }
      return build(nextObj, idx + 1)
    }
    return build({}, 0)
  }
}

const trimTrailingUndefineds = (arr: any[]): any[] =>
  arr.length === 0 || arr[arr.length - 1] !== undefined
    ? arr
    : trimTrailingUndefineds(arr.slice(0, arr.length - 1))

const extractCrossLayerProps = (
  args: any[]
): [any[], CrossLayerProps | undefined] => {
  if (args.length === 0) {
    return [[], undefined]
  }

  const trimmed = trimTrailingUndefineds(args)

  if (trimmed.length < args.length) {
    return [trimmed, undefined]
  }

  const lastArg = trimmed[trimmed.length - 1]
  if (isCrossLayerLoggingProps(lastArg)) {
    return [trimmed.slice(0, trimmed.length - 1), lastArg]
  }
  return [trimmed, undefined]
}

export {
  defaultGetFunctionWrapLogLevel,
  combineLoggingProps,
  isCrossLayerLoggingProps,
  capForLogging,
  extractCrossLayerProps,
}
