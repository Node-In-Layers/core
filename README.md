# Node In Layers

![Unit Tests](https://github.com/node-in-layers/nil-core/actions/workflows/ut.yml/badge.svg?branch=main)
[![Coverage Status](https://coveralls.io/repos/github/Node-In-Layers/nil-core/badge.svg?branch=main)](https://coveralls.io/github/Node-In-Layers/nil-core?branch=main)

<img src="./public/nil.png" width="160" height="150" />

Rapid, batteries included, opinionated web development with functional node.

[Extensive Documentation](https://node-in-layers.github.io/nil-core/)

## The Batteries Included

- REST Backend (Model/Controller)
- Fully featured ORM database system inspired by Django, with support for opensearch, mongo, dynamodb, postgres, sqlite and mysql
- Can be used on Backends, Frontends, and SDK/Clients.
- AI MCP Ready. (Check out our MCP development server below)

## IONSH Opinions

Don't be offended by our unhumble opinions, because everyone has them. Just know they give us a wide structure to lean on to produce rapidly.

- Code needs to be developed, really really fast, optimizing as we go where we know matters, and then further optimizing later.
- Creating systems that use a consistent, cohesive, and documented structure is awesome.
- Immutable and functional code is better than other code, in 99% of cases.
- A regular boring React frontend with a regular boring REST backend, is truly good enough for 99% of situations.
- Auto create boilerplate whenever possible, and keep this system not hard to setup/build/understand/maintain (_cough_ Nextjs)
- Dependency injection, saves lives.

# How A Node In Layers System is Built.

Node In Layers provides all of the frameworky stuff so that you can focus on the problem you are trying to solve or opportunity you are trying to seek. In order to do that, there are two concepts that are used heavily

1. Cohesion
1. Layers

## Cohesive Domains (formerly Apps)

Similar to Python's Django or the Ruby on Rails framework, Node In Layers follows a cohesive "domain" pattern. What this means, is that code is easy to find and understand where it goes, not just by its "categorical structural" nature (is this a model, view or controller?) but by what code it "belongs" near.

An example is "auth". All code related to authentication and users, could go into an "domain" called "auth". That way, if you want to know where authentication is happening, take a look at the "auth" layer.

### Namespaces - The name of a domain.

Domains can and should have simple names. Example: `auth`. However for package creators, consider using a namespace to group domains that are part of a package.
A namespace is both a simple domain name, as well as a domain name that has a prefix with a package name on it.

An example:

```typescript
// This is the name of this overall package, but it doesn't define a specific domain.
const packageName = '@node-in-layers/core'

// These are domains within the package itself.
const abcDomain = '@node-in-layers/core/abc'
const xyzDomain = '@node-in-layers/core/xyz'
```

## Systemic Architecture

After an extensive development career looking for the best methods, and trying to keep up with the rate of change, eventually one will stumble upon the reality that nearly systems follow predictable structures. One of these structures follows the natural course of how a parts within a system works together, as well as where the complicated and easy parts are. The trouble in most systems is that complexity and known troublesome code concepts are embedded throughout the application rather than putting them in well-defined areas that can be understood and maintained.

A well organized system tends to be defined in "layers", where parts of the system are designed to speak to certain other parts of the system.

When a system is designed from the start using distinct layers, it makes it really easy to reuse code, as well as refactor when real world situations change.

# The Primary Layers

Node In Layers comes with 5 layers out of the box (but more can be created). They are the following:

- Globals
- Services
- Features
- Entries

## Globals - The Everywhere Layer

Node In Layers is a dependency injection framework as well as an opinionated framework that heavily suggests how code should be organized and initiated. There are items that exist throughout a system that every single layer uses. Configurations, environment variables, etc.

Unlike every other layer in Node In Layers, this "globals" layer is a special "layer." This layer is made widely available throughout the system, and has no namespaces. (Therefore be careful of collisions).

Simply create a constructor function in an apps `globals.ts` file, and it will create the dependencies at the beginning of runtime, and then distributed up the app stack.

### Services - The Outside World Communicators

When a system needs to no longer operate in "abstract land", you have something we call services. These are the functions that communicate out into the world and have to deal with the most complicated, uncontrolled, state and situations. These functions, if not handled carefully, are the most dangerous parts of the system because any changes, can often lead to costly refactors. "Want to switch from sqlite to mongo? Good luck".

### Features - The primary purposes of a system

Every system has features. A feature is ultimately made up of multiple steps laid out in a sequence. They are most often the things that people say the system does. "It can create a user" - therefore create "createUser". In this area of the code, one step follows another and many things are accomplished in one go. The sum of those steps together make up a whole. Something to be keenly aware of is that features are business specific so they don't include any code that relates to exactly how that feature gets executed.

## Entries - The starting points

In order to kick off a feature, you need a place to do it. Command lines, web application endpoints, cloud serverless handlers. The same feature can be run from multiple locations. Any code that is related to how specifically parts of your system will run, we call "entries".

One example is Express server code. There is considerable plumbing to get an express server to work (apps, routers, controllers). This plumbing code is used to create multiple entry points into the code via a listening server that has multiple endpoints.

## Honorable Mentions

### Models - Data Enhanced

Models are a first class concept in Node In Layers, and is described fully below.

### Utils - The Math Functions

There is abstract "math" like code, that could be reused in any number of systems, features and applications. Things like a "list". We call them "utilities". These can be used anywhere in the system, so we congregate them into `utils.ts` files.

### Libs - The Reusable Business Bricks

There are low level small functions that take one thing and give you something else. It is always very specific to a business problem, but it's something that could conceivably be used again and again.

"Parse the customer id from this JSON Order".

These functions, either combine things and produce one thing, or make many things from one thing, or they take one thing and convert it into something else. Transforms is a probably the best technical word but we just call them "libs". One thing to note, every function of the libs layer, does "one primary thing" and should be as small as reasonable. Too many steps can (but not always) indicate it might be a feature.

## More Layers

In addition to the default layers, Node In Layers allows you to create new layers and place them where you want. Our ONLY requirement, is that default layers that are loaded (services, features, entries) must be above one another. Other than that, you can create layers below, above, or in between these.

## Composite Layers

Layering by its nature is a vertical stack approach. Each layer sits on top of each other, and only has access to what is below it.

However, sometimes there is a need to create a layer via combining multiple smaller layers. This creates a single horizontal layer. We call these composite layers.

#### Vertical Layers

```
[ Layer 1 ]
[ Layer 2 ]
[ Layer 3 ]
```

#### Composite Layers (Horizontal Layers)

```
                [ Layer 1 ]
[ Sub-Layer 1 ][ Sub-Layer 2][ Sub-Layer 3]
                [ Layer 3 ]
```

This is very easy to accomplish in this package.

## How To Implement Composite Layers

When you create your configuration file you use the `layerOrder` property to identify your layers. You can also add in arrays within this array, that has a list of names. This will load each of those layers and combine them together.

Note: In a standard functional way, the composite layers are loaded one at a time, and only have access to the previous layer information. This is to prevent cyclical references, which are an indication of a design that needs to be reworked. Unlike vertical layers which ONLY have access to what is below it, composite layers have access to everything to the left of them and just below. This will be explained below.

### How Composite Layers Are Loaded And What They Have Access To.

Imagine you have the following system.

```
                [ Layer 3 ]
[ Sub-Layer 1 ][ Sub-Layer 2][ Sub-Layer 3]
                [ Layer 1 ]
```

There are 3 layers here. 1, 2, and 3.
1 and 3 are normal layers, while layer 2 is a composite layer, composed of 3 composite-layers.

1. Layer 1 is loaded first, then layer 2, and then layer 3.
2. When layer 2 is being loaded it is loaded from left to right.
3. Sub-Layer 1, then Sub-layer 2, then Sub-layer 3.
4. All of layer 2 has access to layer 1. However, the sub layers only have access to the sub-layers that are before it. (But they have access to all of the layers before it).
5. Once layer 2 is finished, layer 3 is loaded, and has access to each of the components of layer 2.

So...

- Sub-Layer 1 only has access to Layer 1
- Sub-Layer 2 has access to Sub-Layer 1 as well as Layer 1
- Sub-Layer 3 has access to Sub-Layers 1 and 2, as well as Layer 1

# Logging

Node in layers, has a built in enterprise tracing level logging system. Every function for every domain and layer is automatical wrapped with log messages. These log messages not only state which function has been called, but also the inputs and results of every function. To create comprehensive tracing, ids can be passed from layer to layer, which are then combined together as a stack which will show the execution path of an entire system.

## Important: Pass CrossLayerProps between functions at the end

To make this work every function is automatically passed a CrossLayerProps argument at the end of the function. The only requirement to have tracing of execution from top to bottom, is to pass this CrossLayerProps between features/services at the very end of each function call. <b>If you do not pass the CrossLayerProps between feature/service calls, ids will not flow across.</b>

## Example

If you wish to create additional log messages, you can use:

```typescript
const log = context.log.getInnerLog('yourFunctionName', crossLayerProps)
log.info('A log inside')
```

```typescript
// A service
const create = context => {
  // If this function is called, logs above and below are created
  const myService = (
    arg: string,
    crossLayerProps?: CrossLayerProps
  ): Promise<string> => {
    return Promise.resolve().then(() => {
      const log = context.log.getInnerLogger('myService', crossLayerProps)
      log.trace('A log message within the function')
      return `Hello ${arg}`
    })
  }
  return {
    myService,
  }
}

// A feature
const create = context => {
  // If this function is called, logs above and below are created
  const myFeature = (crossLayerProps?: CrossLayerProps): Promise<string> => {
    return context.services.aService.myService('World', crossLayerProps)
  }
  return {
    myService,
  }
}
```

## OpenTelemetry Support (optional)

You can send the framework’s logs, spans, and metrics to OpenTelemetry so they show up in OTel-backed tools (Jaeger, Tempo, Elastic, etc.). The existing NIL tracing model (ids + `crossLayerProps`) stays the same; OTel is just another place to see it.

### 1. Install OpenTelemetry APIs (required)

NIL’s OTel integration talks to the OTel APIs; you bring the concrete SDK and exporters. At minimum you need:

```bash
npm install @opentelemetry/api @opentelemetry/api-logs
```

### 2. Install a Node SDK and exporters (Node backend example)

For a typical Node backend that exports traces/logs/metrics over OTLP HTTP:

```bash
npm install \
  @opentelemetry/sdk-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-logs-otlp-http \
  @opentelemetry/exporter-metrics-otlp-http
```

You can use any OTel setup (NodeSDK, manual providers, auto-instrumentation, etc.) as long as it registers global providers in your process.

### 3. Configure core logging and explicitly wire exporters (config files)

All OTel integration on the NIL side is driven by `config[CoreNamespace.root].logging`. You also own the lifecycle of your OTel SDK/exporters. A simple Node config might look like:

```typescript
// /config.base.mts
import { CoreNamespace, LogFormat, LogLevelNames } from '@node-in-layers/core'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
// Optional: add log / metric exporters as needed.
// import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
// import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'

// Exported so it can be reused from other entrypoints if needed.
export const setupOtel = () => {
  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({
      // Or read from env: OTEL_EXPORTER_OTLP_ENDPOINT, etc.
      url:
        process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
        'http://localhost:4318/v1/traces',
    }),
    // logsExporter: new OTLPLogExporter({}),
    // metricReader: new PeriodicExportingMetricReader({
    //   exporter: new OTLPMetricExporter({}),
    // }),
  })

  // Start the SDK as part of your normal config/bootstrap path.
  void sdk.start()
  return sdk
}

export default () => {
  // Ensure exporters are created as part of the normal setup process,
  // rather than being implicitly created by NIL.
  setupOtel()

  return {
    systemName: 'your-system-name',
    [CoreNamespace.root]: {
      logging: {
        logLevel: LogLevelNames.info,

        // Send logs both to console (JSON) and to OpenTelemetry
        logFormat: [LogFormat.json, LogFormat.otel],

        // OpenTelemetry settings for this system
        otel: {
          serviceName: 'your-system-name',
          version: '1.0.0',

          // Enable OTel logs (used by LogFormat.otel)
          logs: { enabled: true },

          // Optional: enable spans and metrics for wrapped layer functions
          trace: { enabled: true },
          metrics: { enabled: true },
        },
      },
    },
  }
}
```

When `loadSystem()` runs, it:

- Creates the OTel services domain.
- Wires NIL’s internal OTel helpers based on `logging.otel`
- Makes `context.services['@node-in-layers/core/otel']` available to layers (trace/metrics/logs helpers).

### 4. What actually gets sent to OpenTelemetry

- **Logs** (via `LogFormat.otel`):

  - Every framework log is forwarded to OTel with:
    - `body` = log message
    - `severityNumber` / `severityText` mapped from NIL `logLevel`
    - Attributes:
      - `logger` (e.g. `domain:layer:function`)
      - `environment`
      - All ids from `logMessage.ids`, flattened into keys like `runtimeId`, `featureId`, `featureId-2`, `requestId`, `requestId-2`, etc.
      - `error` when present

- **Spans** (optional, via `runWithTraceAndMetrics`):

  - NIL starts a span per wrapped layer function (name = `layer:function`).
  - Span attributes include the same flattened ids (so your `functionCallId` etc. travel with the span).

- **Metrics** (optional, via `runWithTraceAndMetrics`):
  - Histograms `layer.function.duration` (ms) and counters `layer.function.calls`, with attributes `{ layer, function }`.

Your OpenTelemetry SDK and exporters decide where this data goes (OTLP, vendor backend, etc.). NIL’s job is to forward structured logs/ids and layer identity into the OTel APIs, based purely on configuration.

# Models

Models in Node in Layers are a first class concept. What this means, is that many, if not most, systems are built around data, and therefore the use of Models is anticipated and made as easy as possible with Node In Layers.

With just a bit of configuration and convention, models are automatically configured and loaded and access is easy. Other additional modules such as the `@node-in-layers/data` package, take this to the next level by providing automatic REST for all the models.

## Creating Models

You can create models for an app by creating a directory called "models" and inside placing one model per file. Like so:

```
/src/transportation/models/
/src/transportation/models/index.ts
/src/transportation/models/aircrafts.ts
/src/transportation/models/vehicles.ts
```

When the models are loaded at run time, the index.ts file is examined for each of the model constructors. It should look like...

```typescript
export * as Aircrafts from './aircrafts'
export * as Vehicles from './vehicles'
```

This way the system can do...

```typescript
apps.yourApp.models.Aircrafts.create()
```

If this index.ts file does not exist, and does not export your model, it is not read into the system.

Model files should look like this:

```typescript
// /src/transportation/models/Vehicle.ts
import {
  ModelFactory,
  Orm,
  TextProperty,
  PrimaryKeyUuidProperty,
} from 'functional-models'
import { ModelProps } from '@node-in-layers/core'
import { Vehicle } from '../types'

/* From types.ts
type Vehicle = Readonly<{
  id: string,
  make: string,
  model: string,
  color: string,
}>
 */

/**
 * Your factory function to create your model.
 * @param props - You get a ModelFactory, a ModelFetcher, and a getModels() function, all of which can be used to create your model.
 */
const create = ({ Model, fetcher, getModels }: ModelProps) => {
  return Model({
    pluralName: 'Vehicles',
    namespace: 'transportation',
    properties: {
      id: PrimaryKeyUuidProperty(),
      make: TextProperty({ required: true }),
      model: TextProperty({ required: true }),
      color: TextProperty({ required: true }),
    },
  })
}
export { create }
```

NOTE: This is a simplified version just to show the file and folder structure, a full description of models and modeling can be found elsewhere.

## Models AutoLoaded For Services and Features

Models are predominantly used in services and features, so they are therefore automatically implemented, wrapped and placed in each. This will now be explained.

### ModelFactory

The ModelFactory is the base object that creates models. By default, Node In Layers uses `import { Model } from 'functional-models'`. This provides basic Modelling functionality, but does not provide an ORM by default. This is to accommodate both front ends and backends, or other situations where the system isn't using the CRUDS functionality of modeling.

However, a system can define a different ModelFactory that can provide extended functionality by modifying the configuration file. You can change both the default ModelFactory that all models receive and the ModelFactory for specific Models. This is common in multiple datastore situations.

Here is an example where `@node-in-layers/data` is used to provide a backend database, therefore overriding the default ModelFactory. The value is a namespace, that will exist with a services context, that has a `getModelProps(context: string)` function.

```javascript
// /config.prod.mjs
import { CoreNamespace } from '@node-in-layers/core/index.js'
import { DataNamespace } from '@node-in-layers/data/index.js'

// Core configurations
const core = {
  apps: await Promise.all([
    import('@node-in-layers/data/index.js'),
    import('./src/my-custom-model-factory/index.js'),
    import('./src/my-auth/index.js'),
    import('./src/my-app/index.js'),
  ]),
  layerOrder: ['services', 'features', 'entries'],
  logging: {
    logLevel: 'debug',
    logFormat: 'full',
  },
  // Optional: Overrides the default
  modelFactory: '@node-in-layers/data',
  // Needed for orm features. (Described below)
  modelCruds: true,
  // Optional: Used for a multi-database situation.
  customModelFactory: {
    // Which namespace has the model/s we want to override?
    ['my-auth']: {
      // Which namespace has the services that contains our override?
      Users: 'custom-namespace/app',
      // Optional Form: First argument is the namespace, the rest are arguments that can be passed in. In this case, we are choosing a different datastore with @node-in-layers/data
      Keys: ['@node-in-layers/data', 'namedDatastore'],
    },
  },
}

// @node-in-layers/data configuration
const data = {
  databases: {
    default: {
      datastoreType: 'memory',
    },
    namedDatastore: {
      datastoreType: 'dynamo',
    },
  },
}

export default () => ({
  systemName: 'my-example-system',
  environment: 'prod',
  [CoreNamespace.root]: core,
  [DataNamespace.root]: data,
})
```

#### NOTE: Model Loading Order

You need to know that loading apps in order will affect the ability to reference other models. So if your model has a reference to another model, that model needs to be in an app loaded before your app. The one exception to this, is if your model is within the same app.

Here is an example of both a model that needs a model from a previously loaded app and the same app:

```typescript
// /src/transportation/models/Vehicle.ts
import {
  ModelFactory,
  Orm,
  TextProperty,
  PrimaryKeyUuidProperty,
} from 'functional-models'
import { ModelProps } from '@node-in-layers/core'
// Business app is loaded before transportation
import { Vendor } from '../business/types'
import { Vehicle, Driver } from '../types'

const create = ({ Model, fetcher, getModel }: ModelProps) => {
  return Model({
    pluralName: 'Vehicles',
    namespace: 'transportation',
    properties: {
      id: PrimaryKeyUuidProperty(),
      // NOTE: Vendors is a function that gets the model
      make: ModelReference<Vendor>(getModel('business', 'Vendors'), {
        required: true,
      }),
      model: TextProperty({ required: true }),
      color: TextProperty({ required: true }),
      // Drivers model is in the same app.
      driver: ModelReference<Driver>(getModel('transportation', 'Drivers')),
    },
  })
}
export { create }
```

#### NOTE: Custom Model Factories and Models

You'll notice above that the custom model factory was created and provided in a different app, that exists BEFORE our models. This is extremely important. Models are loaded just before services, so that they can be provided to services. This means that any custom `getModelProps(storeName: string)` function must exist in a services prior to the currently being loaded services.

### Services

Services have access to models in two different ways automatically.

1. Accessing models directly
1. Automatically generated CRUDS wrappers for models. (orm only)

#### Accessing Models Directly

Service layers can get direct access to models through the context. It takes this format
`context.models[AppNamespace].getModels().ModelPluralName`

Here is an example of this in action.

```typescript
import { ModelType } from 'functional-models'
import { Config } from '@node-in-layers/core'

type ModelCrud = {
  getModel: Function
  create: Function
  retrieve: Function
  update: Function
  delete: Function
  search: Function
}
type Vehicle = {}

type ModelContext<T extends object = object> = {
  getModels: () => T
}

type TransportationModels = ModelContext<{
  ['transportation']: {
    Vehicles: ModelType<Vehicle>
  }
}>

const services = {
  create: (context: ServicesContext<Config, TransportationModels>) => {
    const myServiceThatNeedsModels = (v: Vehicle) => {
      const instance = context.models.transportation
        .getModels()
        .Vehicles.create(v)
      return instance.validate()
    }

    return {
      myServiceThatNeedsModels,
    }
  },
}
```

#### Automatically Generated CRUDS Wrappers

The common way of accessing models, is through wrappers that are automatically built to expose a CRUDS api on a model. NOTE: This occurs when the system has been configured to have an ORM (unlike most frontends). This is shown below.

Features can use these wrappers without having to know anything about "models", by just passing the data. This creates a streamline approach to exposing models all the way up to entries / such as a REST API. This same concept is applied at the features level (described below), so that there is a pathway from top to bottom to CRUDS models, <b>without having to write a bunch of boilerplate common in other systems like Django</b>.

You can access the wrappers by doing the following:
`context.services[AppNamespace].cruds.ModelPluralName`

Each of these models contains the following functions:

```typescript
const create = (data: object) => Promise<object>
const retrieve = (id: PrimaryKeyType) => Promise<object|undefined>
const update = (id: PrimaryKeyType, data: object) => Promise<object>
const delete = (id: PrimaryKeyType) => Promise<void>
const search = (ormSearch: OrmSearch) => Promise<object>
const getModel = () => OrmModel<object>
```

### Features

Models are directly accessible by features, as well as through any service wrappers. Wrappers are only available when the system is configured to have an orm (shown down below).

Included out of the box for orm systems, are feature level wrappers that wrap over the service wrappers, giving access to the CRUDS API higher than features. (Such as entries and REST apis).

This can be access by doing...

`context.features[AppNamespace].cruds.ModelPluralName`

### Configuring System for ORM Models

In order to enable service and feature CRUDS automatically the core configuration needs to have `modelCruds:true`. This is shown below:

```javascript
// /config.prod.mjs
import { CoreNamespace } from '@node-in-layers/core/index.js'
import { DataNamespace } from '@node-in-layers/data/index.js'

// Core configurations
const core = {
  apps: await Promise.all([
    import('@node-in-layers/data/index.js'),
    import('./src/my-custom-model-factory/index.js'),
    import('./src/my-auth/index.js'),
    import('./src/my-app/index.js'),
  ]),
  layerOrder: ['services', 'features', 'entries'],
  logging: {
    logLevel: 'debug',
    logFormat: 'full',
  },
  //
  modelFactory: '@node-in-layers/data',
  // Optional: True gives CRUDS, False/Undefined does not
  modelCruds: true,
}

// @node-in-layers/data configuration
const data = {
  databases: {
    default: {
      datastoreType: 'memory',
    },
  },
}

export default () => ({
  systemName: 'my-example-system',
  environment: 'prod',
  [CoreNamespace.root]: core,
  [DataNamespace.root]: data,
})
```

# Cohesive Layers In Action

Here is an example file breakdown for a coehsive layered ecommerce system that is written in typescript.

```
# User / auth things
/src/auth

/src/auth/features.ts
/src/auth/index.ts
/src/auth/libs.ts
/src/auth/services/index.ts
/src/auth/services/socialMedia.ts
/src/auth/services/local.ts

# Reusable code related to currencies.
/src/currency

/src/currency/index.ts
/src/currency/libs.ts
/src/currency/services.ts

# Things related to inventory
/src/inventory

/src/inventory/features.ts
/src/inventory/index.ts
/src/inventory/libs.ts
/src/inventory/services/index.ts
/src/inventory/services/models/Inventories.ts
/src/inventory/services/models/InventoryChecks.ts
```

# System Design - Terminology

#### System

The singular complete unit of computer code with implementations

#### Package

A collection of apps.

#### App

A highly cohesive grouping of code that adds features and capabilities to the overall system. This is the primary area where "like" business functionality lives.

#### Layer

Code that fills a categorical need. Either entries/libs/utils/features/services

#### Model

An abstract description of a type of data. Similar to the idea of a class.

# System Design - App and Layer Loading

The system is started up according to the configuration file for your server. Inside the configuration you specify the order of the apps via `core.apps`, and the order of the layers via `core.layerOrder`. This allows you to customize and create new layers, as well as put your apps at whatever layer you decide.

Each app is loaded in order, and each layer within that app is loaded in order. This increasing stack of layer dependencies, are provided to each loaded layer, so that they have full access to the layers they are supposed to and the apps that have come before it.

#### IMPORTANT

Apps must be named uniquely across the system. Otherwise there will be name/layer collisions. As a result the system will check if a non unique name is found, and then an exception is thrown at system start.

# System Design - Naming Standards

## Directories

The `src/` directory should contain sub-folders that are apps, and should generally be singular, unless it doesn't read well. Example: `src/auth` or `src/inventories`.

Inside of these app folders, there should be the layers of the app, which can either be a single file for relatively small layers: `src/auth/services.ts` or a directory that has files under it for larger layers: `src/auth/services/index.ts`. Note: There should always be an index.ts in the app folder and any layer folder.

# Some Gotchas

## Do just-in-time configuring and memoization

Because this framework, loads all of the layers at runtime, there are many situations where it is best to not configure things until they are needed. An example would be a database connection. Instead of configuring this connection in the base level of a `create()` function, it is often better to create a function inside of `create()` that the other functions use, when they are actually needed. And then further, memoizing that function call so that subsequent calls get the same object again and again.

The biggest reason for this is performance.

# Additional Noteworthy Features

## Annotated Functions

Node-in-layers provides a function `annotatedFunction()` that is extremely useful for building consumable living APIs.
This functionality is heavily recommended for feature level functions.

This function AUTOMATICALLY accounts for crossLayerProps as a last optional argument to the function as well that the output could be the type you describe OR an ErrorObject type.

Here is an example:

```typescript
// ./src/myDomain/features.ts
import { annotatedFunction, isErrorObject } from '@node-in-layers/core'

const create = (context: FeaturesContext<Config, MyServicesContext>) => {
  const hello = annotatedFunction(
    {
      functionName: 'hello',
      domain: 'myDomain',
      description:
        'This is my function, there are many like it, but this one is mine.',
      args: z.object({
        myArgument: z.string(),
      }),
      returns: z.object({
        output: z.string(),
      }),
    },
    (args, crossLayerProps) => {
      return {
        output: `Hello ${args.myArgument}`,
      }
    }
  )

  return {
    hello,
  }
}

// This is normally automatically done
const context = {
  features: {
    myDomain: create({}),
  },
}
//
const result = context.features.myDomain.hello({ myArgument: 'World' })

// Result type, automatically an "or" with ErrorObject
if (isErrorObject(result)) {
  throw new Error('There was an error')
}

console.info(result.output) // "Hello World"
```

NOTE: The reason why an object is enforced for input AND output, is it sets up a layer function to be exported and described in an OpenAPI format, or exported via an AI MCP layer.

## Pluggable Model CRUDS Factories

When configuring the `@node-in-layers/core` module, you can specify a `modelCrudsFactory` in the configuration. This factory is used by the framework whenever it generates `cruds` functions for your `functional-models`. This is a powerful feature that allows you to inject logic like complex authorization frameworks directly into the base CRUD operations without rewriting them.

You can specify a single factory that applies to all models, or use an array of override objects to target specific layers, domains, or even individual models.

Here are a few realistic examples:

### Override for Everything

This approach applies your custom factory to every model generated by the system across all layers.

```typescript
import { CoreNamespace, ModelCrudsFactory } from '@node-in-layers/core'

const myCustomAuthFactory: ModelCrudsFactory = (model, context, options) => {
  // Wrap the model functions here...
  // Example: Return an object with create/retrieve/update/delete
  // that checks permissions before calling the underlying model.
  return myAuthWrappedCruds(model, context, options)
}

export const config = {
  [CoreNamespace.root]: {
    // ...
    modelCruds: true,
    // This will override every single cruds to use this auth wrapping.
    // NOTE: This will be run on every single layer. (So this will auth twice.)
    modelCrudsFactory: myCustomAuthFactory,
  },
}
```

### Override for a Specific Layer

Often, you only want to apply the factory (e.g. authorization checks) at the `services` layer so that the `features` layer is a simple passthrough.

```typescript
export const config = {
  [CoreNamespace.root]: {
    // ...
    modelCruds: true,
    // This will only run the authorization at the features level, and never at the services layer.
    modelCrudsFactory: [
      {
        layer: 'services',
        factory: myCustomAuthFactory,
      },
    ],
  },
}
```

### Override for a Specific Domain or Model

You can get even more granular. Perhaps you only need custom auditing on the `auth` domain, or specific data-masking on the `Users` model.

```typescript
export const config = {
  [CoreNamespace.root]: {
    // ...
    modelCruds: true,
    modelCrudsFactory: [
      // This will only run on the auth domain in the services layer.
      {
        domain: 'auth',
        layer: 'services',
        factory: authDomainFactory,
      },
      // This will only run on the myDomain.Users model on the services layer.
      {
        domain: 'myDomain',
        model: 'Users',
        layer: 'services',
        factory: usersModelFactory,
      },
    ],
  },
}
```

# MCP Development Server

Node In Layers Core ships with an MCP server for AI based development. It provides knowledge entries for the AI to have specific examples of how to work with and manipulate a Node In Layers system. This GREATLY increases the accuracy and understanding of AI working with these systems, making it really easy to add new features, refactor, and make the best use of features.

## Quick Start

You can setup the server by setting up Cursor (or similar) with this configuration.

```json
{
  "mcpServers": {
    "node-in-layers-core": {
      "command": "npx",
      "args": ["-y", "@node-in-layers/core-knowledge-mcp"]
    }
  }
}
```

You can learn more about this here [Knowledge MCP](./knowledge-mcp/README.md)

## FAQ

### How do I prevent the framework from logging large or sensitive arguments or responses?

Layer functions are wrapped so each call logs an “Executing …” line (with arguments) and an “Executed …” line (with the return value). For a **single downstream call** where you want those wrap logs to omit payloads, merge `logging.overrides.omitData` into the `crossLayerProps` you pass using `crossLayerPropsWithLoggingOverrides` from `@node-in-layers/core`:

```typescript
import { crossLayerPropsWithLoggingOverrides } from '@node-in-layers/core'

const myFeature = async (arg, crossLayerProps?) => {
  const next = crossLayerPropsWithLoggingOverrides(
    { omitData: true },
    crossLayerProps
  )
  return context.services.myDomain.myService(arg, next)
}
```

That hop’s wrap logs will still record the layer and function name, but not the `args` or `result` fields. The framework does **not** forward `logging.overrides` to the callee: when the next layer builds props via `createCrossLayerProps`, overrides are stripped so inner functions never receive them and they do not leak down the chain unless you set them again on a later call.
