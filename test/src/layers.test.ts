import { assert } from 'chai'
import get from 'lodash/get'
import sinon from 'sinon'
import { Model, PrimaryKeyUuidProperty } from 'functional-models'
import { features, services as layersServices } from '../../src/layers'
import { annotatedFunction } from '../../src/libs.js'
import { DoNothingFetcher } from '../../src/internal-libs.js'
import { createMockFs, validConfig2, validConfig3 } from '../mocks'
import {
  compositeLogger,
  Config,
  CoreNamespace,
  LogFormat,
  LogLevelNames,
} from '../../src'
import z from 'zod'

const modelsConfig1 = () => {
  const domain1Models = {
    Model1: {
      create: sinon.stub().callsFake(props => {
        return props.Model({
          pluralName: 'Model1',
          namespace: 'nil-core',
          properties: {
            id: PrimaryKeyUuidProperty(),
          },
        })
      }),
    },
  }

  const domain2Models = {
    Model2: {
      create: sinon.stub().callsFake(props =>
        props.Model({
          pluralName: 'Model2',
          namespace: 'nil-core',
          properties: {
            id: PrimaryKeyUuidProperty(),
          },
        })
      ),
    },
  }

  const domain1Services = {
    create: sinon.stub().returns({}),
  }

  const domain1Features = {
    create: sinon.stub().returns({
      myFeature: annotatedFunction(
        {
          description: 'My feature',
          args: z.object({
            myArgument: z.string(),
          }),
          returns: z.object({
            myOutput: z.string(),
          }),
        },
        () => {
          return {
            myOutput: 'My output',
          }
        }
      ),
    }),
  }

  const domain2Services = {
    create: sinon.stub().returns({}),
  }

  const domain2Features = {
    create: sinon.stub().callsFake(context => ({
      getFeature1: annotatedFunction(
        {
          description: 'Gets the feature',
          args: z.object({}),
          returns: z.object({
            myOutput: z.boolean(),
          }),
        },
        args => {
          return {
            myOutput: Boolean(context.features.domain1.myFeature.schema),
          }
        }
      ),
    })),
  }

  const domain1 = {
    name: 'domain1',
    models: domain1Models,
    create: {
      models: domain1Models,
      services: domain1Services.create,
      features: domain1Features.create,
    },
    services: domain1Services,
    features: domain1Features,
  }
  const domain2 = {
    name: 'domain2',
    models: domain2Models,
    create: {
      models: domain2Models,
      services: domain2Services.create,
      features: domain2Features.create,
    },
    features: domain2Features,
    services: domain2Services,
  }
  return {
    environment: 'unit-test',
    systemName: 'nil-core',
    [CoreNamespace.root]: {
      domains: [domain1, domain2],
      layerOrder: ['services', 'features'],
      logging: {
        logFormat: LogFormat.full,
        logLevel: LogLevelNames.trace,
      },
    },
  }
}

const modelsConfig2 = () => {
  const domain1Models = {
    Model1: {
      create: sinon.stub().callsFake(props => {
        return props.Model({
          pluralName: 'Model1',
          namespace: 'nil-core',
          properties: {
            id: PrimaryKeyUuidProperty(),
          },
        })
      }),
    },
  }

  const domain2Models = {
    Model2: {
      create: sinon.stub().callsFake(props =>
        props.Model({
          pluralName: 'Model2',
          namespace: 'nil-core',
          properties: {
            id: PrimaryKeyUuidProperty(),
          },
        })
      ),
    },
  }

  const domain1Services = {
    create: sinon.stub().returns({}),
  }

  const domain2Services = {
    create: sinon.stub().returns({}),
  }

  const domain2Features = {
    create: sinon.stub().returns({}),
  }

  const domain1 = {
    name: 'domain1',
    models: domain1Models,
    create: {
      models: domain1Models,
      services: domain1Services.create,
    },
    services: domain1Services,
  }
  const domain2 = {
    name: 'domain2',
    models: domain2Models,
    create: {
      models: domain2Models,
      services: domain2Services.create,
      features: domain2Features.create,
    },
    features: domain2Features,
    services: domain2Services,
  }
  return {
    environment: 'unit-test',
    systemName: 'nil-core',
    [CoreNamespace.root]: {
      domains: [domain1, domain2],
      layerOrder: ['services', 'features'],
      modelCruds: true,
      logging: {
        logFormat: LogFormat.full,
        logLevel: LogLevelNames.trace,
      },
    },
  }
}

const modelsConfig3 = () => {
  const domain1Models = {
    Model1: {
      create: sinon.stub().callsFake(props => {
        return props.Model({
          pluralName: 'Model1',
          namespace: 'nil-core',
          properties: {
            id: PrimaryKeyUuidProperty(),
          },
        })
      }),
    },
  }

  const domain2Models = {
    Model2: {
      create: sinon.stub().callsFake(props =>
        props.Model({
          pluralName: 'Model2',
          namespace: 'nil-core',
          properties: {
            id: PrimaryKeyUuidProperty(),
          },
        })
      ),
    },
  }

  const domain3Services = {
    create: sinon.stub().returns({}),
  }
  const domain3Features = {
    create: sinon.stub().returns({}),
  }

  const domain1 = {
    name: 'domain1',
    models: domain1Models,
    create: {
      models: domain1Models,
    },
  }
  const domain2 = {
    name: 'domain2',
    models: domain2Models,
    create: {
      models: domain2Models,
    },
  }
  const domain3 = {
    name: 'domain3',
    create: {
      services: domain3Services.create,
      features: domain3Features.create,
    },
    features: domain3Features,
    services: domain3Services,
  }
  return {
    environment: 'unit-test',
    systemName: 'nil-core',
    [CoreNamespace.root]: {
      domains: [domain1, domain2, domain3],
      layerOrder: ['services', 'features'],
      modelCruds: true,
      logging: {
        logFormat: LogFormat.full,
        logLevel: LogLevelNames.trace,
      },
    },
  }
}

const customFactoryConfig = (
  crudsFactory?: any,
  ignoreFunctions?: any,
  noModelLogWrap?: boolean
) => {
  const domain1Models = {
    Model1: {
      create: sinon.stub().callsFake(props => {
        const m = props.Model({
          pluralName: 'Model1',
          namespace: 'domain1',
          properties: { id: PrimaryKeyUuidProperty() },
        })
        const prototypeObj = {
          save: sinon.stub().resolves({}),
        }
        m.save = sinon.stub().resolves(prototypeObj)
        m.delete = sinon.stub().resolves(true)
        m.retrieve = sinon.stub().resolves(prototypeObj)
        m.search = sinon.stub().resolves({ results: [], total: 0 })
        m.bulkInsert = sinon.stub().resolves(true)
        m.bulkDelete = sinon.stub().resolves(true)
        return m
      }),
    },
    Model2: {
      create: sinon.stub().callsFake(props => {
        const m = props.Model({
          pluralName: 'Model2',
          namespace: 'domain1',
          properties: { id: PrimaryKeyUuidProperty() },
        })
        const prototypeObj = {
          save: sinon.stub().resolves({}),
        }
        m.save = sinon.stub().resolves(prototypeObj)
        m.delete = sinon.stub().resolves(true)
        m.retrieve = sinon.stub().resolves(prototypeObj)
        m.search = sinon.stub().resolves({ results: [], total: 0 })
        m.bulkInsert = sinon.stub().resolves(true)
        m.bulkDelete = sinon.stub().resolves(true)
        return m
      }),
    },
  }

  const domain1 = {
    name: 'domain1',
    models: domain1Models,
    create: {
      models: domain1Models,
      services: sinon.stub().returns({}),
      features: sinon.stub().returns({}),
    },
    services: { create: sinon.stub().returns({}) },
    features: { create: sinon.stub().returns({}) },
  }

  return {
    environment: 'unit-test',
    systemName: 'nil-core',
    ['@node-in-layers/core']: {
      domains: [domain1],
      layerOrder: ['services', 'features'],
      modelCruds: true,
      modelCrudsFactory: crudsFactory,
      noModelLogWrap: noModelLogWrap,
      logging: {
        logFormat: LogFormat.full,
        logLevel: LogLevelNames.trace,
        ignoreLayerFunctions: ignoreFunctions,
      },
    },
  }
}

const customLayer1 = () => {
  const domain1 = {
    name: 'domain1',
    services: {
      create: sinon.stub().callsFake(context => ({
        logIt: layerArgs => {
          context.log.getInnerLogger('logIt', layerArgs).info('Test my logging')
          return 'ok'
        },
      })),
    },
    features: {
      create: sinon.stub().callsFake(context => ({
        myFeature: crossLayer => {
          // TODO: FIXME add cross layer
          //return context.services.domain1.logIt(crossLayer)
          return context.services.domain1.logIt(crossLayer)
        },
      })),
    },
    customLayer: {
      create: sinon.stub().returns({ domain1: 'custom' }),
    },
  }
  const domain2 = {
    name: 'domain2',
    customLayer: {
      create: sinon.stub().returns({}),
    },
  }
  return {
    environment: 'unit-test',
    systemName: 'nil-core',
    [CoreNamespace.root]: {
      domains: [domain1, domain2],
      layerOrder: ['services', 'features', ['entries', 'customLayer']],
      logging: {
        logFormat: LogFormat.full,
        logLevel: LogLevelNames.debug,
      },
    },
  }
}

const customLayer2 = () => {
  const domain1 = {
    name: 'domain1',
    services: {
      create: sinon.stub().returns({}),
    },
    features: {
      create: sinon.stub().returns({}),
    },
    entries: {
      create: sinon.stub().returns({}),
    },
    customLayer: {
      create: sinon.stub().returns({ domain1: 'custom' }),
    },
  }
  const domain2 = {
    name: 'domain2',
    entries: {
      create: sinon.stub().returns({}),
    },
    customLayer: {
      create: sinon.stub().returns({}),
    },
  }
  return {
    environment: 'unit-test',
    systemName: 'nil-core',
    [CoreNamespace.root]: {
      domains: [domain1, domain2],
      layerOrder: ['services', 'features', ['entries', 'customLayer']],
      logging: {
        logFormat: LogFormat.full,
        logLevel: LogLevelNames.trace,
      },
    },
  }
}

const customModelsConfig1 = () => {
  const config = modelsConfig1()
  const CustomModelFactory = sinon.stub().callsFake((...args) => {
    // @ts-ignore
    return Model(...args)
  })
  const CustomModelFactory2 = sinon.stub().callsFake((...args) => {
    // @ts-ignore
    return Model(...args)
  })
  const getModelProps = sinon.stub().returns({
    Model: CustomModelFactory2,
    fetcher: DoNothingFetcher,
  })
  const domain3Services = {
    create: sinon.stub().returns({
      getModelProps,
    }),
  }
  const customFactoryServices = {
    create: sinon.stub().returns({
      getModelProps: sinon.stub().returns({
        Model: CustomModelFactory,
        fetcher: DoNothingFetcher,
      }),
    }),
  }
  const domainsList = [
    {
      name: 'customFactory',
      services: customFactoryServices,
      CustomModelFactory,
    },
    {
      name: 'domain3',
      services: domain3Services,
      CustomModelFactory2,
    },
    // @ts-ignore
  ].concat(config[CoreNamespace.root].domains ?? [])
  return {
    environment: 'unit-test',
    systemName: 'nil-core',
    [CoreNamespace.root]: {
      domains: domainsList,
      layerOrder: ['services', 'features'],
      logging: {
        logFormat: LogFormat.full,
        logLevel: LogLevelNames.trace,
      },
      modelFactory: 'customFactory',
    },
  }
}

const compositeLayersConfig1 = () => {
  const create1 = sinon.stub().returns({})
  const create2 = sinon.stub().returns({})
  const create3 = sinon.stub().returns({})
  const create4 = sinon.stub().returns({})
  const create5 = sinon.stub().returns({})
  const create6 = sinon.stub().returns({})

  const domain1 = {
    name: 'domain1',
    create: {
      services: create1,
    },
    services: sinon.stub().returns({ create: create1 }),
  }
  const domain2 = {
    name: 'domain2',
    create: {
      services: create2,
      features: create3,
      layerA: create4,
      layerB: create5,
      layerC: create6,
    },
    layerA: {
      create: create4,
    },
    layerB: {
      create: create5,
    },
    layerC: {
      create: create6,
    },
    services: {
      create: create2,
    },
    features: {
      create: create3,
    },
  }
  return {
    environment: 'unit-test',
    systemName: 'nil-core',
    [CoreNamespace.root]: {
      domains: [domain1, domain2],
      layerOrder: ['services', ['layerA', 'layerB', 'layerC'], 'features'],
      logging: {
        logFormat: LogFormat.full,
        logLevel: LogLevelNames.trace,
      },
    },
  }
}

const crossDomainServiceLookupConfig = () => {
  const domain1Services = {
    create: sinon.stub().callsFake(context => ({
      myFunc: (_args, crossLayerProps) => {
        return context.services
          .getServices('domain2')
          ['configuredFunction']('World', crossLayerProps)
      },
    })),
  }

  const domain2Services = {
    create: sinon.stub().returns({
      configuredFunction: (name, _crossLayerProps) => {
        return `Hello ${name}`
      },
    }),
  }

  const domain1 = {
    name: 'domain1',
    services: domain1Services,
  }

  const domain2 = {
    name: 'domain2',
    services: domain2Services,
  }

  return {
    environment: 'unit-test',
    systemName: 'nil-core',
    [CoreNamespace.root]: {
      domains: [domain1, domain2],
      layerOrder: ['services', 'features'],
      logging: {
        logFormat: LogFormat.full,
        logLevel: LogLevelNames.trace,
      },
    },
  }
}

const crossDomainVisibilityConfig = () => {
  const domain1Services = {
    create: sinon.stub().callsFake(context => ({
      blowUpIfTryingToReadFeatures: () => {
        // @ts-ignore
        return context.features.getFeatures('domain2')
      },
    })),
  }

  const domain1Features = {
    create: sinon.stub().callsFake(context => ({
      callHigherService: (_args, crossLayerProps) => {
        return context.services
          .getServices('domain2')
          ['configuredFunction']('World', crossLayerProps)
      },
    })),
  }

  const domain2Services = {
    create: sinon.stub().returns({
      configuredFunction: (name, _crossLayerProps) => {
        return `Hello ${name}`
      },
    }),
  }

  const domain1 = {
    name: 'domain1',
    services: domain1Services,
    features: domain1Features,
  }

  const domain2 = {
    name: 'domain2',
    services: domain2Services,
  }

  return {
    environment: 'unit-test',
    systemName: 'nil-core',
    [CoreNamespace.root]: {
      domains: [domain1, domain2],
      layerOrder: ['services', 'features'],
      logging: {
        logFormat: LogFormat.full,
        logLevel: LogLevelNames.trace,
      },
    },
  }
}

const higherThanFeaturesLayerCanGetFeaturesConfig = () => {
  const domain1Services = {
    create: sinon.stub().returns({}),
  }

  const domain1Features = {
    create: sinon.stub().returns({
      configuredFunction: (name, _crossLayerProps) => {
        return `Hello ${name}`
      },
    }),
  }

  const domain2Services = {
    create: sinon.stub().returns({}),
  }

  const domain2CustomLayer = {
    create: sinon.stub().callsFake(context => ({
      callHigherFeature: (_args, crossLayerProps) => {
        return context.features
          .getFeatures('domain1')
          ['configuredFunction']('World', crossLayerProps)
      },
    })),
  }

  const domain1 = {
    name: 'domain1',
    services: domain1Services,
    features: domain1Features,
  }

  const domain2 = {
    name: 'domain2',
    services: domain2Services,
    customLayer: domain2CustomLayer,
  }

  return {
    environment: 'unit-test',
    systemName: 'nil-core',
    [CoreNamespace.root]: {
      domains: [domain1, domain2],
      layerOrder: ['services', 'features', ['entries', 'customLayer']],
      logging: {
        logFormat: LogFormat.full,
        logLevel: LogLevelNames.trace,
      },
    },
  }
}

const _setup = (config?: Config) => {
  const logger = {
    info: sinon.stub(),
    warn: sinon.stub(),
    trace: sinon.stub(),
    debug: sinon.stub(),
    error: sinon.stub(),
  }
  const functionLogger = sinon.stub().returns(logger)
  const layerLogger = {
    ...logger,
    getFunctionLogger: sinon.stub().returns(functionLogger),
  }
  const domainLogger = {
    ...logger,
    getLayerLogger: sinon.stub().returns(layerLogger),
  }
  const mockLogMethod = sinon.stub()
  const rootLogger = compositeLogger([() => mockLogMethod])

  const services = {
    [CoreNamespace.layers]: layersServices.create(),
  }
  return {
    _logging: {
      rootLogger,
      mockLogMethod,
    },
    rootLogger,
    config: config || validConfig2(),
    constants: {
      runtimeId: 'unit-test-id',
      environment: 'unit-test',
      workingDirectory: '../../',
    },
    services,
  }
}

const annotatedFunctionConfig = () => {}

const crossLayerPropsPreservationConfig = () => {
  let capturedFromService: any = null
  let capturedFromContextService: any = null

  const domain1Services = {
    create: sinon.stub().returns({
      captureProps: (_args: any, crossLayerProps: any) => {
        capturedFromService = crossLayerProps
        return 'ok'
      },
    }),
  }

  const domain2Services = {
    create: sinon.stub().callsFake(context => ({
      proxyTodomain1: (_args: any, crossLayerProps: any) => {
        return context.services
          .getServices('domain1')
          ['captureProps']({ proxied: true }, crossLayerProps)
      },
    })),
  }

  const domain1 = { name: 'domain1', services: domain1Services }
  const domain2 = { name: 'domain2', services: domain2Services }

  return {
    config: {
      environment: 'unit-test',
      systemName: 'nil-core',
      [CoreNamespace.root]: {
        domains: [domain1, domain2],
        layerOrder: ['services', 'features'],
        logging: {
          logFormat: LogFormat.full,
          logLevel: LogLevelNames.trace,
        },
      },
    },
    getCapturedFromService: () => capturedFromService,
    getCapturedFromContextService: () => capturedFromContextService,
  }
}

describe('/src/layers.ts', () => {
  describe('#features.create()', () => {
    describe('#loadLayers()', () => {
      it('should keep annotated functions intact even though they are wrdomained', async () => {
        const config = modelsConfig1()
        const inputs = _setup(config)
        const instance = features.create(inputs)
        const context = await instance.loadLayers()
        assert.isOk(context.features.domain1.myFeature.schema)
      })
      it('should keep annotated functions intact through context', async () => {
        const config = modelsConfig1()
        const inputs = _setup(config)
        const instance = features.create(inputs)
        const context = await instance.loadLayers()
        const actual = await context.features.domain2.getFeature1()
        const expected = {
          myOutput: true,
        }
        assert.deepEqual(actual, expected)
      })
      it('should have the feature/services info when feature is run that calls service.', async () => {
        const config = customLayer1()
        const inputs = _setup(config)
        const instance = features.create(inputs)
        const context = await instance.loadLayers()
        await context.features.domain1.myFeature()
      })
      it('should produce layerLogger than when it logs, it has the domainName followed by the layerName', async () => {
        const config = customLayer1()
        const inputs = _setup(config)
        const instance = features.create(inputs)
        await instance.loadLayers()
        const actualContext =
          inputs.config[
            '@node-in-layers/core'
          ].domains[0].services.create.getCall(0).args[0]
        actualContext.log.info('Test me')
        const actual = inputs._logging.mockLogMethod.getCall(0).args[0].logger
        const expected = 'domain1:services'
        assert.deepEqual(actual, expected)
      })
      it('should produce domain1:services:logIt when a function logger is used in a service.', async () => {
        const config = customLayer1()
        const inputs = _setup(config)
        const instance = features.create(inputs)
        const fullContext = await instance.loadLayers()
        fullContext.services.domain1.logIt()
        const actual = inputs._logging.mockLogMethod.getCall(0).args[0].logger
        const expected = 'domain1:services:logIt'
        assert.deepEqual(actual, expected)
      })
      it('should pass domain1 customLayer to domain2 customLayer even if domain2 doesnt have a features layer', async () => {
        const config = customLayer1()
        const inputs = _setup(config)
        const instance = features.create(inputs)
        await instance.loadLayers()
        const actual =
          config[CoreNamespace.root].domains[1].customLayer.create.getCall(0)
            .args[0].customLayer
        const expected = {
          domain1: { domain1: 'custom' },
        }
        assert.deepEqual(actual, expected)
      })
      it('should NOT pass domain1 customLayer to domain2 entries', async () => {
        const config = customLayer2()
        const inputs = _setup(config)
        const instance = features.create(inputs)
        await instance.loadLayers()
        const actual =
          config[CoreNamespace.root].domains[1].entries.create.getCall(0)
            .args[0].customLayer
        assert.isUndefined(actual)
      })
      it('should pass domain1 models to domain1 services', async () => {
        const config = modelsConfig1()
        const inputs = _setup(config)
        const instance = features.create(inputs)
        await instance.loadLayers()
        const actual =
          config[CoreNamespace.root].domains[0].create.services.getCall(0)
            .args[0].models['domain1'].getModels
        assert.isOk(actual)
      })
      it('should have model CRUDS in services when modelCruds is true', async () => {
        const config = modelsConfig2()
        const inputs = _setup(config)
        const instance = features.create(inputs)
        const layers = await instance.loadLayers()
        const actual = Object.keys(layers.services.domain1.cruds)
        const expected = ['Model1']
        assert.isOk(actual)
      })
      it('should have model CRUDS in domain2.features when modelCruds is true', async () => {
        const config = modelsConfig2()
        const inputs = _setup(config)
        const instance = features.create(inputs)
        const layers = await instance.loadLayers()
        const actual = Object.keys(layers.features.domain2.cruds)
        const expected = ['Model1']
        assert.isOk(actual)
      })
      it('should NOT have model CRUDS in domain1.features when modelCruds is true because there are no features', async () => {
        const config = modelsConfig2()
        const inputs = _setup(config)
        const instance = features.create(inputs)
        const layers = await instance.loadLayers()
        const actual = get(layers, 'features.domain1.cruds')
        assert.isUndefined(actual)
      })
      describe('Model Cruds Logging and Factories', () => {
        it('should use the custom model cruds factory.', async () => {
          const customFactory = sinon.stub().returns({ create: () => 'custom' })
          const config = customFactoryConfig(customFactory)
          const inputs = _setup(config)
          const instance = features.create(inputs)
          const layers = await instance.loadLayers()

          assert.isTrue(customFactory.called)
          assert.equal(layers.services.domain1.cruds.Model1.create(), 'custom')
        })

        it('should use a specific custom model factory for a specific model.', async () => {
          const customFactory = sinon
            .stub()
            .returns({ create: () => 'custom-specific' })
          const factoryOverride = [
            {
              domain: 'domain1',
              model: 'Model1',
              factory: customFactory,
            },
          ]
          const config = customFactoryConfig(factoryOverride)
          const inputs = _setup(config)
          const instance = features.create(inputs)
          const layers = await instance.loadLayers()

          assert.isTrue(customFactory.called)
          assert.equal(
            layers.services.domain1.cruds.Model1.create(),
            'custom-specific'
          )
        })

        it('should NOT use a custom model factory when it isnt that specific model.', async () => {
          const customFactory = sinon
            .stub()
            .returns({ create: () => 'custom-specific' })
          const factoryOverride = [
            {
              domain: 'domain1',
              model: 'Model1',
              factory: customFactory,
            },
          ]
          const config = customFactoryConfig(factoryOverride)
          const inputs = _setup(config)
          const instance = features.create(inputs)
          const layers = await instance.loadLayers()

          // Model2 should not use the custom factory
          assert.isFunction(layers.services.domain1.cruds.Model2.create)
          assert.notEqual(
            layers.services.domain1.cruds.Model2.create,
            'custom-specific'
          )
        })

        it('should NOT log wrap if noModelLogWrap is true', async () => {
          // noModelLogWrap = true
          const config = customFactoryConfig(undefined, undefined, true)
          const inputs = _setup(config)
          const instance = features.create(inputs)
          const layers = await instance.loadLayers()

          await layers.services.domain1.cruds.Model1.retrieve('123')

          // The logger should not have been called with cruds:Model1:retrieve
          const logCalls = inputs._logging?.mockLogMethod?.getCalls() || []
          const crudsLogs = logCalls.filter(
            call => call.args[0].function === 'cruds:Model1:retrieve'
          )
          assert.equal(crudsLogs.length, 0)
        })

        it('should NOT log wrap if the domain is ignored', async () => {
          const config = customFactoryConfig(undefined, { domain1: true })
          const inputs = _setup(config)
          const instance = features.create(inputs)
          const layers = await instance.loadLayers()

          await layers.services.domain1.cruds.Model1.retrieve('123')

          const logCalls = inputs._logging?.mockLogMethod?.getCalls() || []
          const crudsLogs = logCalls.filter(
            call => call.args[0].function === 'cruds:Model1:retrieve'
          )
          assert.equal(crudsLogs.length, 0)
        })

        it('should NOT log wrap if the domain.layer is ignored', async () => {
          const config = customFactoryConfig(undefined, {
            'domain1.services': true,
          })
          const inputs = _setup(config)
          const instance = features.create(inputs)
          const layers = await instance.loadLayers()

          await layers.services.domain1.cruds.Model1.retrieve('123')

          const logCalls = inputs._logging?.mockLogMethod?.getCalls() || []
          // Services shouldn't be logged because it's ignored
          const crudsLogs = logCalls.filter(
            call => call.args[0].function === 'cruds:Model1:retrieve'
          )
          assert.equal(crudsLogs.length, 0)
        })

        it('should log wrap other domain layers if the domain.layer is not ignored', async () => {
          const config = customFactoryConfig(undefined, {
            'domain1.services': true,
          })
          const inputs = _setup(config)
          const instance = features.create(inputs)
          const layers = await instance.loadLayers()

          // Features are NOT ignored! Let's call a feature CRUDS function.
          await layers.features.domain1.cruds.Model1.retrieve('123')

          const logCalls = inputs._logging?.mockLogMethod?.getCalls() || []
          const crudsLogs = logCalls.filter(
            call => call.args[0].function === 'cruds:Model1:retrieve'
          )
          // It wrdomained the features layer! Should have "running" and "completed" (2 logs)
          assert.equal(crudsLogs.length, 2)
        })

        it('should NOT log wrap if the domain.*.PluralName is ignored', async () => {
          const config = customFactoryConfig(undefined, {
            'domain1.*.Model1': true,
          })
          const inputs = _setup(config)
          const instance = features.create(inputs)
          const layers = await instance.loadLayers()

          await layers.services.domain1.cruds.Model1.retrieve('123')
          await layers.services.domain1.cruds.Model2.retrieve('123')

          const logCalls = inputs._logging?.mockLogMethod?.getCalls() || []

          // Verify no Model1 logs
          const model1Logs = logCalls.filter(
            call => call.args[0].function === 'cruds:Model1:retrieve'
          )
          assert.equal(model1Logs.length, 0)

          // Model2 is NOT ignored, it should log 2 messages.
          const model2Logs = logCalls.filter(
            call => call.args[0].function === 'cruds:Model2:retrieve'
          )
          assert.equal(model2Logs.length, 2)
        })

        it('should include the model property in the log output when executing cruds', async () => {
          const config = customFactoryConfig()
          const inputs = _setup(config)
          const instance = features.create(inputs)
          const layers = await instance.loadLayers()

          await layers.features.domain1.cruds.Model1.retrieve('123')

          const logCalls = inputs._logging?.mockLogMethod?.getCalls() || []

          // Find the logs for the retrieve function we just called
          const retrieveLogs = logCalls.filter(
            call =>
              call.args[0]?.function === 'cruds:Model1:retrieve' &&
              call.args[0]?.layer === 'features'
          )

          // Ensure we found some logs
          assert.isAbove(retrieveLogs.length, 0)

          // Assert that the 'model' property is present and matches the model name
          retrieveLogs.forEach(log => {
            assert.equal(log.args[0].model, 'Model1')
            assert.equal(log.args[0].layer, 'features')
          })
        })
      })

      describe('#getModels()', () => {
        it('should have Model1 in output', async () => {
          const config = modelsConfig1()
          const inputs = _setup(config)
          const instance = features.create(inputs)
          await instance.loadLayers()
          const actual = config[CoreNamespace.root].domains[0].create.services
            .getCall(0)
            .args[0].models['domain1'].getModels().Model1
          assert.isOk(actual)
        })
        it('should NOT create Model1 if getModels isnt called', async () => {
          const config = modelsConfig1()
          const inputs = _setup(config)
          const instance = features.create(inputs)
          await instance.loadLayers()
          assert.isFalse(
            config[CoreNamespace.root].domains[0].models.Model1.create.called
          )
        })
        it('should create Model1 when getModels() is called', async () => {
          const config = modelsConfig1()
          const inputs = _setup(config)
          const instance = features.create(inputs)
          await instance.loadLayers()
          config[CoreNamespace.root].domains[0].create.services
            .getCall(0)
            .args[0].models['domain1'].getModels()
          assert.isTrue(
            config[CoreNamespace.root].domains[0].models.Model1.create.called
          )
        })
        it('should use CustomModelFactory provided by the config', async () => {
          const config = customModelsConfig1()
          const inputs = _setup(config)
          const instance = features.create(inputs)
          await instance.loadLayers()
          config[CoreNamespace.root].domains[3].services.create
            .getCall(0)
            .args[0].models['domain2'].getModels()
          assert.isTrue(
            config[CoreNamespace.root].domains[0].CustomModelFactory.called
          )
        })
        describe('#getModel()', () => {
          it('should pass domain1 models via the getModel to domain2 models', async () => {
            const config = modelsConfig1()
            const inputs = _setup(config)
            const instance = features.create(inputs)
            await instance.loadLayers()
            config[CoreNamespace.root].domains[1].create.services
              .getCall(0)
              .args[0].models['domain2'].getModels()
            const actual = config[
              CoreNamespace.root
            ].domains[1].models.Model2.create
              .getCall(0)
              .args[0].getModel('domain1', 'Model1')()
              .getModelDefinition().pluralName
            const expected = 'Model1'
            assert.isOk(expected)
          })
        })
      })
      it('should pass domain1 models to domain1 services', async () => {
        const config = modelsConfig1()
        const inputs = _setup(config)
        const instance = features.create(inputs)
        await instance.loadLayers()
        const actual =
          config[CoreNamespace.root].domains[0].create.services.getCall(0)
            .args[0].models['domain1']
        assert.isOk(actual)
      })
      it('should call layerB of domain2', async () => {
        const config = compositeLayersConfig1()
        const inputs = _setup(config)
        const instance = features.create(inputs)
        await instance.loadLayers()
        const actual =
          config[CoreNamespace.root].domains[1].create.layerB.called
        assert.isTrue(actual)
      })
      it('should show NOT show features when layer C is loaded', async () => {
        const config = compositeLayersConfig1()
        const inputs = _setup(config)
        const instance = features.create(inputs)
        await instance.loadLayers()
        const actual =
          config[CoreNamespace.root].domains[1].create.layerC.getCall(0).args[0]
        assert.isUndefined(actual.features)
      })
      it('should show only layer A and Layer B when layer C is loaded', async () => {
        const config = compositeLayersConfig1()
        const inputs = _setup(config)
        const instance = features.create(inputs)
        await instance.loadLayers()
        const actual =
          config[CoreNamespace.root].domains[1].create.layerC.getCall(0).args[0]
        assert.isOk(actual.layerA)
        assert.isOk(actual.layerB)
      })
      it('should show only layer A when layer B is loaded', async () => {
        const config = compositeLayersConfig1()
        const inputs = _setup(config)
        const instance = features.create(inputs)
        await instance.loadLayers()
        const actual =
          config[CoreNamespace.root].domains[1].create.layerB.getCall(0).args[0]
        assert.isOk(actual.layerA)
        assert.isUndefined(actual.layerB)
      })
      it('should load services for fakedomain', async () => {
        const inputs = _setup()
        const instance = features.create(inputs)
        const actual = await instance.loadLayers()
        assert.isOk(actual.services['fakedomain'])
      })
      it('should allow lower service domain to call higher service domain using getServices()', async () => {
        const config = crossDomainServiceLookupConfig()
        const inputs = _setup(config)
        const instance = features.create(inputs)
        const layers = await instance.loadLayers()
        const actual = layers.services.domain1.myFunc()
        const expected = 'Hello World'
        assert.deepEqual(actual, expected)
      })
      it('should allow features to call services using getServices()', async () => {
        const config = crossDomainVisibilityConfig()
        const inputs = _setup(config)
        const instance = features.create(inputs)
        const layers = await instance.loadLayers()
        const actual = layers.features.domain1.callHigherService()
        const expected = 'Hello World'
        assert.deepEqual(actual, expected)
      })
      it('should blow up when a service tries to call context.features.getFeatures()', async () => {
        const config = crossDomainVisibilityConfig()
        const inputs = _setup(config)
        const instance = features.create(inputs)
        const layers = await instance.loadLayers()
        assert.throws(() =>
          layers.services.domain1.blowUpIfTryingToReadFeatures()
        )
      })
      it('should allow a higher-than-features layer to call getFeatures()', async () => {
        const config = higherThanFeaturesLayerCanGetFeaturesConfig()
        const inputs = _setup(config)
        const instance = features.create(inputs)
        const layers = await instance.loadLayers()
        const actual = layers.customLayer.domain2.callHigherFeature()
        const expected = 'Hello World'
        assert.deepEqual(actual, expected)
      })
      it('should load features for fakedomain', async () => {
        const inputs = _setup()
        const instance = features.create(inputs)
        const actual = await instance.loadLayers()
        assert.isOk(actual.features['fakedomain'])
      })
      it('should NOT load features for fakedomain2', async () => {
        const inputs = _setup()
        const instance = features.create(inputs)
        const actual = await instance.loadLayers()
        assert.isUndefined(actual.features['fakedomain2'])
      })
      it('should throw an exception when there is an domain that has a services object but create produced nothing', async () => {
        const inputs = _setup(validConfig3())
        const instance = features.create(inputs)
        const promise = instance.loadLayers()
        return assert.isRejected(promise)
      })
      describe('cross-layer props preservation through layer wrdomaining', () => {
        it('should pass extended cross-layer props through to a wrdomained service function', async () => {
          const { config, getCapturedFromService } =
            crossLayerPropsPreservationConfig()
          const inputs = _setup(config)
          const instance = features.create(inputs)
          const layers = await instance.loadLayers()

          layers.services.domain1.captureProps(
            { some: 'arg' },
            {
              logging: { ids: [{ requestId: '123' }] },
              requestInfo: { requestId: 'abc-123' },
            }
          )

          assert.deepEqual(getCapturedFromService()?.requestInfo, {
            requestId: 'abc-123',
          })
        })

        it('should inject logging ids when no cross-layer props are passed to a wrdomained service function', async () => {
          const { config, getCapturedFromService } =
            crossLayerPropsPreservationConfig()
          const inputs = _setup(config)
          const instance = features.create(inputs)
          const layers = await instance.loadLayers()

          layers.services.domain1.captureProps({ some: 'arg' })

          assert.isArray(getCapturedFromService()?.logging?.ids)
        })

        it('should pass extended cross-layer props through the context.services wrdomainer when one domain calls another', async () => {
          const { config, getCapturedFromService } =
            crossLayerPropsPreservationConfig()
          const inputs = _setup(config)
          const instance = features.create(inputs)
          const layers = await instance.loadLayers()

          layers.services.domain2.proxyTodomain1(
            { some: 'arg' },
            {
              logging: { ids: [{ requestId: '456' }] },
              requestInfo: { requestId: 'xyz-789' },
            }
          )

          assert.deepEqual(getCapturedFromService()?.requestInfo, {
            requestId: 'xyz-789',
          })
        })
      })
    })
  })
})
