import {
  Config,
  FeaturesContext,
  ModelCrudsFunctions,
  ServicesContext,
} from './types.js'

/**
 * A factory for creating the service layer.
 */
export type ServicesLayerFactory<
  TConfig extends Config = Config,
  TServices extends object = object,
  TContext extends object = object,
  TLayer extends object = object,
> = Readonly<{
  create: (context: ServicesContext<TConfig, TServices, TContext>) => TLayer
}>

/**
 * A factory for creating the features layer.
 */
export type FeaturesLayerFactory<
  TConfig extends Config = Config,
  TContext extends object = object,
  TServices extends object = object,
  TFeatures extends object = object,
  TLayer extends object = object,
> = Readonly<{
  create: (
    context: FeaturesContext<TConfig, TServices, TFeatures, TContext>
  ) => TLayer
}>

/**
 * A services context that exposes CRUDS model services.
 */
export type ModelCrudsServicesContext<
  TModels extends Record<string, ModelCrudsFunctions<any>>,
  TConfig extends Config = Config,
  TServices extends object = object,
  TContext extends object = object,
> = ServicesContext<
  TConfig,
  TServices & {
    cruds: TModels
  },
  TContext
>
