import get from 'lodash/get.js'
import merge from 'lodash/merge.js'
import { ModelInstanceFetcher, PrimaryKeyType } from 'functional-models'
import { wrap } from './utils.js'
import {
  Config,
  CoreConfig,
  CoreNamespace,
  Domain,
  LayerDescription,
  LogLevel,
  LogLevelNames,
} from './types.js'

/**
 * Wraps a function so it preserves its own properties while passing all arguments through.
 * Used to wrap feature functions without losing metadata attached to the original function.
 */
export const featurePassThrough = wrap

/**
 * Returns a validator that throws if the given dot-path key is absent from the config.
 * @param key - The dot-path key to check (e.g. `'@node-in-layers/core.domains'`).
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

/**
 * Returns loaded domains from core config, preferring `domains` over deprecated `apps`.
 * @param core - The core namespace config section.
 */
export const getCoreDomains = (core: CoreConfig): readonly Domain[] => {
  const domains = core.domains ?? core.apps
  if (!domains || domains.length === 0) {
    throw new Error(
      `${CoreNamespace.root}.domains (or deprecated apps) must be a non-empty array`
    )
  }
  return domains
}

const _coreHasDomainsOrApps = (config: Partial<Config>) => {
  const core = config[CoreNamespace.root]
  if (core?.domains === undefined && core?.apps === undefined) {
    throw new Error(
      `${CoreNamespace.root}.domains was not found in config (deprecated apps is also accepted)`
    )
  }
}

const _coreDomainsIsArray = (config: Partial<Config>) => {
  const core = config[CoreNamespace.root]
  const domains = core?.domains ?? core?.apps
  if (!Array.isArray(domains)) {
    throw new Error(`${CoreNamespace.root}.domains must be an array`)
  }
}

const allDomainsHaveAName = (config: Partial<Config>): boolean => {
  const core = config[CoreNamespace.root]
  if (!core) {
    return true
  }
  getCoreDomains(core).find(domain => {
    if (domain.name === undefined) {
      throw new Error(`A configured domain does not have a name.`)
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
  _coreHasDomainsOrApps,
  _coreDomainsIsArray,
  configHasKey(_getNamespaceProperty(CoreNamespace.root, 'layerOrder')),
  configItemIsArray(_getNamespaceProperty(CoreNamespace.root, 'layerOrder')),
  allDomainsHaveAName,
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
      if (Array.isArray(layer)) {
        const compositeAnti = layer.reduce((inner, compositeLayer, i) => {
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
