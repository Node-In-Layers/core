import fs from 'node:fs'
import sinon from 'sinon'
import hb from 'handlebars'
import {
  Config,
  FSLike,
  LogFormat,
  LogLevelNames,
  CoreNamespace,
} from '../src/types.js'

const CONFIG_FILE = './config.unit-test.mjs'

const createMockFs = (): FSLike => {
  const mkdirSync = sinon.stub()
  const readFileSync = sinon.stub()
  const writeFileSync = sinon.stub()
  const existsSync = sinon.stub()
  const lsStatMock = {
    isFile: sinon.stub(),
    isDirectory: sinon.stub(),
    isBlockDevice: sinon.stub(),
    isCharacterDevice: sinon.stub(),
    isSymbolicLink: sinon.stub(),
    isFIFO: sinon.stub(),
    isSocket: sinon.stub(),
  }
  const lstatSync = sinon.stub().returns(lsStatMock)
  return {
    mkdirSync,
    readFileSync,
    writeFileSync,
    existsSync,
    lstatSync,
  }
}

const writeUnitTestConfig = (config: Config) => {
  const configTemplate = fs.readFileSync(
    //'../templates/config.mjs.handlebars',
    './test/templates/config.mjs.handlebars',
    'utf8'
  )
  const template = hb.compile(configTemplate)
  const data = {
    content: new hb.SafeString(JSON.stringify(config, null, 2)),
  }
  const text = template(data)
  fs.writeFileSync(CONFIG_FILE, text)
}

const deleteUnitTestConfig = () => {
  if (fs.existsSync(CONFIG_FILE)) {
    fs.rmSync(CONFIG_FILE)
  }
}

const validConfig1 = () => ({
  environment: 'unit-test',
  systemName: 'nil-core',
  [CoreNamespace.root]: {
    domains: [
      {
        name: 'test',
      },
    ],
    layerOrder: ['services', 'features'],
    logging: {
      logFormat: LogFormat.full,
      logLevel: LogLevelNames.silent,
    },
  },
})

const validConfig2 = () => ({
  environment: 'unit-test',
  systemName: 'nil-core',
  [CoreNamespace.root]: {
    domains: [
      {
        name: 'fakedomain',
        services: {
          create: () => ({}),
        },
        features: {
          create: () => ({}),
        },
      },
      {
        name: 'fakedomain2',
        services: {
          create: () => ({}),
        },
      },
    ],
    layerOrder: ['services', 'features'],
    logging: {
      logFormat: LogFormat.full,
      logLevel: LogLevelNames.debug,
    },
  },
})

const validConfig3 = () => ({
  environment: 'unit-test',
  systemName: 'nil-core',
  [CoreNamespace.root]: {
    domains: [
      {
        name: 'fakedomain',
        services: {
          create: () => ({}),
        },
        features: {
          create: () => undefined,
        },
      },
    ],
    layerOrder: ['services', 'features'],
    logging: {
      logFormat: LogFormat.full,
      logLevel: LogLevelNames.silent,
    },
  },
})

export {
  createMockFs,
  validConfig3,
  validConfig2,
  validConfig1,
  deleteUnitTestConfig,
  writeUnitTestConfig,
}
