import { assert } from 'chai'
import * as chai from 'chai'
import asPromised from 'chai-as-promised'
import sinon from 'sinon'
import { afterEach } from 'mocha'
import {
  createMockFs,
  validConfig1,
  deleteUnitTestConfig,
  writeUnitTestConfig,
} from '../../mocks'
import { services, features } from '../../../src/globals/index'
import { LogFormat, LogLevelNames } from '../../../src/types'

chai.use(asPromised)

const _setup = () => {
  const log = {
    info: sinon.stub(),
    warn: sinon.stub(),
    trace: sinon.stub(),
    debug: sinon.stub(),
    error: sinon.stub(),
  }
  return {
    log,
    fs: createMockFs(),
    environment: 'unit-test',
    // @ts-ignore
    workingDirectory: process.cwd(),
  }
}

describe('/src/globals/index.ts', () => {
  afterEach(() => sinon.restore())
  describe('#services.create()', () => {
    it('should create a valid object', () => {
      const instance = services.create({
        environment: 'unit-test',
        // @ts-ignore
        workingDirectory: typeof process !== 'undefined' ? process.cwd() : '',
      })
      assert.isOk(instance)
    })

    it('getConstants returns provided runtimeId', () => {
      const s = services.create({
        environment: 'unit-test',
        workingDirectory: '.',
        runtimeId: 'rid',
      })
      const c = s.getConstants()
      assert.equal(c.runtimeId, 'rid')
    })

    it('getGlobals calls app.globals when present', async () => {
      const s = services.create({
        environment: 'unit-test',
        workingDirectory: '.',
      })
      const common = {
        config: {
          '@node-in-layers/core': {
            domains: [{ name: 'app1', globals: { create: () => ({ g: 1 }) } }],
          },
        },
        rootLogger: s.getRootLogger(),
        constants: s.getConstants(),
      }
      const res = await s.getGlobals(
        common as any,
        { name: 'app1', globals: { create: () => ({ g: 1 }) } } as any
      )
      assert.property(res, 'g')
    })
  })
  describe('#features.create()', () => {
    describe('#loadLayers()', () => {})
    describe('#loadConfig()', () => {
      before(async () => {
        deleteUnitTestConfig()
      })
      it('should load a config at config.unittest.mjs', async () => {
        writeUnitTestConfig(validConfig1())
        const inputs = _setup()
        const instance = services.create(inputs)
        const actual = await instance.loadConfig()
        const expected = validConfig1()
        assert.deepEqual(actual, expected)
      })
    })
    describe('#loadGlobals()', () => {
      it('loadGlobals accepts in-memory config', async () => {
        const s = services.create({
          environment: 'unit-test',
          workingDirectory: '.',
        })
        const context = {
          services: {
            '@node-in-layers/core/globals': s,
          },
        }
        // @ts-ignore
        const f = features.create(context)
        const cfg = {
          environment: 'unit-test',
          systemName: 'nil-core',
          '@node-in-layers/core': {
            domains: [{ name: 'app1' }],
            layerOrder: [],
            logging: {
              logFormat: LogFormat.full,
              logLevel: LogLevelNames.debug,
            },
          },
        }
        const result = await f.loadGlobals(cfg as any)
        assert.property(result, 'config')
      })
    })
  })
})
