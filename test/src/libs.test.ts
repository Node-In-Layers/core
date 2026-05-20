import * as chai from 'chai'
import { assert } from 'chai'
import asPromised from 'chai-as-promised'
import { describe, it } from 'mocha'
import z from 'zod'
import {
  combineCrossLayerProps,
  annotatedFunction,
  errorObjectSchema,
  createErrorObject,
  isErrorObject,
  annotationFunctionProps,
} from '../../src/libs.js'
import {
  getCoreDomains,
  getLogLevelName,
  validateConfig,
  getLayersUnavailable,
  getNamespace,
  DoNothingFetcher,
  getLogLevelNumber,
  isConfig,
} from '../../src/internal-libs.js'
import {
  CoreNamespace,
  CrossLayerProps,
  LogFormat,
  LogLevel,
  LogLevelNames,
} from '../../src'

chai.use(asPromised)

describe('/src/libs.ts', () => {
  describe('#isErrorObject()', () => {
    it('should return true when its an actual ErrorObject', () => {
      const errorObj = createErrorObject('CODE', 'msg')
      assert.isTrue(isErrorObject(errorObj))
    })
    it('should return false if null is passed in', () => {
      // @ts-ignore
      assert.isFalse(isErrorObject(null))
    })
    it('should return false if an object is passed in with "error" but its null', () => {
      // @ts-ignore
      assert.isFalse(isErrorObject({ error: null }))
    })
    it('should return false if undefined is passed in', () => {
      // @ts-ignore
      assert.isFalse(isErrorObject(undefined))
    })
    it('should return false if an object is passed in with "error" but its undefined', () => {
      // @ts-ignore
      assert.isFalse(isErrorObject({ error: undefined }))
    })
    it('should return false if an object is passed in with "error" but its not an object', () => {
      // @ts-ignore
      assert.isFalse(isErrorObject({ error: 'not-an-object' }))
    })
    it('should return false if an object is passed in with "error" but its not a string', () => {
      // @ts-ignore
      assert.isFalse(isErrorObject({ error: 123 }))
    })
    it('should return false if an empty object is passed into error', () => {
      // @ts-ignore
      assert.isFalse(isErrorObject({ error: {} }))
    })
    it('should return false if everything is present but not code', () => {
      const input = {
        error: {
          message: 'msg',
          details: 'details',
          data: { a: 1 },
          trace: 'trace',
          cause: {
            error: {
              code: 'CODE',
              message: 'msg',
            },
          },
        },
      }
      const actual = isErrorObject(input)
      assert.isFalse(actual)
    })
    it('should return false if everything is present but not message', () => {
      const input = {
        error: {
          code: 'CODE',
          details: 'details',
          data: { a: 1 },
          trace: 'trace',
          cause: {
            error: {
              code: 'CODE',
              message: 'msg',
            },
          },
        },
      }
      const actual = isErrorObject(input)
      assert.isFalse(actual)
    })
    it('should return true if only code and message are present', () => {
      const input = {
        error: {
          code: 'CODE',
          message: 'msg',
        },
      }
      const actual = isErrorObject(input)
      assert.isTrue(actual)
    })
  })
  describe('#combineCrossLayerProps()', () => {
    it('should be able to handle extended cross layer props types', () => {
      const normal = {
        logging: {
          ids: [{ requestId: '123' }],
        },
      }
      const extended = {
        requestInfo: {
          requestId: '123',
        },
      }
      const actual = combineCrossLayerProps(normal, extended)
      assert.deepEqual(actual, {
        logging: {
          ids: [{ requestId: '123' }],
        },
        requestInfo: {
          requestId: '123',
        },
      })
    })
    it('should combine when A has no logging, and B has logging', () => {
      const a = {}
      const b = {}
      const expected = { logging: { ids: [] } }
      const actual = combineCrossLayerProps(a, b)
      assert.deepEqual(actual, expected)
    })
    it('should combine cross layer props', () => {
      const a = {
        logging: {
          ids: [{ runtimeId: '209a63e8-3323-4672-8915-3e9c8903e9d3' }],
        },
      }
      const b = {
        logging: {
          ids: [{ requestId: '4e335178-19a3-45f9-9dfe-5431bb19e616' }],
        },
      }
      const expected: CrossLayerProps = {
        logging: {
          ids: [
            {
              runtimeId: '209a63e8-3323-4672-8915-3e9c8903e9d3',
            },
            {
              requestId: '4e335178-19a3-45f9-9dfe-5431bb19e616',
            },
          ],
        },
      }
      const actual = combineCrossLayerProps(a, b)
      assert.deepEqual(actual, expected)
    })
  })
  describe('#getLayersUnavailable()', () => {
    it('should throw an exception when passing an unused layer', () => {
      assert.throws(() => {
        getLayersUnavailable(['services', 'features'])('not-real')
      })
    })
    it('should return [] when using [services, features] and features', () => {
      const actual = getLayersUnavailable(['services', 'features'])('features')
      const expected = []
      assert.deepEqual(actual, expected)
    })
    it('should return features when using [services, features] and services', () => {
      const actual = getLayersUnavailable(['services', 'features'])('services')
      const expected = ['features']
      assert.deepEqual(actual, expected)
    })
    it('should return higher when using [services, features, higher] and features', () => {
      const actual = getLayersUnavailable(['services', 'features', 'higher'])(
        'features'
      )
      const expected = ['higher']
      assert.deepEqual(actual, expected)
    })
  })
  describe('#validateConfig()', () => {
    it('should throw an exception when a domain does not have a name', () => {
      assert.throws(() => {
        validateConfig({
          systemName: 'nil-core',
          environment: 'unit-test',
          [CoreNamespace.root]: {
            domains: [
              {
                name: 'testme',
              },
              {} as any,
            ],
            layerOrder: ['services', 'features'],
            logging: {
              logFormat: LogFormat.full,
              logLevel: LogLevelNames.silent,
            },
          },
        })
      }, 'A configured domain does not have a name')
    })
    it('should throw an exception when logLevel is a number', () => {
      assert.throws(() => {
        validateConfig({
          systemName: 'nil-core',
          environment: 'unit-test',
          [CoreNamespace.root]: {
            domains: [
              {
                name: 'testme',
              },
            ],
            layerOrder: ['services', 'features'],
            // @ts-ignore
            logging: { logFormat: LogFormat.full, logLevel: 0 as any },
          },
        })
      })
    })
    it('should throw an exception when layerOrder is not an array', () => {
      assert.throws(() => {
        validateConfig({
          systemName: 'nil-core',
          environment: 'unit-test',
          [CoreNamespace.root]: {
            domains: [
              {
                name: 'testme',
              },
            ],
            layerOrder: 'features' as any,
            logging: {
              logFormat: LogFormat.full,
              logLevel: LogLevelNames.silent,
            },
          },
        })
      })
    })
    it('should throw an exception when layerOrder is missing', () => {
      assert.throws(() => {
        validateConfig({
          systemName: 'nil-core',
          environment: 'unit-test',
          // @ts-ignore
          [CoreNamespace.root]: {
            domains: [
              {
                name: 'testme',
              },
            ],
            logging: {
              logFormat: LogFormat.full,
              logLevel: LogLevelNames.silent,
            },
          },
        })
      })
    })
    it('should throw an exception when domains is missing', () => {
      assert.throws(() => {
        validateConfig({
          systemName: 'nil-core',
          environment: 'unit-test',
          // @ts-ignore
          [CoreNamespace.root]: {
            layerOrder: ['services', 'features'],
            logging: {
              logFormat: LogFormat.full,
              logLevel: LogLevelNames.silent,
            },
          },
        })
      })
    })
    it('should accept deprecated apps when domains is absent', () => {
      assert.doesNotThrow(() => {
        validateConfig({
          systemName: 'nil-core',
          environment: 'unit-test',
          [CoreNamespace.root]: {
            apps: [{ name: 'legacy' }],
            layerOrder: ['services', 'features'],
            logging: {
              logFormat: LogFormat.full,
              logLevel: LogLevelNames.silent,
            },
          },
        })
      })
    })
    it('getCoreDomains prefers domains over deprecated apps', () => {
      const core = {
        domains: [{ name: 'from-domains' }],
        apps: [{ name: 'from-apps' }],
        layerOrder: ['services'],
        logging: {
          logFormat: LogFormat.full,
          logLevel: LogLevelNames.silent,
        },
      }
      const actual = getCoreDomains(core)
      assert.equal(actual[0].name, 'from-domains')
    })
    it('getCoreDomains reads deprecated apps when domains is absent', () => {
      const core = {
        apps: [{ name: 'from-apps' }],
        layerOrder: ['services'],
        logging: {
          logFormat: LogFormat.full,
          logLevel: LogLevelNames.silent,
        },
      }
      const actual = getCoreDomains(core)
      assert.equal(actual[0].name, 'from-apps')
    })
  })
  describe('#getLogLevelName()', () => {
    it('should throw an exception for -1', () => {
      assert.throws(() => {
        getLogLevelName(-1 as LogLevel)
      })
    })
    it('should return TRACE for 0', () => {
      const actual = getLogLevelName(0)
      const expected = 'TRACE'
      assert.equal(actual, expected)
    })
    it('should return DEBUG for 1', () => {
      const actual = getLogLevelName(1)
      const expected = 'DEBUG'
      assert.equal(actual, expected)
    })
    it('should return WARN for 2', () => {
      const actual = getLogLevelName(2)
      const expected = 'INFO'
      assert.equal(actual, expected)
    })
    it('should return WARN for for 3', () => {
      const actual = getLogLevelName(3)
      const expected = 'WARN'
      assert.equal(actual, expected)
    })
    it('should return ERROR for for 4', () => {
      const actual = getLogLevelName(4)
      const expected = 'ERROR'
      assert.equal(actual, expected)
    })
    it('should return SILENT for 5', () => {
      const actual = getLogLevelName(5)
      const expected = 'SILENT'
      assert.equal(actual, expected)
    })
    it('should throw an exception for 6', () => {
      assert.throws(() => {
        getLogLevelName(6 as LogLevel)
      })
    })
  })
  describe('#annotatedFunction()', () => {
    it('exposes an executable function', () => {
      const fn = annotatedFunction(
        {
          description: 'Test annotated function',
          args: z.object({ myArgument: z.string() }),
          returns: z.object({ output: z.string() }),
        },
        (args: { myArgument: string }) => ({
          output: `Hello ${args.myArgument}`,
        })
      )
      assert.isFunction(fn)
    })

    it('attaches a zod function schema', () => {
      const fn = annotatedFunction(
        {
          description: 'Test annotated function',
          args: z.object({ myArgument: z.string() }),
          returns: z.object({ output: z.string() }),
        },
        (args: { myArgument: string }) => ({
          output: `Hello ${args.myArgument}`,
        })
      )
      assert.isOk(fn.schema)
    })

    it('preserves provided description on schema', () => {
      const description = 'Test annotated function'
      const fn = annotatedFunction(
        {
          description,
          args: z.object({ myArgument: z.string() }),
          returns: z.object({ output: z.string() }),
        },
        (args: { myArgument: string }) => ({
          output: `Hello ${args.myArgument}`,
        })
      )
      assert.equal(fn.schema.description, description)
    })

    it('executes via direct call', async () => {
      const fn = annotatedFunction(
        {
          description: 'Test annotated function',
          args: z.object({ myArgument: z.string() }),
          returns: z.object({ output: z.string() }),
        },
        (args: { myArgument: string }) => ({
          output: `Hello ${args.myArgument}`,
        })
      )
      const direct = await fn({ myArgument: 'World' })
      assert.deepEqual(direct, { output: 'Hello World' })
    })

    it('allows calling without crossLayerProps', async () => {
      const fn = annotatedFunction(
        {
          args: z.object({ myArgument: z.string() }),
          returns: z.object({ output: z.string() }),
        },
        (args: { myArgument: string }) => ({
          output: `Hello ${args.myArgument}`,
        })
      )
      const withoutProps = await fn({ myArgument: 'A' })
      assert.deepEqual(withoutProps, { output: 'Hello A' })
    })

    it('accepts crossLayerProps as the second argument', async () => {
      const fn = annotatedFunction(
        {
          args: z.object({ myArgument: z.string() }),
          returns: z.object({ output: z.string() }),
        },
        (args: { myArgument: string }) => ({
          output: `Hello ${args.myArgument}`,
        })
      )
      const withProps = await fn(
        { myArgument: 'B' },
        { logging: { ids: [{ requestId: 'req-1' }] } }
      )
      assert.deepEqual(withProps, { output: 'Hello B' })
    })

    it('implemented wrapper validates input and throws for invalid args', async () => {
      const fn = annotatedFunction(
        {
          args: z.object({ myArgument: z.string() }),
          returns: z.object({ output: z.string() }),
        },
        (args: { myArgument: string }) => ({
          output: `Hello ${args.myArgument}`,
        })
      )
      assert.isRejected(fn({ myArgument: 123 } as any))
    })
    it('should support async implementations', async () => {
      const fn = annotatedFunction(
        {
          args: z.object(z.any),
          returns: z.object({ output: z.string() }),
        },
        async (args: any) => {
          return { output: 'ok' }
        }
      )
      const res = await fn({ something: 'ok' })
      assert.isOk(res)
    })
    it('should support void outputs when returns omitted', async () => {
      const fn = annotatedFunction(
        {
          args: z.object({ x: z.string().optional() }),
          // returns omitted to test void path
        } as any,
        (_args: any) => {
          return undefined
        }
      )
      const res = await fn({})
      assert.isUndefined(res)
    })
    it('should support adding a functionName', () => {
      const fn = annotatedFunction(
        {
          functionName: 'myFunction',
          domain: 'myDomain',
          args: z.object({ myArgument: z.string() }),
        },
        (_args: any) => {
          return undefined
        }
      )
      const actual = fn.functionName
      const expected = 'myFunction'
      assert.equal(actual, expected)
    })
    it('should support adding a domain', () => {
      const fn = annotatedFunction(
        {
          functionName: 'myFunction',
          domain: 'myDomain',
          args: z.object({ myArgument: z.string() }),
        },
        (_args: any) => {
          return undefined
        }
      )
      const actual = fn.domain
      const expected = 'myDomain'
      assert.equal(actual, expected)
    })
  })
  describe('#createErrorObject()', () => {
    it('should return base when no error', () => {
      const actual = createErrorObject('CODE', 'msg')
      assert.deepEqual(actual, { error: { code: 'CODE', message: 'msg' } })
    })

    it('should handle Error without cause', () => {
      const err = new Error('boom')
      const actual = createErrorObject('E', 'm', err)
      assert.equal(actual.error.details, 'boom')
      assert.equal(actual.error.cause?.error.message, 'boom')
    })

    it('should handle Error with nested cause', () => {
      const inner = new Error('inner')
      const outer: any = new Error('outer', { cause: inner })
      const actual = createErrorObject('E2', 'outer message', outer)
      assert.equal((actual.error.cause as any).message, 'inner')
    })

    it('should handle string error', () => {
      const actual = createErrorObject('S', 'm', 'text error')
      assert.equal(actual.error.details, 'text error')
    })

    it('should handle serializable object', () => {
      const actual = createErrorObject('O', 'm', { a: 1 })
      assert.deepEqual(actual.error.data, { a: 1 })
    })

    it('should handle arrays by stringifying', () => {
      const actual = createErrorObject('A', 'm', [1, 2, 3])
      assert.match((actual.error.details as string) || '', /1,2,3/)
    })

    it('should validate error shape', () => {
      const schema = errorObjectSchema()
      const parsed = schema.parse({ error: { code: 'C', message: 'M' } })
      assert.deepEqual(parsed.error.code, 'C')
    })
    it('should identify ErrorObject via isErrorObject', () => {
      const obj = createErrorObject('C1', 'M1')
      assert.isTrue(isErrorObject(obj))
      assert.isFalse(isErrorObject({ not: 'error' }))
    })

    it('should return correct namespace with and without domain', () => {
      assert.equal(getNamespace('@pkg/name'), '@pkg/name')
      assert.equal(getNamespace('@pkg/name', 'myapp'), '@pkg/name/myapp')
    })
    it('should handle non-serializable objects by stringifying in createErrorObject', () => {
      const a: any = {}
      a.self = a // circular
      const obj = createErrorObject('CIRC', 'cmsg', a)
      assert.match(String(obj.error.details || ''), /\[object Object\]/)
    })

    it('should include nested cause when intermediate error has empty message', () => {
      const innerMost = new Error('deep')
      const middle: any = new Error('', { cause: innerMost })
      const outer: any = new Error('outer', { cause: middle })
      const obj = createErrorObject('OUT', 'outer-msg', outer)
      assert.isOk((obj.error.cause as any)?.cause)
    })

    it('should return the same object', () => {
      const args = {
        args: z.object({ a: z.string() }),
        returns: z.object({ b: z.string() }),
      }
      const res = annotationFunctionProps<any, any>(args as any)
      assert.strictEqual(res, args)
    })
  })

  describe('#DoNothingFetcher()', () => {
    it('should return the provided primary key', async () => {
      // @ts-ignore intentional any model
      const result = await DoNothingFetcher({} as any, 123 as any)
      assert.equal(result, 123)
    })
  })

  describe('#errorObjectSchema()', () => {
    it('should validate error shape', () => {
      const schema = errorObjectSchema()
      const parsed = schema.parse({ error: { code: 'C', message: 'M' } })
      assert.deepEqual(parsed.error.code, 'C')
    })
  })

  describe('#isConfig()', () => {
    it('should return false for string input', () => {
      assert.isFalse(isConfig('not-a-config' as any))
    })
    it('should return true when layerOrder exists', () => {
      const cfg = { [CoreNamespace.root]: { layerOrder: ['services'] } } as any
      assert.isTrue(isConfig(cfg))
    })
  })

  describe('#getLogLevelNumber()', () => {
    it('should map trace to TRACE', () => {
      const num = getLogLevelNumber(LogLevelNames.trace)
      assert.equal(num, LogLevel.TRACE)
    })
    it('should throw for unknown log level name', () => {
      // @ts-ignore
      assert.throws(() => getLogLevelNumber('unknown'))
    })
  })
})
