import { assert } from 'chai'
import {
  defaultGetFunctionWrapLogLevel,
  combineLoggingProps,
  isCrossLayerLoggingProps,
  capForLogging,
  extractCrossLayerProps,
} from '../../../src/globals/libs.js'
import {
  createCrossLayerProps,
  crossLayerPropsWithLoggingOverrides,
} from '../../../src/libs.js'
import { v4 } from 'uuid'

describe('/src/globals/libs.ts', () => {
  describe('#defaultGetFunctionWrapLogLevel()', () => {
    it('returns info for features', () => {
      assert.equal(defaultGetFunctionWrapLogLevel('features'), 'info')
    })
    it('returns info for entries', () => {
      assert.equal(defaultGetFunctionWrapLogLevel('entries'), 'info')
    })
    it('returns debug for services', () => {
      assert.equal(defaultGetFunctionWrapLogLevel('services'), 'trace')
    })
    it('returns debug for others', () => {
      assert.equal(defaultGetFunctionWrapLogLevel('something'), 'debug')
    })
  })

  describe('#isCrossLayerLoggingProps()', () => {
    it('returns true for cross layer props', () => {
      assert.isTrue(
        isCrossLayerLoggingProps({ logging: { ids: [{ a: '1' }] } })
      )
    })
    it('returns false for non-cross layer props', () => {
      assert.isFalse(isCrossLayerLoggingProps({}))
    })
  })

  describe('#capForLogging()', () => {
    it('returns non-objects unchanged (string)', () => {
      assert.equal(capForLogging('hello'), 'hello')
    })
    it('returns non-objects unchanged (number)', () => {
      assert.equal(capForLogging(123), 123)
    })
    it('returns original object when unserializable and under max size', () => {
      const obj: any = {}
      obj.self = obj // circular
      const result = capForLogging(obj, 100)
      assert.strictEqual(result, obj)
    })
    it('truncates long arrays into an array', () => {
      const arr = new Array(1000).fill('x')
      const truncated = capForLogging(arr, 50)
      assert.isArray(truncated)
    })
    it('truncates long objects and includes [truncated] key', () => {
      const obj = Array.from({ length: 1000 }).reduce(
        (acc, _, i) => ({
          // @ts-ignore
          ...acc,
          [`k${i}`]: 'v',
        }),
        {}
      )
      const truncated = capForLogging(obj, 50)
      assert.property(truncated, '[truncated]')
    })
  })

  describe('#extractCrossLayerProps()', () => {
    it('returns empty tuple when no args provided', () => {
      const [args, props] = extractCrossLayerProps([])
      assert.deepEqual(args, [])
      assert.isUndefined(props)
    })
    it('returns args unchanged when no cross layer props provided', () => {
      const [args] = extractCrossLayerProps([1, 2, 3])
      assert.deepEqual(args, [1, 2, 3])
    })
    it('returns undefined props when none provided', () => {
      const [, props] = extractCrossLayerProps([1, 2, 3])
      assert.isUndefined(props)
    })
    it('extracts args when last arg is logging', () => {
      const logging = { logging: { ids: [{ id: v4() }] } }
      const [args] = extractCrossLayerProps([1, logging])
      assert.deepEqual(args, [1])
    })
    it('extracts props when last arg is logging', () => {
      const logging = { logging: { ids: [{ id: v4() }] } }
      const [, props] = extractCrossLayerProps([1, logging])
      assert.deepEqual(props, logging)
    })
  })

  describe('#combineLoggingProps()', () => {
    it('merges logger ids into logging props when crossLayerProps omitted', () => {
      const logger = { getIds: () => [{ runtimeId: 'r1' }] } as any
      const result = combineLoggingProps(logger)
      assert.deepEqual(result.ids, [{ runtimeId: 'r1' }])
    })

    it('merges logger ids with provided crossLayerProps ids', () => {
      const logger = { getIds: () => [{ runtimeId: 'r1' }] } as any
      const cross = { logging: { ids: [{ requestId: 'q2' }] } }
      const result = combineLoggingProps(logger, cross as any)
      assert.deepEqual(result.ids, [{ runtimeId: 'r1' }, { requestId: 'q2' }])
    })

    it('does not include logging.overrides in merged props for applyData', () => {
      const logger = { getIds: () => [{ runtimeId: 'r1' }] } as any
      const cross = crossLayerPropsWithLoggingOverrides(
        { omitData: true },
        { logging: { ids: [{ requestId: 'q2' }] } }
      )
      const result = combineLoggingProps(logger, cross as any)
      assert.isUndefined(result.overrides)
      assert.deepEqual(result.ids, [{ runtimeId: 'r1' }, { requestId: 'q2' }])
    })
  })

  describe('#createCrossLayerProps()', () => {
    it('removes logging.overrides from output so they are not forwarded', () => {
      const logger = { getIds: () => [{ functionCallId: 'fc1' }] } as any
      const merged = createCrossLayerProps(
        logger,
        crossLayerPropsWithLoggingOverrides(
          { omitData: true },
          { logging: { ids: [{ requestId: 'req-1' }] } }
        ) as any
      )
      assert.isUndefined(merged.logging?.overrides)
      assert.isArray(merged.logging?.ids)
    })
  })

  describe('#crossLayerPropsWithLoggingOverrides()', () => {
    it('merges overrides while preserving ids', () => {
      const base = { logging: { ids: [{ x: '1' }] } }
      const r = crossLayerPropsWithLoggingOverrides({ omitData: true }, base)
      assert.deepEqual(r.logging?.ids, [{ x: '1' }])
      assert.equal(r.logging?.overrides?.omitData, true)
    })
  })
})
