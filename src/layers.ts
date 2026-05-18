import get from 'lodash/get.js'
import flatten from 'lodash/flatten.js'
import omit from 'lodash/omit.js'
import merge from 'lodash/merge.js'
import cloneDeep from 'lodash/cloneDeep.js'
import { DataDescription, Model, ModelType } from 'functional-models'
import { extractCrossLayerProps } from './globals/libs.js'
import {
  App,
  AppLayer,
  CommonContext,
  Config,
  CoreNamespace,
  FeaturesContext,
  GenericLayer,
  GetModelPropsFunc,
  LayerContext,
  LayerServices,
  LayerServicesLayer,
  MaybePromise,
  ModelConstructor,
  ModelCrudsFactory,
  ModelProps,
  PartialModelProps,
  ServicesContext,
  ModelCrudsFunctions,
} from './types.js'
import {
  createCrossLayerProps,
  DoNothingFetcher,
  getLayersUnavailable,
} from './libs.js'
import { memoizeValueSync } from './utils.js'
import { OtelServicesLayer } from './otel/types.js'
import {
  getForeignKeyProperty,
  getPrimaryKeyProperty,
  createModelCruds,
} from './models/internal-libs.js'

const CONTEXT_TO_SKIP = {
  _logging: true,
  rootLogger: true,
  log: true,
  constants: true,
  config: true,
  models: true,
  getModels: true,
  cruds: true,
}

const name = CoreNamespace.layers

const modelGetter = <
  TConfig extends Config = Config,
  TModelOverrides extends object = object,
  TModelInstanceOverrides extends object = object,
>(
  context: CommonContext<TConfig>,
  apps: readonly App[],
  modelProps: PartialModelProps
) => {
  const memoized = {}
  // We have to create a self reference, so we have to set this to null, and then overwrite it.
  // @ts-ignore
  // eslint-disable-next-line functional/no-let
  let getModel: (namespace: string, modelName: string) => any = null
  getModel = <T extends DataDescription>(
    namespace: string,
    modelName: string
  ) => {
    const app = apps.find(a => a.name === namespace)
    if (!app || !app.models) {
      throw new Error(
        `An app with models does not exist for namespace ${namespace}`
      )
    }

    const models = app.models
    const modelConstructor = models[modelName]
    if (!modelConstructor) {
      throw new Error(
        `A model named ${modelName} does not exist for namespace ${namespace}`
      )
    }
    if (!(namespace in memoized)) {
      // We are doing a memoized state so we need this
      // eslint-disable-next-line functional/immutable-data
      memoized[namespace] = {}
    }
    if (!(modelName in memoized)) {
      const func = memoizeValueSync(() =>
        modelConstructor.create<T, TModelOverrides, TModelInstanceOverrides>({
          context,
          ...modelProps,
          getModel,
          getPrimaryKeyProperty: getPrimaryKeyProperty(context),
          getForeignKeyProperty: getForeignKeyProperty(context),
        })
      )
      // We are doing a memoized state so we need this
      // eslint-disable-next-line functional/immutable-data
      memoized[namespace][modelName] = func
    }
    return memoized[namespace][modelName]
  }
  return getModel
}

const services = {
  create: (): LayerServices => {
    const getModelProps = <
      TConfig extends Config = Config,
      TModelOverrides extends object = object,
      TModelInstanceOverrides extends object = object,
    >(
      context: ServicesContext<TConfig>
    ) => {
      const fetcher = DoNothingFetcher
      const modelGetterInstance = modelGetter<
        TConfig,
        TModelOverrides,
        TModelInstanceOverrides
      >(context, context.config[CoreNamespace.root].apps, { Model, fetcher })
      return {
        context,
        Model,
        fetcher,
        getModel: modelGetterInstance,
        getPrimaryKeyProperty: getPrimaryKeyProperty(context),
        getForeignKeyProperty: getForeignKeyProperty(context),
      }
    }

    const loadLayer = (
      app: App,
      layer: string,
      context: LayerContext
    ): MaybePromise<GenericLayer | undefined> => {
      const constructor: AppLayer<any, any> | undefined = get(app, `${layer}`)
      if (!constructor?.create) {
        return undefined
      }

      const instance = constructor.create(context)
      if (!instance) {
        throw new Error(
          `App ${app.name} did not return an instance layer ${layer}`
        )
      }
      return instance
    }

    return {
      getModelProps,
      loadLayer,
    }
  },
}

const isPromise = <T>(t: any): t is Promise<T> => {
  if (!t) {
    return false
  }
  return Boolean(t.then)
}

const features = {
  create: (
    context: CommonContext &
      LayerServicesLayer & { services: OtelServicesLayer }
  ) => {
    type LayerRecord = Record<string, Record<string, object>>
    const layerOrder = context.config[CoreNamespace.root].layerOrder
    const orderedLayers = layerOrder.reduce<string[]>(
      (acc, layer) =>
        Array.isArray(layer)
          ? acc.concat(layer as string[])
          : acc.concat(layer as string),
      []
    )
    const featuresLayerIndex = orderedLayers.indexOf('features')
    // eslint-disable-next-line functional/no-let
    let finalizedServicesDomains: Record<string, any> | undefined
    // eslint-disable-next-line functional/no-let
    let finalizedFeaturesDomains: Record<string, any> | undefined

    const _canAccessFeatures = (layer: string): boolean => {
      if (featuresLayerIndex === -1) {
        return false
      }
      const layerIndex = orderedLayers.indexOf(layer)
      return layerIndex >= featuresLayerIndex
    }

    const _getServices = <TService extends Record<string, any>>(
      domain: string
    ): TService | undefined => {
      return finalizedServicesDomains?.[domain] as TService | undefined
    }

    const _getFeatures = <TFeature extends Record<string, any>>(
      domain: string
    ): TFeature | undefined => {
      return finalizedFeaturesDomains?.[domain] as TFeature | undefined
    }

    const _addFinalizedDomainGetters = (
      layerContext: LayerContext,
      currentLayer: string
    ): LayerContext => {
      const withServices = merge({}, layerContext, {
        services: {
          getServices: _getServices,
        },
      })
      if (!_canAccessFeatures(currentLayer)) {
        return withServices
      }
      return merge({}, withServices, {
        features: {
          getFeatures: _getFeatures,
        },
      })
    }

    const _getLayerContext = (
      commonContext: LayerContext,
      layer: LayerRecord | undefined
    ) => {
      if (layer) {
        return merge({}, commonContext, layer)
      }
      return commonContext
    }

    const _resolveCrudsFactory = (
      layer: string,
      domain: string,
      model: string
    ): ModelCrudsFactory => {
      const defaultFactory: ModelCrudsFactory = (m, _ctx, opts) => {
        return createModelCruds(m, opts)
      }

      const configFactory =
        context.config['@node-in-layers/core'].modelCrudsFactory
      if (!configFactory) {
        return defaultFactory
      }
      if (typeof configFactory === 'function') {
        return configFactory
      }

      const override = configFactory.find(o => {
        if (o.layer && o.layer !== layer) {
          return false
        }
        if (o.domain && o.domain !== domain) {
          return false
        }
        if (o.model && o.model !== model) {
          return false
        }
        return true
      })
      return override ? override.factory : defaultFactory
    }

    const _getModelLoadedContext = (
      app: App,
      currentLayer: string,
      layerContext: LayerContext
    ): LayerContext => {
      const layerContextWithGetters = _addFinalizedDomainGetters(
        layerContext,
        currentLayer
      )
      if (app.models) {
        // If this is services, we need to load models first if they exist
        if (currentLayer === 'services') {
          const mfNamespace =
            context.config['@node-in-layers/core'].modelFactory ||
            CoreNamespace.layers
          const customMf =
            context.config['@node-in-layers/core'].customModelFactory || {}
          const defaultMf =
            // @ts-ignore
            layerContextWithGetters.services[mfNamespace] ||
            context.services[mfNamespace]
          if (!defaultMf) {
            throw new Error(
              `Namespace ${mfNamespace} does not have a services object`
            )
          }
          if (!defaultMf.getModelProps) {
            throw new Error(
              `Namespace ${mfNamespace} does not have a services object with a getModelProps(context: ServicesContext) function`
            )
          }
          const models: Record<string, ModelConstructor> = app.models
          // This function is added to the services context.
          const getModels = memoizeValueSync(() => {
            const defaultModelProps = defaultMf.getModelProps(
              layerContextWithGetters
            )
            const modelsObj = Object.entries(models).reduce(
              (acc, [modelName, constructor]) => {
                // Do we have a custom model props for this?
                const custom = get(customMf, `${app.name}.${modelName}`)
                const isCustomArray = Array.isArray(custom)
                const customArgs = isCustomArray ? custom.slice(1) : []
                const customModelProps = custom
                  ? isCustomArray
                    ? get(
                        layerContextWithGetters,
                        `services[${custom[0]}].getModelProps`
                      )
                    : get(
                        layerContextWithGetters,
                        `services[${custom}].getModelProps`
                      )
                  : undefined
                if (custom && !customModelProps) {
                  throw new Error(
                    `Configuration requires that Model named ${modelName} receive a model props from ${custom}`
                  )
                }
                const partialModelProps: PartialModelProps = customModelProps
                  ? (customModelProps as GetModelPropsFunc)(
                      layerContextWithGetters as ServicesContext,
                      // @ts-ignore (Cross layer props comes automatically)
                      ...customArgs
                    )
                  : defaultModelProps
                if (!constructor.create) {
                  throw new Error(
                    'Model constructor must have a create function'
                  )
                }

                const getModel = modelGetter(
                  context,
                  context.config['@node-in-layers/core'].apps,
                  partialModelProps
                )

                const modelProps: ModelProps = {
                  context: layerContextWithGetters,
                  ...partialModelProps,
                  getModel,
                  getPrimaryKeyProperty: getPrimaryKeyProperty(context),
                  getForeignKeyProperty: getForeignKeyProperty(context),
                }

                const instance = constructor.create(modelProps)
                return merge(acc, {
                  [modelName]: instance,
                })
              },
              {} as Record<string, ModelType<any>>
            )
            return modelsObj
          })

          const serviceCruds = context.config['@node-in-layers/core'].modelCruds
            ? Object.keys(models).reduce((acc, name) => {
                const factory = _resolveCrudsFactory(
                  currentLayer,
                  app.name,
                  name
                )
                return merge(acc, {
                  [name]: factory(
                    () => getModels()[name],
                    layerContextWithGetters
                  ),
                })
              }, {})
            : undefined

          return merge(
            {},
            layerContextWithGetters,
            serviceCruds
              ? {
                  services: {
                    [app.name]: {
                      cruds: serviceCruds,
                    },
                  },
                }
              : {},
            {
              models: {
                [app.name]: {
                  getModels,
                },
              },
            }
          )
        } else if (
          currentLayer === 'features' &&
          context.config['@node-in-layers/core'].modelCruds
        ) {
          // We need to add the feature wrappers over service level wrappers.
          const serviceWrappers: [string, ModelCrudsFunctions<any>][] =
            // @ts-ignore
            Object.entries(
              get(layerContextWithGetters, `services.${app.name}.cruds`, {})
            )
          // @ts-ignore
          const featureWrappers = serviceWrappers.reduce(
            (acc, [name, cruds]) => {
              const factory = _resolveCrudsFactory(currentLayer, app.name, name)
              return merge(acc, {
                [name]: factory<any>(
                  () => cruds.getModel(),
                  layerContextWithGetters,
                  {
                    overrides: cruds,
                  }
                ),
              })
            },
            {}
          )

          return merge({}, layerContextWithGetters, {
            features: {
              [app.name]: {
                cruds: featureWrappers,
              },
            },
          })
        }
      }
      return layerContextWithGetters
    }

    const _loadLayer = async (
      app: App,
      currentLayer: string,
      commonContext: LayerContext,
      previousLayer: LayerRecord | undefined
    ): Promise<LayerRecord> => {
      const layerContext1 = _getModelLoadedContext(
        app,
        currentLayer,
        _getLayerContext(commonContext, previousLayer)
      )
      const layerLogger = context.rootLogger
        .getLogger(layerContext1)
        .getAppLogger(app.name)
        .getLayerLogger(currentLayer)
      const layerContext = cloneDeep(
        // eslint-disable-next-line functional/immutable-data
        Object.assign(layerContext1, {
          log: layerLogger,
        })
      )

      const ignoreLayerFunctions = merge(
        commonContext.config[CoreNamespace.root].logging
          ?.ignoreLayerFunctions || {},
        {
          // We want to always ignore OTEL functions for wrapping.
          [`${CoreNamespace.otel}.services`]: true,
        }
      )

      if (
        !commonContext.config[CoreNamespace.root].noModelLogWrap &&
        layerContext[currentLayer]?.[app.name]?.cruds
      ) {
        const domainLevelKey = app.name
        const layerLevelKey = `${app.name}.${currentLayer}`
        if (
          !get(ignoreLayerFunctions, layerLevelKey) &&
          !get(ignoreLayerFunctions, domainLevelKey)
        ) {
          const crudsContainer = layerContext[currentLayer][app.name].cruds
          Object.entries(crudsContainer).forEach(([modelName, crudsObj]) => {
            const modelLevelKey = `${app.name}.${currentLayer}.${modelName}`
            const globalModelLevelKey = `${app.name}.*.${modelName}`
            if (
              !get(ignoreLayerFunctions, modelLevelKey) &&
              !get(ignoreLayerFunctions, globalModelLevelKey)
            ) {
              Object.entries(crudsObj as object).forEach(([funcName, func]) => {
                const functionLevelKey = `${app.name}.${currentLayer}.${modelName}.${funcName}`
                if (
                  !get(ignoreLayerFunctions, functionLevelKey) &&
                  typeof func === 'function' &&
                  funcName !== 'getModel'
                ) {
                  const newFunc = merge(
                    layerLogger._logWrap(
                      `cruds:${modelName}:${funcName}`,
                      merge((log, ...args2) => {
                        const [argsNoCrossLayer, crossLayer] =
                          extractCrossLayerProps(args2)
                        // @ts-ignore
                        return func(
                          ...argsNoCrossLayer,
                          createCrossLayerProps(log, crossLayer)
                        )
                      }, func),
                      { model: modelName }
                    ),
                    func
                  )
                  // eslint-disable-next-line functional/immutable-data
                  crudsContainer[modelName][funcName] = newFunc
                }
              })
            }
          })
        }
      }

      const wrappedContext = Object.entries(layerContext).reduce(
        (acc, [layerKey, layerData]) => {
          const layerType = typeof layerData
          if (layerKey in CONTEXT_TO_SKIP || layerType !== 'object') {
            return merge(acc, { [layerKey]: layerData })
          }
          const finalLayerData = Object.entries(layerData).reduce(
            (acc2, [domainKey, domainValue]) => {
              const theType = typeof domainValue
              // We are only looking for objects with functions
              if (theType !== 'object') {
                return merge(acc2, { [domainKey]: domainValue })
              }

              // Are we going to ignore any log wrapping for this domain's whole layer??
              const layerLevelKey = `${domainKey}.${layerKey}`
              if (get(ignoreLayerFunctions, layerLevelKey)) {
                return merge(acc2, { [domainKey]: domainValue })
              }

              const domainData = Object.entries(domainValue).reduce(
                (acc3, [propertyName, func]) => {
                  const funcType = typeof func
                  // We are only looking for objects with functions
                  if (funcType !== 'function') {
                    return merge(acc3, { [propertyName]: func })
                  }

                  // Are we going to ignore this function from wrapping
                  const functionLevelKey = `${domainKey}.${layerKey}.${propertyName}`
                  if (get(ignoreLayerFunctions, functionLevelKey)) {
                    return merge(acc3, { [propertyName]: func })
                  }

                  // WE HAVE TO MERGE the function on top. If we are wrapping, we can loose annotated information.
                  const newFunc = merge((...args2) => {
                    const [argsNoCrossLayer, crossLayer] =
                      extractCrossLayerProps(args2)
                    // Forward raw crossLayerProps so downstream layer _logWrap can read
                    // logging.overrides (e.g. omitData) before createCrossLayerProps strips them.
                    // @ts-ignore
                    return func(
                      ...argsNoCrossLayer,
                      crossLayer !== undefined
                        ? crossLayer
                        : createCrossLayerProps(layerLogger, undefined)
                    )
                  }, func)
                  return merge(acc3, { [propertyName]: newFunc })
                },
                {}
              )
              return merge(acc2, { [domainKey]: domainData })
            },
            {} as any
          )
          return merge(acc, {
            [layerKey]: finalLayerData,
          })
        },
        {}
      )

      const layer = context.services[CoreNamespace.layers].loadLayer(
        app,
        currentLayer,
        // @ts-ignore
        //layerContext
        wrappedContext
      )
      // We need to wrap all the layer functions so that they automatically pass trace information
      const theLayer = isPromise<GenericLayer>(layer) ? await layer : layer

      if (!theLayer) {
        return {}
      }

      // Are we going to ignore any log wrapping for this domain's whole layer??
      const layerLevelKey = `${app.name}.${currentLayer}`
      const shouldIgnore = get(ignoreLayerFunctions, layerLevelKey)

      const finalLayer = shouldIgnore
        ? theLayer
        : Object.entries(theLayer).reduce((acc, [propertyName, func]) => {
            const funcType = typeof func
            // We are only looking for objects with functions
            if (funcType !== 'function') {
              return merge(acc, { [propertyName]: func })
            }

            // Are we going to ignore this function from wrapping
            const functionLevelKey = `${app.name}.${currentLayer}.${propertyName}`
            if (get(ignoreLayerFunctions, functionLevelKey)) {
              return merge(acc, { [propertyName]: func })
            }

            const newFunc = merge(
              layerLogger._logWrap(
                propertyName,
                merge((log, ...args2) => {
                  const [argsNoCrossLayer, crossLayer] =
                    extractCrossLayerProps(args2)
                  // Automatically create the crossLayerProps
                  // @ts-ignore
                  return func(
                    ...argsNoCrossLayer,
                    createCrossLayerProps(log, crossLayer)
                  )
                }, func)
              ),
              func
            )
            return merge(acc, { [propertyName]: newFunc })
          }, {})

      return merge(
        {
          [currentLayer]: {
            [app.name]: finalLayer,
          },
        },
        layerContext
      )
    }

    const _loadCompositeLayer = async (
      app: App,
      currentLayer: readonly string[],
      commonContext: LayerContext,
      previousLayer: LayerRecord | undefined,
      antiLayers: (layer: string) => readonly string[]
    ): Promise<LayerRecord> => {
      return currentLayer.reduce(async (previousSubLayersP, layer) => {
        const previousSubLayers = isPromise(previousSubLayersP)
          ? await previousSubLayersP
          : previousSubLayersP

        const layersToRemove = antiLayers(layer)
        // We need common context PLUS the previous layers.
        const theContext1 = omit(
          merge({}, commonContext, previousSubLayers),
          layersToRemove
        )
        const layerLogger = context.rootLogger
          // @ts-ignore
          .getLogger(theContext1)
          .getAppLogger(app.name)
          .getLayerLogger(layer)
        // eslint-disable-next-line
        const theContext = Object.assign(theContext1, {
          log: layerLogger,
        })
        const layerContext = _addFinalizedDomainGetters(
          _getLayerContext(theContext as LayerContext, previousLayer),
          layer
        )

        const ignoreLayerFunctions =
          commonContext.config[CoreNamespace.root].logging
            ?.ignoreLayerFunctions || {}

        const wrappedContext = Object.entries(layerContext).reduce(
          (acc, [layerKey, layerData]) => {
            const layerType = typeof layerData
            if (layerKey in CONTEXT_TO_SKIP || layerType !== 'object') {
              return merge(acc, { [layerKey]: layerData })
            }
            const finalLayerData = Object.entries(layerData).reduce(
              (acc2, [domainKey, domainValue]) => {
                const theType = typeof domainValue
                // We are only looking for objects with functions
                if (theType !== 'object') {
                  return merge(acc2, { [domainKey]: domainValue })
                }

                // Are we going to ignore any log wrapping for this domain's whole layer??
                const layerLevelKey = `${domainKey}.${layerKey}`
                if (get(ignoreLayerFunctions, layerLevelKey)) {
                  return merge(acc2, { [domainKey]: domainValue })
                }

                const domainData = Object.entries(domainValue).reduce(
                  (acc3, [propertyName, func]) => {
                    const funcType = typeof func
                    // We are only looking for objects with functions
                    if (funcType !== 'function') {
                      return merge(acc3, { [propertyName]: func })
                    }

                    // Are we going to ignore this function from wrapping
                    const functionLevelKey = `${domainKey}.${layerKey}.${propertyName}`
                    if (get(ignoreLayerFunctions, functionLevelKey)) {
                      return merge(acc3, { [propertyName]: func })
                    }

                    const newFunc = merge((...args2) => {
                      const [argsNoCrossLayer, crossLayer] =
                        extractCrossLayerProps(args2)
                      // Forward raw crossLayerProps so downstream layer _logWrap can read
                      // logging.overrides (e.g. omitData) before createCrossLayerProps strips them.
                      // @ts-ignore
                      return func(
                        ...argsNoCrossLayer,
                        crossLayer !== undefined
                          ? crossLayer
                          : createCrossLayerProps(layerLogger, undefined)
                      )
                    }, func)
                    return merge(acc3, { [propertyName]: newFunc })
                  },
                  {}
                )
                return merge(acc2, { [domainKey]: domainData })
              },
              {} as any
            )
            return merge(acc, {
              [layerKey]: finalLayerData,
            })
          },
          {}
        )

        const loadedLayer = context.services[CoreNamespace.layers].loadLayer(
          app,
          layer,
          // @ts-ignore
          wrappedContext
        )
        if (!loadedLayer) {
          return previousSubLayers
        }

        const theLayer = isPromise(loadedLayer)
          ? await loadedLayer
          : loadedLayer

        // Are we going to ignore any log wrapping for this domain's whole layer??
        const layerLevelKey = `${app.name}.${layer}`
        const shouldIgnore = get(ignoreLayerFunctions, layerLevelKey)

        const finalLayer = shouldIgnore
          ? theLayer
          : // @ts-ignore
            Object.entries(theLayer).reduce((acc, [propertyName, func]) => {
              const funcType = typeof func
              // We are only looking for objects with functions
              if (funcType !== 'function') {
                return merge(acc, { [propertyName]: func })
              }
              // Are we going to ignore this function from wrapping
              const functionLevelKey = `${app.name}.${layer}.${propertyName}`
              if (get(ignoreLayerFunctions, functionLevelKey)) {
                return merge(acc, { [propertyName]: func })
              }
              const newFunc = merge(
                layerLogger._logWrap(
                  propertyName,
                  merge((log, ...args2) => {
                    const [argsNoCrossLayer, crossLayer] =
                      extractCrossLayerProps(args2)
                    // Automatically create the crossLayerProps
                    // @ts-ignore
                    return func(
                      ...argsNoCrossLayer,
                      createCrossLayerProps(log, crossLayer)
                    )
                  }, func)
                ),
                func
              )
              return merge(acc, { [propertyName]: newFunc })
            }, {})

        // We have to create a NEW context to be passed along each time. If we put acc as the first arg, all the other sub-layers will magically get things they can't have.
        const result = merge({}, previousSubLayers, {
          [layer]: {
            [app.name]: finalLayer,
          },
        })
        return result
      }, {})
    }

    const loadLayers = (): Promise<FeaturesContext> => {
      const layersInOrder = context.config[CoreNamespace.root].layerOrder
      const antiLayers = getLayersUnavailable(layersInOrder)
      const coreLayersToIgnore = [CoreNamespace.layers, CoreNamespace.globals]
        .map(l => `services.${l}`)
        .concat(
          [CoreNamespace.layers, CoreNamespace.globals].map(
            l => `features.${l}`
          )
        )
      const startingContext = omit(context, coreLayersToIgnore) as CommonContext

      // @ts-ignore
      return context.config[CoreNamespace.root].apps.reduce<
        Promise<FeaturesContext>
      >(
        async (existingLayersP, app): Promise<FeaturesContext> => {
          const existingLayers = await existingLayersP
          type R = [LayerContext, LayerRecord]
          const result = await layersInOrder.reduce<Promise<R>>(
            async (accP, layer): Promise<R> => {
              const acc = await accP
              const [existingLayers2, previousLayer] = acc
              const layersToRemove = Array.isArray(layer)
                ? // Remove the composite layers from the anti-layers, this will be handled in the composite layer
                  flatten(layer.map(antiLayers)).filter(
                    x => layer.find(y => x === y) === false
                  )
                : antiLayers(layer as string)

              // We have to remove existing layers that we don't want to be exposed.
              const correctContext = omit(
                existingLayers,
                layersToRemove.concat('log')
              ) as LayerContext
              const layerInstance = await (Array.isArray(layer)
                ? _loadCompositeLayer(
                    app,
                    layer as string[],
                    correctContext,
                    previousLayer,
                    antiLayers
                  )
                : _loadLayer(
                    app,
                    layer as string,
                    correctContext,
                    previousLayer
                  ))
              if (!layerInstance) {
                return [existingLayers2, {}]
              }
              const newContext: LayerContext = merge(
                {},
                existingLayers2,
                layerInstance
              )
              // @ts-ignore
              // eslint-disable-next-line
              delete newContext.log
              return [newContext, layerInstance as LayerRecord]
            },
            Promise.resolve([existingLayers, {}]) as Promise<
              [LayerContext, LayerRecord]
            >
          )
          const finalContext = _addFinalizedDomainGetters(
            result[0] as LayerContext,
            'features'
          ) as FeaturesContext
          finalizedServicesDomains = finalContext.services
          finalizedFeaturesDomains = finalContext.features
          return finalContext
        },
        Promise.resolve(startingContext) as Promise<FeaturesContext>
      ) as Promise<FeaturesContext>
    }
    return {
      loadLayers,
    }
  },
}

export { name, services, features }
