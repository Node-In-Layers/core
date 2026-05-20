import { assert } from 'chai'
import { describe, it } from 'mocha'
import sinon from 'sinon'
import esmock from 'esmock'
import { validConfig1 } from '../mocks.js'

const _setup = async () => {
  const globalServices = {
    create: sinon.stub().returns({}),
  }
  const globalFeatures = {
    create: sinon.stub().returns({
      loadGlobals: async () => ({
        config: { '@node-in-layers/core': { domains: [] } },
      }),
    }),
  }
  const layersServices = {
    create: sinon.stub().returns({}),
  }
  const layersFeatures = {
    create: sinon.stub().returns({
      loadLayers: async () => ({
        services: { '@node-in-layers/core': {} },
        other: 1,
      }),
    }),
  }
  const module = await esmock('../../src/entries.js', {
    '../../src/globals/index': {
      services: globalServices,
      features: globalFeatures,
    },
    '../../src/layers': {
      services: layersServices,
      features: layersFeatures,
    },
  })
  return {
    module,
    globalServices,
    globalFeatures,
    layersServices,
    layersFeatures,
  }
}

describe('/src/entries.ts', () => {
  it('should load the system when no config is provided', async () => {
    const { module } = await _setup()
    const { loadSystem } = module
    const actual = await loadSystem({ environment: 'unit-test' })
    assert.isOk(actual)
  })
  it('should load the system when a config is provided', async () => {
    const { module } = await _setup()
    const { loadSystem } = module
    const actual = await loadSystem({
      environment: 'unit-test',
      config: validConfig1(),
    })
    assert.isOk(actual)
  })
  it('should use process when available', async () => {
    const { module, globalServices } = await _setup()
    const { loadSystem } = module
    // @ts-ignore
    const cwdStub = sinon.stub(process, 'cwd').returns('/tmp/fake')
    await loadSystem({ environment: 'unit-test' })
    const actual = globalServices.create.getCall(0).args[0].workingDirectory
    const expected = '/tmp/fake'
    assert.equal(actual, expected)
    cwdStub.restore()
  })
})
