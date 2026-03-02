import { assert } from 'chai'
import sinon from 'sinon'
import {
  wrap,
  promiseWrap,
  memoizeValueSync,
  timeCacheAsync,
} from '../../src/utils'

describe('/src/utils.ts', () => {
  describe('#timeCacheAsync()', () => {
    it('should call the function twice when lazy called twice', () => {
      const func = sinon.stub().returns(5)
      const cached = timeCacheAsync(1, func)
      cached()
      cached()
      return new Promise(resolve => setTimeout(resolve, 2000))
      cached()
      const actual = func.callCount
      const expected = 2
      assert.equal(actual, expected)
    })
  })
  describe('#memorizeValueSync()', () => {
    it('should call the function twice when lazy called twice', () => {
      const func = sinon.stub().returns(5)
      const lazied = memoizeValueSync(func)
      lazied()
      lazied()
      const actual = func.callCount
      const expected = 1
      assert.equal(actual, expected)
    })
  })
  describe('#wrap()', () => {
    it('should pass every argument into the wrapped function', () => {
      const myFunc = sinon.stub()
      const func = wrap(myFunc)
      func('x', 'y', 'z')
      const actual = myFunc.getCall(0).args
      const expected = ['x', 'y', 'z']
      assert.deepEqual(actual, expected)
    })
  })
  describe('#promiseWrap()', () => {
    it('should pass every argument into the wrapped function', async () => {
      const myFunc = sinon.stub()
      const func = promiseWrap(myFunc)
      await func('x', 'y', 'z')
      const actual = myFunc.getCall(0).args
      const expected = ['x', 'y', 'z']
      assert.deepEqual(actual, expected)
    })
  })
})
