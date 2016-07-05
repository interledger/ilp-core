'use strict'

const sinon = require('sinon')
const chai = require('chai')
sinon.assert.expose(chai.assert, { prefix: '' })
const chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)
const assert = chai.assert
const nock = require('nock')

const mockRequire = require('mock-require')

const ilpCore = require('..')
const Client = ilpCore.Client
const MockPlugin = require('./mocks/mock-plugin')

describe('Client', function () {
  beforeEach(function () {
    mockRequire('ilp-plugin-mock', MockPlugin)
  })

  afterEach(function () {
    mockRequire.stopAll()
  })

  describe('constructor', function () {
    it('should instantiate the ledger plugin', function () {
      const client = new Client({
        type: 'mock'
      })

      assert.instanceOf(client, Client)
      assert.instanceOf(client.getPlugin(), MockPlugin)
    })

    it('should fail if the ledger plugin does not exist', function () {
      assert.throws(() => {
        return new Client({
          type: 'fake',
          auth: {
            mock: true
          }
        })
      }, 'Cannot find module \'ilp-plugin-fake\'')
    })
  })

  describe('connect', function () {
    it('should call connect on the plugin', function * () {
      const client = new Client({
        type: 'mock'
      })
      const stubConnect = sinon.stub(client.getPlugin(), 'connect')

      client.connect()

      sinon.assert.calledOnce(stubConnect)
      stubConnect.restore()
    })
  })

  describe('disconnect', function () {
    it('should call disconnect on the plugin', function * () {
      const client = new Client({
        type: 'mock'
      })
      const stubDisconnect = sinon.stub(client.getPlugin(), 'disconnect')

      client.disconnect()

      sinon.assert.calledOnce(stubDisconnect)
      stubDisconnect.restore()
    })
  })

  describe('fulfillCondition', function () {
    it('should call fulfillCondition on the plugin', function * () {
      const client = new Client({
        type: 'mock'
      })
      const stubDisconnect = sinon.stub(client.getPlugin(), 'fulfillCondition')

      client.fulfillCondition({ foo: true }, 'cf:0:')

      sinon.assert.calledOnce(stubDisconnect)
      sinon.assert.calledWith(stubDisconnect, { foo: true }, 'cf:0:')
      stubDisconnect.restore()
    })
  })

  describe('waitForConnection', function () {
    it('should return a rejected promise if not currently connecting', function * () {
      const client = new Client({
        type: 'mock'
      })

      client.disconnect()
      const promise = client.waitForConnection()

      yield assert.isRejected(promise)
    })
  })

  describe('quote', function () {
    beforeEach(function () {
      this.client = new Client({
        type: 'mock'
      })
    })

    afterEach(function () {
      nock.cleanAll()
    })

    it('should reject if neither sourceAmount nor destinationAmount are specified', function (done) {
      this.client.quote({
        destinationLedger: 'http://red.example'
      })
      .catch(function (err) {
        assert.equal(err.message, 'Should provide source or destination amount but not both')
        done()
      })
    })

    it('should reject if both sourceAmount and destinationAmount are specified', function (done) {
      this.client.quote({
        destinationLedger: 'http://red.example',
        sourceAmount: '10',
        destinationAmount: '10'
      })
      .catch(function (err) {
        assert.equal(err.message, 'Should provide source or destination amount but not both')
        done()
      })
    })

    it('should get fixed sourceAmount quotes', function (done) {
      nock('http://connector.example')
        .get('/quote')
        .query({
          source_ledger: 'mock:',
          destination_ledger: 'http://red.example',
          source_amount: '1'
        })
        .reply(200, {
          destination_amount: '1',
          source_connector_account: 'mock/connector'
        })
      this.client.quote({
        destinationLedger: 'http://red.example',
        sourceAmount: '1'
      })
      .then(function (quote) {
        assert.deepEqual(quote, {
          destinationAmount: '1',
          connectorAccount: 'mock/connector'
        })
        done()
      })
      .catch(done)
    })

    it('should get fixed destinationAmount quotes', function (done) {
      nock('http://connector.example')
        .get('/quote')
        .query({
          source_ledger: 'mock:',
          destination_ledger: 'http://red.example',
          destination_amount: '1'
        })
        .reply(200, {
          source_amount: '1',
          source_connector_account: 'mock/connector'
        })
      this.client.quote({
        destinationLedger: 'http://red.example',
        destinationAmount: '1'
      })
      .then(function (quote) {
        assert.deepEqual(quote, {
          sourceAmount: '1',
          connectorAccount: 'mock/connector'
        })
        done()
      })
      .catch(done)
    })
  })

  describe('sendQuotedPayment', function () {
    beforeEach(function () {
      this.client = new Client({
        type: 'mock'
      })
    })

    afterEach(function () {
      nock.cleanAll()
    })

    it('should reject if no executionCondition is provided and unsafeOptimisticTransport is not set', function (done) {
      this.client.sendQuotedPayment({
        connectorAccount: 'connector',
        sourceAmount: '1',
        destinationAmount: '2',
        destinationLedger: 'http://red.example',
        destinationAccount: 'http://red.example/bob',
        destinationMemo: {
          foo: 'bar'
        },
        expiresAt: '2016-07-02T00:00:00.000Z'
      })
      .catch(function (err) {
        assert.equal(err.message, 'executionCondition must be provided unless unsafeOptimisticTransport is true')
        done()
      })
    })

    it('should reject if there is an executionCondition and no expiresAt', function (done) {
      this.client.sendQuotedPayment({
        connectorAccount: 'connector',
        sourceAmount: '1',
        destinationAmount: '2',
        destinationLedger: 'http://red.example',
        destinationAccount: 'http://red.example/bob',
        destinationMemo: {
          foo: 'bar'
        },
        executionCondition: 'cc:0:3:47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU:0'
      })
      .catch(function (err) {
        assert.equal(err.message, 'executionCondition should not be used without expiresAt')
        done()
      })
    })

    it('should send a transfer to the ledger plugin with the ilp packet in the data field', function (done) {
      const spy = sinon.spy(this.client.plugin, 'send')

      this.client.sendQuotedPayment({
        connectorAccount: 'connector',
        sourceAmount: '1',
        destinationAmount: '2',
        destinationLedger: 'http://red.example',
        destinationAccount: 'http://red.example/bob',
        destinationMemo: {
          foo: 'bar'
        },
        executionCondition: 'cc:0:3:47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU:0',
        expiresAt: '2016-07-02T00:00:00.000Z'
      })
      .then(function () {
        assert.calledWithMatch(spy, {
          ledger: 'mock:',
          account: 'connector',
          amount: '1',
          data: {
            ilp_header: {
              account: 'http://red.example/bob',
              ledger: 'http://red.example',
              amount: '2',
              data: {
                foo: 'bar'
              }
            }
          },
          executionCondition: 'cc:0:3:47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU:0',
          expiresAt: '2016-07-02T00:00:00.000Z'
        })
        done()
      })
      .catch(done)
    })

    it('should send Optimistic payments if unsafeOptimisticTransport is set', function (done) {
      const spy = sinon.spy(this.client.plugin, 'send')

      this.client.sendQuotedPayment({
        unsafeOptimisticTransport: true,
        connectorAccount: 'connector',
        sourceAmount: '1',
        destinationAmount: '2',
        destinationLedger: 'http://red.example',
        destinationAccount: 'http://red.example/bob',
        destinationMemo: {
          foo: 'bar'
        }
      })
      .then(function () {
        assert.calledWithMatch(spy, {
          ledger: 'mock:',
          account: 'connector',
          amount: '1',
          data: {
            ilp_header: {
              account: 'http://red.example/bob',
              ledger: 'http://red.example',
              amount: '2',
              data: {
                foo: 'bar'
              }
            }
          }
        })
        done()
      })
      .catch(done)
    })
  })

  describe('use', function () {
    beforeEach(function () {
      this.client = new Client({
        type: 'mock'
      })
    })

    it('should throw an error if the Extension class does not have static getName method', function () {
      const client = this.client
      function Extension () {}
      assert.throws(function () {
        client.use(Extension)
      }, 'Extension class must have a static getName method')
    })

    it('should throw an error if Extension.getName does not return a string', function () {
      const client = this.client
      function Extension () {}
      Extension.getName = function () { return null }
      assert.throws(function () {
        client.use(Extension)
      }, 'Extension.getName must return a string')
    })

    it('should call the Extension constructor with the client instance', function () {
      function Extension () {}
      Extension.getName = function () { return 'test' }
      const objUsedForSinonToWork = {
        Extension: Extension
      }
      const spy = sinon.spy(objUsedForSinonToWork, 'Extension')
      this.client.use(objUsedForSinonToWork.Extension)
      assert.calledWith(spy, this.client)
      spy.restore()
    })

    it('should make all Extension functions available via client[name]', function () {
      function testMethod () { return true }
      function Extension () {}
      Extension.getName = function () { return 'test' }
      Extension.prototype.method = testMethod
      this.client.use(Extension)
      assert.typeOf(this.client.test.method, 'function')
      assert.isTrue(this.client.test.method())
    })
  })
})
