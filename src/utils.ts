import merge from 'lodash/merge.js'
import { v4 } from 'uuid'
import AsyncLock from 'async-lock'
import { addSeconds } from 'date-fns/addSeconds'
import { isBefore } from 'date-fns/isBefore'
import type { Maybe, State, RequiresInitialization } from './types.js'

/**
 * Wraps a function so that the returned wrapper carries all properties of the original function.
 * This allows metadata (e.g. schema, name) attached to `fn` to remain accessible on the wrapper.
 * @param fn - The function to wrap.
 */
export const wrap = <T extends Array<any>, U>(fn: (...args: T) => U) => {
  return merge((...args: T): U => fn(...args), fn)
}

/**
 * Type guard that returns `true` if the given value is a Promise (has a `.then` method).
 * @param obj - The value to test.
 */
export const isPromise = <T>(obj: any): obj is Promise<T> => {
  return Boolean(obj && obj.then)
}

/**
 * Wraps a sync-or-async function so it always returns a `Promise`, while preserving the
 * original function's properties on the returned wrapper.
 * @param fn - The function to wrap.
 */
export const promiseWrap = <T extends Array<any>, U>(
  fn: (...args: T) => Promise<U> | U
) => {
  return merge(
    (...args: T): Promise<U> => Promise.resolve().then(() => fn(...args)),
    fn
  )
}

/**
 * Memoizes a synchronous function so it is only called once; subsequent calls return the cached value.
 * If the first call throws, the error propagates and the function is NOT marked as called,
 * so a subsequent call will retry.
 * @param method - The function to memoize.
 */
export const memoizeValueSync = <T, A extends Array<any>>(
  method: (...args: A) => T
) => {
  /* eslint-disable functional/no-let */
  let value: any = undefined
  let called = false
  return (...args: A) => {
    if (!called) {
      value = method(...args)
      // This is very important that it goes afterwards. Sometimes this will throw an exception.
      // and if one caller happened to catch it and move on, then this will never throw again, which
      // likely means that we won't know what the heck happened.
      called = true
    }

    return value
  }
  /* eslint-enable functional/no-let */
}

/**
 * Memoizes an async (or sync-or-async) function so it is only called once; subsequent calls
 * return the cached resolved value. Uses an async lock to prevent concurrent initialization.
 * @param method - The function to memoize.
 */
export const memoizeValue = <T, A extends Array<any>>(
  method: (...args: A) => T | Promise<T>
): ((...args: A) => Promise<T>) => {
  const key = v4()
  const lock = new AsyncLock()
  /* eslint-disable functional/no-let */
  let value: any = undefined
  let called = false
  return async (...args: A) => {
    return lock.acquire(key, async () => {
      if (!called) {
        value = await method(...args)
        // Read above about this.
        // eslint-disable-next-line require-atomic-updates
        called = true
      }

      return value as T
    })
  }
  /* eslint-enable functional/no-let */
}

export const timeCacheAsync = <T, A extends Array<any>>(
  ttlSecondsFromNow: number,
  method: (...args: A) => Promise<T>
) => {
  const expiresAt = addSeconds(new Date(), ttlSecondsFromNow)
  const key = v4()
  const lock = new AsyncLock()
  /* eslint-disable functional/no-let */
  let value: any = undefined
  let called = false
  return async (...args: A) => {
    return lock.acquire(key, async () => {
      if (isBefore(expiresAt, new Date())) {
        called = false
      }
      if (!called) {
        value = await method(...args)
        // Read above about this.
        // eslint-disable-next-line require-atomic-updates
        called = true
      }

      return value as T
    })
  }
  /* eslint-enable functional/no-let */
}

/**
 * Wraps an object that needs to be explicitly initialized before use.
 * @param initializer - A function that returns a promise of the object to be initialized.
 * @returns A RequiresInitialization object.
 */
export const requiresInitialization = <T>(
  initializer: () => Promise<T>
): RequiresInitialization<T> => {
  // eslint-disable-next-line functional/no-let
  let initialized = false
  // eslint-disable-next-line functional/no-let
  let instance: T | undefined = undefined

  const initialize = async () => {
    instance = await initializer()
    initialized = true
  }

  const getInstance = (): T => {
    if (!initialized) {
      throw new Error('Instance not initialized')
    }
    return instance as unknown as T
  }

  return {
    isInitialized: () => initialized,
    getInstance,
    initialize,
  }
}

/**
 * A wrapper around an instance, that may or may not have a value.
 * @param _instance - The instance to wrap.
 * @returns A Maybe object.
 */
export const maybe = <T>(_instance: T | undefined): Maybe<T> => {
  return {
    instance: () => _instance,
    hasValue: () => _instance !== undefined,
  }
}

/**
 * An object that can be changed over time.
 * @returns A State object.
 */
export const state = <T>(): State<T> => {
  // eslint-disable-next-line functional/no-let
  let _instance: T | undefined = undefined

  const set = (value: T) => {
    _instance = value
  }

  const get = () => {
    return maybe(_instance)
  }

  return {
    get,
    set,
  }
}
