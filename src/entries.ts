import omit from 'lodash/omit.js'
import * as globalsApp from './globals/index.js'
import * as layersApp from './layers.js'
import * as otelApp from './otel/index.js'
import { Config, CoreNamespace } from './types.js'
import { isPromise } from './utils.js'

/**
 * Loads a node in layers system.
 * 1. Reads the configuration (if not provided).
 * 2. Loads globals
 * 3. Sets up OTel (if configured) and merges otel services into context
 * 4. Loads all layers
 * @param args - The required arguments.
 */
export const loadSystem = async <TConfig extends Config = Config>(args: {
  environment: string
  config?: TConfig
}) => {
  const globalServices = globalsApp.services.create({
    environment: args.environment,
    /* c8 ignore next */
    workingDirectory: typeof process !== 'undefined' ? process.cwd() : '',
  })
  const globalFeatures = globalsApp.features.create({
    services: {
      // @ts-ignore
      [globalsApp.name]: globalServices,
    },
  })
  const globals = await globalFeatures.loadGlobals(
    args.config || args.environment
  )

  const otelServices = otelApp.services.create(
    globals as Parameters<typeof otelApp.services.create>[0]
  )
  const setupResult = otelServices.setupOtel()
  if (isPromise(setupResult)) {
    await setupResult
  }

  const layersServices = layersApp.services.create()
  // @ts-ignore - services includes layers + otel; layer context types do not declare otel
  const layersFeatures = layersApp.features.create({
    ...globals,
    services: {
      [layersApp.name]: layersServices,
      [otelApp.name]: otelServices,
    },
  })
  const layers = await layersFeatures.loadLayers()
  return omit(layers, [`services.${CoreNamespace.layers}`])
}
