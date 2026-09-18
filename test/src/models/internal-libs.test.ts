import { assert } from 'chai'
import * as sinon from 'sinon'
import { createModelCruds } from '../../../src/models/internal-libs.js'
import {
  DataDescription,
  OrmModel,
  OrmModelInstance,
  OrmSearch,
  ToObjectResult,
} from 'functional-models'

// Mock interfaces for testing
interface TestData extends DataDescription {
  id: string
  name: string
}

describe('/src/models/internal-libs.ts', () => {
  let modelStub: sinon.SinonStubbedInstance<OrmModel<TestData>>
  let instanceStub: sinon.SinonStubbedInstance<OrmModelInstance<TestData>>

  beforeEach(() => {
    instanceStub = {
      save: sinon.stub().resolvesThis(),
      toObject: sinon.stub().returns({ id: '1', name: 'test' }),
    } as any

    modelStub = {
      create: sinon.stub().returns(instanceStub),
      retrieve: sinon.stub().resolves(instanceStub),
      delete: sinon.stub().resolves(),
      bulkInsert: sinon.stub().resolves(),
      bulkDelete: sinon.stub().resolves(),
      search: sinon.stub().resolves({ items: [instanceStub], total: 1 }),
      getModelDefinition: sinon.stub().returns({ primaryKeyName: 'id' }),
    } as any
  })

  afterEach(() => {
    sinon.restore()
  })

  describe('#createModelCruds()', () => {
    it('should create CRUD functions with model instance', () => {
      const cruds = createModelCruds<TestData>(modelStub)
      assert.isFunction(cruds.getModel)
      assert.isFunction(cruds.create)
      assert.isFunction(cruds.retrieve)
      assert.isFunction(cruds.update)
      assert.isFunction(cruds.delete)
      assert.isFunction(cruds.search)
    })

    it('should create a getModel function', () => {
      const modelFactory = sinon.stub().returns(modelStub)
      const cruds = createModelCruds<TestData>(modelFactory)
      assert.isFunction(cruds.getModel)
    })

    it('should memoize model creation', () => {
      const modelFactory = sinon.stub().returns(modelStub)
      const cruds = createModelCruds<TestData>(modelFactory)
      cruds.getModel()
      cruds.getModel()
      assert.isTrue(
        modelFactory.calledOnce,
        'Factory should be called only once'
      )
    })

    describe('#bulkInsert()', () => {
      it('should bulk insert instances', async () => {
        const cruds = createModelCruds<TestData>(modelStub)
        const data = [{ name: 'test' }, { name: 'test2' }]
        await cruds.bulkInsert(data)
      })
    })

    describe('#bulkDelete()', () => {
      it('should bulk delete instances', async () => {
        const cruds = createModelCruds<TestData>(modelStub)
        const data = [{ id: '1' }, { id: '2' }]
        await cruds.bulkDelete(data)
      })
    })

    describe('#create()', () => {
      it('should create and save an instance', async () => {
        const cruds = createModelCruds<TestData>(modelStub)
        const data = { name: 'test' }
        const result = await cruds.create(data)

        assert.isTrue(modelStub.create.calledOnceWith(data))
        assert.isTrue(instanceStub.save.calledOnce)
        assert.equal(result, instanceStub)
      })

      it('should create from ToObjectResult input', async () => {
        const cruds = createModelCruds<TestData>(modelStub)
        const data = { id: '2', name: 'test' } as ToObjectResult<TestData>
        const result = await cruds.create(data)

        assert.equal(result, instanceStub)
      })
    })

    describe('#retrieve()', () => {
      it('should retrieve an instance by primary key', async () => {
        const cruds = createModelCruds<TestData>(modelStub)
        const result = await cruds.retrieve('1')

        assert.isTrue(modelStub.retrieve.calledOnceWith('1'))
        assert.equal(result, instanceStub)
      })
    })

    describe('#update()', () => {
      it('should update an instance with merged data', async () => {
        const cruds = createModelCruds<TestData>(modelStub)
        const data = { name: 'updated' }
        const result = await cruds.update('1', data)

        assert.isTrue(
          modelStub.create.calledOnceWith({ id: '1', name: 'updated' })
        )
        assert.isTrue(instanceStub.save.calledOnce)
        assert.equal(result, instanceStub)
      })

      it('should handle ToObjectResult input', async () => {
        const cruds = createModelCruds<TestData>(modelStub)
        const data = { id: '2', name: 'updated' } as ToObjectResult<TestData>
        const result = await cruds.update('1', data)

        assert.equal(result, instanceStub)
      })
    })

    describe('#delete()', () => {
      it('should delete an instance by primary key', async () => {
        const cruds = createModelCruds<TestData>(modelStub)
        await cruds.delete('1')

        assert.isTrue(modelStub.delete.calledOnceWith('1'))
      })
    })

    describe('#search()', () => {
      it('should search using OrmSearch', async () => {
        const cruds = createModelCruds<TestData>(modelStub)
        const search: OrmSearch = { query: 'test' }
        const result = await cruds.search(search)

        assert.isTrue(modelStub.search.calledOnceWith(search))
        assert.deepEqual(result, { items: [instanceStub], total: 1 })
      })
    })

    describe('with overrides', () => {
      it('should apply overrides to CRUD functions', async () => {
        const overrideCreate = sinon.stub().resolves(instanceStub)
        const cruds = createModelCruds<TestData>(modelStub, {
          overrides: {
            create: overrideCreate,
          },
        })

        await cruds.create({ name: 'test' })
        assert.isTrue(overrideCreate.calledOnce)
        assert.isFalse(modelStub.create.called)
      })

      it('should preserve non-overridden functions', async () => {
        const cruds = createModelCruds<TestData>(modelStub, {
          overrides: {
            create: sinon.stub().resolves(instanceStub),
          },
        })

        await cruds.retrieve('1')
        assert.isTrue(modelStub.retrieve.calledOnce)
      })
    })

    describe('edge cases', () => {
      it('should handle undefined options', () => {
        const cruds = createModelCruds<TestData>(modelStub, undefined)
        assert.isFunction(cruds.create)
        assert.isFunction(cruds.retrieve)
        assert.isFunction(cruds.update)
        assert.isFunction(cruds.delete)
        assert.isFunction(cruds.search)
      })

      it('should handle empty overrides', () => {
        const cruds = createModelCruds<TestData>(modelStub, { overrides: {} })
        assert.isFunction(cruds.create)
        assert.isFunction(cruds.retrieve)
        assert.isFunction(cruds.update)
        assert.isFunction(cruds.delete)
        assert.isFunction(cruds.search)
      })
    })
  })
})
