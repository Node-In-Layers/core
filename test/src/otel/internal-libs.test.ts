import { assert } from 'chai'
import { describe, it } from 'mocha'
import {
  idsToOtelAttributes,
  logMessageToOtelAttributes,
  OTEL_ID_ATTRIBUTE_PREFIX,
} from '../../../src/otel/internal-libs.js'
import { CoreNamespace, LogLevelNames } from '../../../src/types.js'

describe('/src/otel/internal-libs.ts', () => {
  const context = {
    config: {
      systemName: 'test',
      environment: 'unit-test',
      [CoreNamespace.root]: {
        layerOrder: ['services', 'features'],
        domains: [],
        logging: {
          maxLogSizeInCharacters: 20,
        },
      },
    },
  } as const

  describe('#idsToOtelAttributes()', () => {
    it('prefixes id keys with id_', () => {
      const attrs = idsToOtelAttributes([{ requestId: 'abc' }])
      assert.deepEqual(attrs, { id_requestId: 'abc' })
      assert.equal(OTEL_ID_ATTRIBUTE_PREFIX, 'id_')
    })
  })

  describe('#logMessageToOtelAttributes()', () => {
    it('caps args but not id_* attributes', () => {
      const long = 'x'.repeat(100)
      const attrs = logMessageToOtelAttributes(
        {
          id: 'log-1',
          logger: 'domain:features:fn',
          environment: 'unit-test',
          logLevel: LogLevelNames.info,
          datetime: new Date('2020-01-01T00:00:00.000Z'),
          message: 'hello',
          ids: [{ requestId: long }],
          args: { payload: long },
        },
        context as any
      )
      assert.equal(attrs.id_requestId, long)
      assert.isOk(attrs.args)
      const uncappedLen = JSON.stringify({ payload: long }).length
      const argsJson = JSON.stringify(attrs.args)
      assert.isBelow(argsJson.length, uncappedLen)
    })

    it('includes domain, layer, and function without capping', () => {
      const attrs = logMessageToOtelAttributes(
        {
          id: 'log-2',
          logger: 'd:f:fn',
          environment: 'unit-test',
          logLevel: LogLevelNames.debug,
          datetime: new Date(),
          message: 'wrap',
          domain: 'myDomain',
          layer: 'features',
          function: 'myFn',
        },
        context as any
      )
      assert.equal(attrs.domain, 'myDomain')
      assert.equal(attrs.layer, 'features')
      assert.equal(attrs.function, 'myFn')
    })
  })
})
