import get from 'lodash/get.js'
import { CrossLayerProps } from '../types.js'

const isCrossLayerLoggingProps = (
  maybe?: CrossLayerProps
): maybe is CrossLayerProps => {
  return Boolean(get(maybe, 'logging.ids'))
}

const trimTrailingUndefineds = (arr: any[]): any[] =>
  arr.length === 0 || arr[arr.length - 1] !== undefined
    ? arr
    : trimTrailingUndefineds(arr.slice(0, arr.length - 1))

/**
 * Separates trailing {@link CrossLayerProps} from function call arguments.
 * @param args - Layer function arguments
 */
export const extractCrossLayerProps = (
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
