import {
  DataDescription,
  OrmModel,
  OrmModelInstance,
  OrmSearch,
  OrmSearchResult,
  PrimaryKeyType,
  ToObjectResult,
  ForeignKeyProperty,
  ModelType,
  MaybeFunction,
  PrimaryKeyProperty,
  DatabaseKeyPropertyConfig,
} from 'functional-models'
import merge from 'lodash/merge.js'
import get from 'lodash/get.js'
import {
  CommonContext,
  Config,
  CoreNamespace,
  CrossLayerProps,
  ForeignKeyPropertyGetter,
  CrudsOptions,
  ModelCrudsFunctions,
} from '../types.js'
import { memoizeValueSync } from '../utils.js'
import { getPrimaryKeyDataType } from './libs.js'

/**
 * Builds the composite key used to look up model-specific configuration (e.g. primary key type).
 * Format: `domain/PluralModelName`
 */
export const createKeyModelName = (domain: string, modelPluralName: string) => {
  return `${domain}/${modelPluralName}`
}

/**
 * Resolves the primary key generator function for a given model.
 */
export const getPrimaryKeyGenerator = <TConfig extends Config = Config>(
  context: CommonContext<TConfig>,
  domain: string,
  name: string
) => {
  const modelNameToPrimaryKeyGenerator =
    context.config[CoreNamespace.root].modelNameToPrimaryKeyGenerator || {}
  const keyModelName = createKeyModelName(domain, name)

  const primaryKeyGenerator = modelNameToPrimaryKeyGenerator[keyModelName]
    ? modelNameToPrimaryKeyGenerator[keyModelName]
    : context.config[CoreNamespace.root].primaryKeyGenerator

  return primaryKeyGenerator
}

export const getPrimaryKeyProperty =
  <TConfig extends Config = Config>(context: CommonContext<TConfig>) =>
  <T extends PrimaryKeyType = PrimaryKeyType>(
    domain: string,
    modelPluralName: string,
    config?: DatabaseKeyPropertyConfig<T>
  ): ReturnType<typeof PrimaryKeyProperty<T>> => {
    const dataType = getPrimaryKeyDataType(context, domain, modelPluralName)
    const primaryKeyGenerator = getPrimaryKeyGenerator(
      context,
      domain,
      modelPluralName
    )
    return PrimaryKeyProperty<T>(
      merge({}, config, {
        dataType,
        primaryKeyGenerator,
      })
    )
  }

export const getForeignKeyProperty =
  <TConfig extends Config = Config>(
    context: CommonContext<TConfig>
  ): ForeignKeyPropertyGetter =>
  <T extends PrimaryKeyType = PrimaryKeyType>(
    domain: string,
    modelPluralName: string,
    model: MaybeFunction<ModelType<any>>,
    config?: Omit<DatabaseKeyPropertyConfig<T>, 'auto' | 'primaryKeyGenerator'>
  ) => {
    const dataType = getPrimaryKeyDataType(context, domain, modelPluralName)
    return ForeignKeyProperty(
      model,
      merge({}, config, {
        dataType,
      })
    )
  }

/**
 * Creates Model Cruds for a given model.
 * @param model - The model to wrap
 * @param options - Additional options and overrides
 */
export const createModelCruds = <TData extends DataDescription>(
  model: OrmModel<TData> | (() => OrmModel<TData>),
  options?: CrudsOptions<TData>
): ModelCrudsFunctions<TData> => {
  const _getModel = memoizeValueSync((): OrmModel<TData> => {
    if (typeof model === 'function') {
      return model()
    }
    return model
  })

  const createFunction = <IgnoreProperties extends string = ''>(
    data: Omit<TData, IgnoreProperties> | ToObjectResult<TData>,
    crossLayerProps?: CrossLayerProps
  ): Promise<OrmModelInstance<TData>> => {
    const subCreate = get(options, 'overrides.create')
    if (subCreate) {
      return subCreate(data, crossLayerProps)
    }
    // @ts-ignore
    const instance = _getModel().create(data)
    return instance.save()
  }

  const retrieveFunction = (
    primaryKey: PrimaryKeyType,
    crossLayerProps?: CrossLayerProps
  ): Promise<OrmModelInstance<TData> | undefined> => {
    const subRetrieve = get(options, 'overrides.retrieve')
    if (subRetrieve) {
      return subRetrieve(primaryKey, crossLayerProps)
    }
    return _getModel().retrieve(primaryKey)
  }

  const searchFunction = (
    ormSearch: OrmSearch,
    crossLayerProps?: CrossLayerProps
  ): Promise<OrmSearchResult<TData>> => {
    const subSearch = get(options, 'overrides.search')
    if (subSearch) {
      return subSearch(ormSearch, crossLayerProps)
    }
    return _getModel().search(ormSearch)
  }

  const bulkInsertFunction = async (
    data: readonly TData[],
    crossLayerProps?: CrossLayerProps
  ): Promise<void> => {
    const subBulkInsert = get(options, 'overrides.bulkInsert')
    if (subBulkInsert) {
      await subBulkInsert(data, crossLayerProps)
      return undefined
    }
    const model = _getModel()
    await model.bulkInsert(data.map(x => model.create(x)))
    return undefined
  }

  const bulkDeleteFunction = async (
    primaryKeys: readonly PrimaryKeyType[],
    crossLayerProps?: CrossLayerProps
  ): Promise<void> => {
    const subBulkDelete = get(options, 'overrides.bulkDelete')
    if (subBulkDelete) {
      await subBulkDelete(primaryKeys, crossLayerProps)
      return undefined
    }
    await _getModel().bulkDelete(primaryKeys)
    return undefined
  }

  const updateFunction = (
    primaryKey: PrimaryKeyType,
    data: TData | ToObjectResult<TData>,
    crossLayerProps?: CrossLayerProps
  ): Promise<OrmModelInstance<TData>> => {
    const subUpdate = get(options, 'overrides.update')
    if (subUpdate) {
      return subUpdate(primaryKey, data, crossLayerProps)
    }
    const model = _getModel()
    const instance = model.create(
      merge({ [model.getModelDefinition().primaryKeyName]: primaryKey }, data)
    )
    return instance.save()
  }

  const deleteFunction = async (
    primaryKey: PrimaryKeyType,
    crossLayerProps?: CrossLayerProps
  ): Promise<void> => {
    const subDelete = get(options, 'overrides.delete')
    if (subDelete) {
      await subDelete(primaryKey, crossLayerProps)
      return undefined
    }
    await _getModel().delete(primaryKey)
    return undefined
  }

  return {
    getModel: _getModel,
    create: createFunction,
    retrieve: retrieveFunction,
    update: updateFunction,
    delete: deleteFunction,
    search: searchFunction,
    bulkInsert: bulkInsertFunction,
    bulkDelete: bulkDeleteFunction,
  }
}
