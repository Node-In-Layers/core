import z, { ZodType } from 'zod'
import get from 'lodash/get.js'
import merge from 'lodash/merge.js'
import omit from 'lodash/omit.js'
import { JsonObj, OrmModel, DataDescription } from 'functional-models'
import {
  Config,
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
 * Converts an Error object to a standard ErrorObject structure.
 * This is an internal helper used by createErrorObject.
 */
const _convertErrorToCause = (
  error: Error,
  code: string,
  message?: string
): ErrorObject => {
  const baseMessage = message || error.message || (error as any).name || code

  const baseDetails =
    error.stack ||
    `${(error as any).name || 'Error'}: ${error.message || String(error)}`

  const errorObj: ErrorObject = {
    error: {
      code,
      message: baseMessage,
      details: baseDetails,
    },
  }

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

  if (error.cause) {
    const causeObj = _convertErrorToCause(error.cause as Error, 'NestedError')

    return merge({}, errorObj, {
      error: {
        cause: causeObj.error,
      },
    })
  }
  /* c8 ignore next */
  return errorObj
}

/**
 * Creates a standardized error object for consistent error handling across the application.
 * @param code - A unique string code for the error
 * @param message - A user-friendly error message
 * @param error - Optional error object or details
 * @returns A standardized error object conforming to the ErrorObject type
 */
export const createErrorObject = (
  code: string,
  message: string,
  error?: unknown
): ErrorObject => {
  const baseErrorObj = {
    error: {
      code,
      message,
    },
  }

  if (!error) {
    return baseErrorObj
  }

  if (error instanceof Error) {
    const errorDetails = {
      error: {
        details: error.message,
        cause: _convertErrorToCause(error, 'CauseError'),
      },
    }
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
  if (error !== null && typeof error === 'object' && !Array.isArray(error)) {
    // eslint-disable-next-line functional/no-try-statements
    try {
      JSON.stringify(error)
      return merge({}, baseErrorObj, {
        error: {
          data: error,
        },
      })
    } catch {
      return merge({}, baseErrorObj, {
        error: {
          details: String(error),
        },
      })
    }
  }

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
 * ids already present in the provided cross-layer props.
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
 * for the next downstream call.
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
 * Merges two {@link CrossLayerProps} objects together. Deduplicates logging ids.
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

  const existingIds = ids.reduce(
    (acc, obj) => {
      return Object.entries(obj).reduce((accKeys, [key, value]) => {
        return merge(accKeys, { [`${key}:${value}`]: key })
      }, acc)
    },
    {} as Record<string, string>
  )

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
 * @returns A function with a "schema" property. NOTE: sync implementations become async.
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
    if (!props.returns) {
      return z.xor([z.void(), errorObjectSchema()]) as unknown as ZodType<
        Response<void>
      >
    }
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
