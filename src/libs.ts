import z, { ZodType } from 'zod'
import get from 'lodash/get.js'
import merge from 'lodash/merge.js'
import omit from 'lodash/omit.js'
import {
  JsonObj,
  ModelInstanceFetcher,
  OrmModel,
  PrimaryKeyType,
  DataDescription,
} from 'functional-models'
import { wrap } from './utils.js'
import {
  Config,
  CoreNamespace,
  LayerDescription,
  LogLevel,
  LogLevelNames,
  ErrorObject,
  CrossLayerProps,
  LogId,
  NilFunction,
  NilAnnotatedFunction,
  Response,
  XOR,
  AnnotatedFunctionProps,
  CommonContext,
  Logger,
  SyncNilFunction,
  CrossLayerLoggingOverrides,
} from './types.js'

/**
 * Wraps a function so it preserves its own properties while passing all arguments through.
 * Used to wrap feature functions without losing metadata attached to the original function.
 */
export const featurePassThrough = wrap

/**
 * Returns a validator that throws if the given dot-path key is absent from the config.
 * @param key - The dot-path key to check (e.g. `'@node-in-layers/core.apps'`).
 */
export const configHasKey = (key: string) => (config: Partial<Config>) => {
  if (get(config, key) === undefined) {
    throw new Error(`${key} was not found in config`)
  }
}

/**
 * Returns a validator that throws if the value at the given dot-path key is not an array.
 * @param key - The dot-path key to check.
 */
export const configItemIsArray = (key: string) => (config: Partial<Config>) => {
  if (Array.isArray(get(config, key)) === false) {
    throw new Error(`${key} must be an array`)
  }
}

const configItemIsType =
  (key: string, type: string) => (config: Partial<Config>) => {
    const theType = typeof get(config, key)
    if (theType !== type) {
      throw new Error(`${key} must be of type ${type}`)
    }
  }

const allAppsHaveAName = (config: Partial<Config>): boolean => {
  config[CoreNamespace.root]?.apps.find(app => {
    if (app.name === undefined) {
      throw new Error(`A configured app does not have a name.`)
    }
    return false
  })
  return true
}

const _getNamespaceProperty = (namespace: CoreNamespace, property: string) => {
  return `${namespace}.${property}`
}

const _logFormatIsArrayOrString = () => (config: Partial<Config>) => {
  const logFormat = get(
    config,
    _getNamespaceProperty(CoreNamespace.root, 'logging.logFormat')
  )
  if (!Array.isArray(logFormat) && typeof logFormat !== 'string') {
    throw new Error('logFormat must be an array or a string')
  }
}

const _configItemsToCheck: readonly ((config: Partial<Config>) => void)[] = [
  configHasKey('environment'),
  configHasKey('systemName'),
  configHasKey(_getNamespaceProperty(CoreNamespace.root, 'apps')),
  configItemIsArray(_getNamespaceProperty(CoreNamespace.root, 'apps')),
  configHasKey(_getNamespaceProperty(CoreNamespace.root, 'layerOrder')),
  configItemIsArray(_getNamespaceProperty(CoreNamespace.root, 'layerOrder')),
  allAppsHaveAName,
  configItemIsType(
    _getNamespaceProperty(CoreNamespace.root, 'logging.logLevel'),
    'string'
  ),
  _logFormatIsArrayOrString(),
]

/**
 * Validates a config object against all required structural checks.
 * Throws a descriptive error if any required field is missing or has the wrong type.
 * @param config - The config object to validate.
 */
export const validateConfig = (config: Partial<Config>) => {
  _configItemsToCheck.forEach(x => x(config))
}

/**
 * Converts a numeric {@link LogLevel} enum value to its uppercase string name.
 * @param logLevel - The numeric log level.
 */
export const getLogLevelName = (logLevel: LogLevel) => {
  switch (logLevel) {
    case LogLevel.TRACE:
      return 'TRACE'
    case LogLevel.DEBUG:
      return 'DEBUG'
    case LogLevel.INFO:
      return 'INFO'
    case LogLevel.WARN:
      return 'WARN'
    case LogLevel.ERROR:
      return 'ERROR'
    case LogLevel.SILENT:
      return 'SILENT'
    default:
      throw new Error(`Unhandled log level ${logLevel}`)
  }
}

/**
 * Converts a {@link LogLevelNames} string to its corresponding numeric {@link LogLevel} value.
 * @param logLevel - The log level name.
 */
export const getLogLevelNumber = (logLevel: LogLevelNames) => {
  switch (logLevel) {
    case LogLevelNames.trace:
      return LogLevel.TRACE
    case LogLevelNames.warn:
      return LogLevel.WARN
    case LogLevelNames.debug:
      return LogLevel.DEBUG
    case LogLevelNames.info:
      return LogLevel.INFO
    case LogLevelNames.error:
      return LogLevel.ERROR
    case LogLevelNames.silent:
      return LogLevel.SILENT
    default:
      throw new Error(`Unhandled log level ${logLevel}`)
  }
}

const _getLayerKey = (layerDescription: LayerDescription): string => {
  // Probably never going to have the first case.
  /* c8 ignore next */
  return Array.isArray(layerDescription)
    ? /* c8 ignore next */
      layerDescription.join('-')
    : (layerDescription as string)
}

/**
 * Given the complete ordered list of layers, returns a function that — for any given layer name —
 * returns the layers that come after it (i.e. are unavailable to it at load time).
 * Throws if the layer name is not recognized.
 * @param allLayers - The full ordered list of {@link LayerDescription} entries from config.
 */
export const getLayersUnavailable = (
  allLayers: readonly LayerDescription[]
) => {
  const layerToChoices: Record<string, string[]> = allLayers.reduce(
    (acc, layer, index) => {
      const antiLayers = allLayers.slice(index + 1)
      // If we are dealing with a composite, we need to break it up
      if (Array.isArray(layer)) {
        const compositeAnti = layer.reduce((inner, compositeLayer, i) => {
          // We don't want to give access to the composite layers further up ahead.
          const nestedAntiLayers = layer.slice(i + 1)
          return merge(inner, {
            [compositeLayer]: antiLayers.concat(nestedAntiLayers),
          })
        }, acc)
        return compositeAnti
      }
      const key = _getLayerKey(layer)
      return merge(acc, {
        [key]: allLayers.slice(index + 1),
      })
    },
    {}
  )
  return (layer: string) => {
    const choices = layerToChoices[layer]
    if (!choices) {
      throw new Error(`${layer} is not a valid layer choice`)
    }
    return choices
  }
}

/**
 * Type guard that returns `true` if the given value looks like a valid {@link Config} object.
 * @param obj - The value to test.
 */
export const isConfig = <TConfig extends Config>(obj: any): obj is TConfig => {
  if (typeof obj === 'string') {
    return false
  }
  return Boolean(
    get(obj, _getNamespaceProperty(CoreNamespace.root, 'layerOrder'))
  )
}

/**
 * @deprecated Creates a namespace string from a package name and domain name.
 * @param packageName - The package name
 * @param domain - The domain name
 * @returns
 */
export const getNamespace = (packageName: string, domain?: string) => {
  if (domain) {
    return `${packageName}/${domain}`
  }
  return packageName
}

/**
 * A no-op {@link ModelInstanceFetcher} that resolves with the primary key as-is.
 * Useful when no real data fetching is needed (e.g. in-memory or test scenarios).
 */
// @ts-ignore
export const DoNothingFetcher: ModelInstanceFetcher = (
  model: any,
  primarykey: PrimaryKeyType
): Promise<PrimaryKeyType> => Promise.resolve(primarykey)

/**
 * Converts an Error object to a standard ErrorObject structure.
 * This is an internal helper used by createErrorObject.
 *
 * @param error - The error to convert
 * @param code - The error code to use
 * @param message - The error message to use
 * @returns An ErrorObject representation of the error
 */
const _convertErrorToCause = (
  error: Error,
  code: string,
  message?: string
): ErrorObject => {
  // Prefer an explicit message if provided, then the error's own message/name
  const baseMessage = message || error.message || (error as any).name || code

  // Prefer stack for details when available; fall back to a concise string form
  const baseDetails =
    error.stack ||
    `${(error as any).name || 'Error'}: ${error.message || String(error)}`

  // Start with a basic error object
  const errorObj: ErrorObject = {
    error: {
      code,
      message: baseMessage,
      details: baseDetails,
    },
  }

  // Special handling for AggregateError (Node / JS aggregate errors)
  const aggregateErrors = get(error, 'errors', []) as Error[]
  if (Array.isArray(aggregateErrors) && aggregateErrors.length > 0) {
    const innerSummaries = aggregateErrors.map(e => {
      if (e instanceof Error) {
        return e.stack || `${e.name}: ${e.message || String(e)}`
      }
      return String(e)
    })

    const innerDetails = `Inner errors:\n${innerSummaries.join('\n')}`
    return merge({}, errorObj, {
      error: {
        details: `${baseDetails}\n${innerDetails}`,
        data: {
          ...(errorObj.error as any).data,
          aggregateErrors: innerSummaries,
        },
      },
    })
  }

  // Handle nested cause if available
  if (error.cause) {
    const causeObj = _convertErrorToCause(error.cause as Error, 'NestedError')

    return merge({}, errorObj, {
      error: {
        cause: causeObj.error,
      },
    })
  }
  // Not likely to ever happen
  /* c8 ignore next */
  return errorObj
}

/**
 * Creates a standardized error object for consistent error handling across the application.
 * This function handles all the logic for converting different error types to the standard format.
 *
 * @param code - A unique string code for the error
 * @param message - A user-friendly error message
 * @param error - Optional error object or details (can be any type - will be properly handled)
 * @returns A standardized error object conforming to the ErrorObject type
 */
export const createErrorObject = (
  code: string,
  message: string,
  error?: unknown
): ErrorObject => {
  // Create base error details
  const baseErrorObj = {
    error: {
      code,
      message,
    },
  }

  // Return early if no additional error information
  if (!error) {
    return baseErrorObj
  }

  // Handle different types of error input
  if (error instanceof Error) {
    const errorDetails = {
      error: {
        details: error.message,
        cause: _convertErrorToCause(error, 'CauseError'),
      },
    }
    // Add cause if available
    if (error.cause) {
      const causeObj = _convertErrorToCause(
        error.cause as Error,
        'CauseError',
        (error.cause as Error).message
      )

      return merge({}, baseErrorObj, errorDetails, {
        error: {
          cause: causeObj.error,
        },
      })
    }

    return merge({}, baseErrorObj, errorDetails)
  }

  if (typeof error === 'string') {
    return merge({}, baseErrorObj, {
      error: {
        details: error,
      },
    })
  }
  // For Record<string, JsonAble> or any object that can be serialized
  if (error !== null && typeof error === 'object' && !Array.isArray(error)) {
    // eslint-disable-next-line functional/no-try-statements
    try {
      // Test if it can be serialized
      JSON.stringify(error)
      return merge({}, baseErrorObj, {
        error: {
          data: error,
        },
      })
    } catch {
      // If not serializable, convert to string
      return merge({}, baseErrorObj, {
        error: {
          details: String(error),
        },
      })
    }
  }

  // Handle arrays or any other types
  return merge({}, baseErrorObj, {
    error: {
      details: String(error),
    },
  })
}

/**
 * Type guard that returns `true` if the given value conforms to the {@link ErrorObject} shape.
 * @param value - The value to test.
 */
export const isErrorObject = (value: unknown): value is ErrorObject => {
  if (!value) {
    return false
  }
  const error = get(value, 'error')
  if (!error) {
    return false
  }
  if (typeof error !== 'object' || error === null) {
    return false
  }
  if (!('code' in error)) {
    return false
  }
  if (!('message' in error)) {
    return false
  }
  return true
}

const stripLoggingOverridesFromCrossLayerProps = (
  crossLayerProps: CrossLayerProps
): CrossLayerProps => {
  if (!get(crossLayerProps, 'logging.overrides')) {
    return crossLayerProps
  }
  const logging = crossLayerProps.logging || {}
  const loggingWithoutOverrides = omit(merge({}, logging), 'overrides')
  return merge({}, omit(crossLayerProps, 'logging'), {
    logging: loggingWithoutOverrides,
  }) as CrossLayerProps
}

/**
 * Builds a {@link CrossLayerProps} object by merging the logger's current ids with any
 * ids already present in the provided cross-layer props. Ensures ids are deduplicated.
 * {@link CrossLayerProps.logging.overrides} from the input are not included in the result
 * so they do not propagate past this hop.
 * @param logger - The current logger (used to extract its id stack).
 * @param crossLayerProps - Any existing cross-layer props to merge into.
 */
export const createCrossLayerProps = (
  logger: Logger,
  crossLayerProps?: CrossLayerProps
) => {
  const ids = logger.getIds()
  const base = crossLayerProps
    ? stripLoggingOverridesFromCrossLayerProps(crossLayerProps)
    : ({} as CrossLayerProps)
  return combineCrossLayerProps(base, { logging: { ids } })
}

/**
 * Merges {@link CrossLayerLoggingOverrides} into optional base {@link CrossLayerProps}
 * for the next downstream call (for example from a feature into a service). The base
 * should include `logging.ids` from your layer entry so the last argument is still
 * recognized as {@link CrossLayerProps}.
 *
 * @example
 * ```typescript
 * const next = crossLayerPropsWithLoggingOverrides({ omitData: true }, crossLayerProps)
 * await context.services.myDomain.doThing(args, next)
 * ```
 * @param overrides - Override flags for this hop only.
 * @param crossLayerProps - Existing cross-layer props from your function (optional).
 */
export const crossLayerPropsWithLoggingOverrides = (
  overrides: CrossLayerLoggingOverrides,
  crossLayerProps?: CrossLayerProps
): CrossLayerProps => {
  const base = crossLayerProps || ({} as CrossLayerProps)
  const prevLogging = base.logging || {}
  return merge({}, base, {
    logging: merge({}, prevLogging, {
      overrides: merge({}, prevLogging.overrides || {}, overrides),
    }),
  }) as CrossLayerProps
}

/**
 * Merges two {@link CrossLayerProps} objects together. Deduplicates logging ids, preferring
 * ids already present in `crossLayerPropsA`.
 * @param crossLayerPropsA - The base cross-layer props (its ids take precedence).
 * @param crossLayerPropsB - Additional cross-layer props to merge in.
 */
export const combineCrossLayerProps = <
  TIn1 extends CrossLayerProps,
  TIn2 extends CrossLayerProps = CrossLayerProps,
>(
  crossLayerPropsA: TIn1,
  crossLayerPropsB: TIn2
): TIn1 & TIn2 => {
  const loggingData = crossLayerPropsA.logging || {}
  const ids = loggingData.ids || []
  const currentIds = crossLayerPropsB.logging?.ids || []

  //start with logger ids
  const existingIds = ids.reduce(
    (acc, obj) => {
      return Object.entries(obj).reduce((accKeys, [key, value]) => {
        return merge(accKeys, { [`${key}:${value}`]: key })
      }, acc)
    },
    {} as Record<string, string>
  )

  //start with cross layer ids
  const unique = currentIds.reduce(
    (acc, passedIn) => {
      const keys = Object.entries(passedIn)
      const newKeys = keys
        .filter(([key, value]) => !(`${key}:${value}` in existingIds))
        .map(([key, value]) => ({ [key]: value }))
      if (newKeys.length > 0) {
        return acc.concat(newKeys)
      }
      return acc
    },
    [] as readonly LogId[]
  )

  const finalIds = ids.concat(unique)
  const otherPropsA = omit(crossLayerPropsA, 'logging')
  const otherPropsB = omit(crossLayerPropsB, 'logging')
  return merge({}, otherPropsA, otherPropsB, {
    logging: merge(
      {
        ids: finalIds,
      },
      loggingData
    ),
  }) as TIn1 & TIn2
}

/**
 * Zod schema for ErrorObject (exported for external validation/unions)
 */
export const errorObjectSchema = (): z.ZodType<ErrorObject> =>
  z.object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.string().optional(),
      data: z.record(z.string(), z.any()).optional(),
      trace: z.string().optional(),
      cause: z.any().optional(),
    }),
  })

/**
 * Creates a crossLayerProps available function that is also annotated with Zod.
 * @param props - The arguments
 * @param implementation - Your function
 * @returns A function with a "schema" property. NOTE: This will take a sync function and turn it into an async function.
 */
export const annotatedFunction = <
  TProps extends JsonObj,
  TOutput extends XOR<JsonObj, void>,
  TImplementation extends XOR<
    NilFunction<TProps, TOutput>,
    SyncNilFunction<TProps, TOutput>
  > = NilFunction<TProps, TOutput>,
>(
  props: AnnotatedFunctionProps<TProps, TOutput>,
  implementation: TImplementation
): NilAnnotatedFunction<TProps, TOutput> & TImplementation => {
  const base = z
    .function()
    .input([props.args, z.custom<CrossLayerProps>().optional()])

  const outputSchema = (() => {
    // No returns schema: assume void
    if (!props.returns) {
      return z.xor([z.void(), errorObjectSchema()]) as unknown as ZodType<
        Response<void>
      >
    }
    // Build Response<returns> = returns | ErrorObject
    return z.xor([props.returns, errorObjectSchema()]) as unknown as ZodType<
      Response<Exclude<TOutput, void>>
    >
  })()

  const fn = base.output(outputSchema)
  const schema = props.description ? fn.describe(props.description) : fn

  const implemented = schema.implementAsync(async (...args: any[]) => {
    // @ts-ignore
    const result = await implementation(...args)
    return result
  })
  // @ts-ignore
  // eslint-disable-next-line functional/immutable-data
  implemented.schema = schema
  // @ts-ignore
  // eslint-disable-next-line functional/immutable-data
  implemented.functionName = props.functionName
  // @ts-ignore
  // eslint-disable-next-line functional/immutable-data
  implemented.domain = props.domain

  return implemented as unknown as NilAnnotatedFunction<TProps, TOutput> &
    TImplementation
}

/**
 * Creates standardized annotation function arguments. already typed.
 * @param args - Arguments.
 * @returns An AnnotatedFunctionProps object.
 */
export const annotationFunctionProps = <
  TProps extends JsonObj,
  TOutput extends JsonObj | void,
>(
  args: AnnotatedFunctionProps<TProps, TOutput>
) => args

/**
 * A helpful function for getting a model from a context.
 * Very useful for services that need to get a model from their own domain.
 * Throws an exception if the model is not found.
 * @param context - The context
 * @param domain - The domain of the model
 * @param modelName - The PluralName(s) of the model
 * @returns The model
 */
export const getModel = <
  T extends DataDescription,
  TConfig extends Config = Config,
>(
  context: CommonContext<TConfig>,
  domain: string,
  modelName: string
): OrmModel<T> => {
  const getter = get(
    context,
    `models.${domain}.getModels`
  ) as unknown as () => Record<string, OrmModel<T>>
  if (!getter) {
    throw new Error(`Model ${modelName} not found in domain ${domain}`)
  }
  const model = getter()[modelName] as OrmModel<T>
  if (!model) {
    throw new Error(`Model ${modelName} not found in domain ${domain}`)
  }
  return model
}
