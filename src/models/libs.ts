import { PropertyType } from 'functional-models'
import { CommonContext, Config, CoreNamespace } from '../types.js'

/**
 * Resolves the primary key data type for a given model. Checks `modelNameToIdPropertyType` first,
 * then falls back to `modelIdPropertyType`, then defaults to `UniqueId` (UUID).
 * @param context - The common context containing the config.
 * @param domain - The domain namespace of the model.
 * @param name - The plural name of the model.
 */
export const getPrimaryKeyDataType = <TConfig extends Config = Config>(
  context: CommonContext<TConfig>,
  domain: string,
  name: string
) => {
  const modelNameToIdPropertyType =
    context.config[CoreNamespace.root].modelNameToIdPropertyType || {}
  const keyModelName = `${domain}/${name}`

  const dataType = modelNameToIdPropertyType[keyModelName]
    ? modelNameToIdPropertyType[keyModelName]
    : context.config[CoreNamespace.root].modelIdPropertyType ||
      PropertyType.UniqueId

  return dataType
}
