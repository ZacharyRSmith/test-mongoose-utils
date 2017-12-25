'use strict';

const async = require('async');
const deepPluck = require('deep-pluck-ref');
const rest = require('restler');
const sinon = require('sinon');
const snapshotIt = require('snap-shot-it');

const rmDeep = (obj, props) => {
	const refs = deepPluck(obj, props) || [];
	refs.map(ref => void props.forEach(p => void delete ref[p] ));
};

function _assertChanges({ expectedChanges, newStates, origStates }, mainCb) {
  async.parallel([
    cb => {
      if (!expectedChanges.db.wasMutated) return void cb(null);
      this.assertMutationState(expectedChanges.db.wasMutated, cb);
    },
    cb => {
      if (!expectedChanges.db.counts) return void cb(null);
      const chs = origStates.counts.map((origCt, i) => newStates.counts[i] - origCt);
      const fails = chs.reduce((memo, ch, i) => {
        const { modelName } = expectedChanges.db.counts[i][0];
        const query = JSON.stringify(expectedChanges.db.counts[i][1]);
        const expectedCh = expectedChanges.db.counts[i][2];
        if (ch === expectedCh) return memo;
        return memo.concat(
          `Expected ${modelName}.count(${query}) to change by '${expectedCh}' instead of '${ch}'.`
        );
      }, []);

      if (fails.length) return void cb(new Error(fails.join('\n')));
      cb(null);
    }
  ], mainCb);
};

/*:: type Expectation = [MongooseModelT, MongooseQueryT, number]; */
/*:: type ModelwasMutated = [MongooseModelT, bool]; */
class TestHelper {
  constructor() {
    this.sandbox;
    this.spies = {};
  }

  assertChanges({ act, expectedChanges }/*: {
    act: AsyncFunctionT,
    expectedChanges: {
      db: { counts: Expectation[], wasMutated: ModelwasMutated[] },
      retry?: { interval: number, times: number }
    }
  } */, mainCb/*: CbT */) {
    const getCt = ([Model, query], cb) => Model.count(query, cb);
    const getNewStates = ({ }, cb) => {
      const tasks = {};
      if (expectedChanges.db.counts) {
        tasks.counts = cb2 => async.map(expectedChanges.db.counts, getCt, cb2);
      }

      async.parallel(tasks, cb);
    };
    const getOrigStates = cb => {
      const tasks = {};
      if (expectedChanges.db.counts) {
        tasks.counts = cb2 => async.map(expectedChanges.db.counts, getCt, cb2);
      }

      async.parallel(tasks, cb);
    };

    async.auto({
      origStates: getOrigStates,
      act: ['origStates', (results, cb) => act(cb)],
      _assertChanges: ['act', ({ origStates }, cb) => {
        const { interval, times } = expectedChanges.retry || {};
        async.retry(
          { interval: interval || 1, times: times || 1 },
          cb2 => {
            async.auto({
              newStates: cb3 => getNewStates({}, cb3),
              _assertChanges: ['newStates', ({ newStates }, cb3) => {
                _assertChanges.call(this, { expectedChanges, newStates, origStates }, cb3);
              }]
            }, cb2);
          },
          cb
        );
      }]
    }, mainCb);
  }

  assertMutationState(config, mainCb) {
    const assertModelMutationState = ([{ modelName }, assertWasMutated], cb) => {
      let methodCalled;
      const staticMethodSpies = this.spies[modelName];
      const prototypeMethodSpies = this.spies[modelName].prototype;
      const wasAnyMethodCalled = ({ isPrototype, methodSpies }) => {
        return Object.keys(methodSpies).some(methodName => {
          if (methodName === 'prototype') return false;
          const spy = methodSpies[methodName];
          if (spy.called) {
            methodCalled = `${modelName}.${isPrototype ? 'prototype.' : ''}${methodName}() was called.`;
            return true;
          }
          return false;
        });
      };

      if (assertWasMutated) {
        if (
          !wasAnyMethodCalled({ isPrototype: true, methodSpies: prototypeMethodSpies })
          && !wasAnyMethodCalled({ isPrototype: false, methodSpies: staticMethodSpies })
        ) return void cb(new Error(`No mutation method called on '${modelName}'.`));
        cb(null);
      } else {
        if (
          wasAnyMethodCalled({ isPrototype: true, methodSpies: prototypeMethodSpies })
          || wasAnyMethodCalled({ isPrototype: false, methodSpies: staticMethodSpies })
        ) return void cb(new Error(methodCalled));
        cb(null);
      }
    };

    async.each(config, assertModelMutationState, mainCb);
  }

  assertRes({ opts, payload, snapshot = {}, statusCode, url }, mainCb) {
    const method = payload ? 'postJson' : 'get';
    const args = [url];
    if (payload) args.push(payload);
    if (opts) args.push(opts);

    rest[method](...args)
      .on('complete', (data, response) => {
        try {
          if (statusCode) response.statusCode.should.equal(statusCode);
        } catch(e) {
          // console.log('data', data);
          e.message = JSON.stringify(data, null, '\t');
          throw e;
        }
        if (typeof snapshot.path === 'string') {
          const clonedData = JSON.parse(JSON.stringify(snapshot.path ? oPath(data, snapshot.path) : data));
          if (snapshot.ignoreProps) rmDeep(clonedData, snapshot.ignoreProps);
          snapshotIt(clonedData);
        }
        mainCb(null, data, response);
      })
      .on('error', mainCb);
  }

  registerModels(Models) {
    this.sandbox = sinon.sandbox.create();
    Models.forEach(Model => {
      this.spies[Model.modelName] = {
        findOneAndUpdate: this.sandbox.spy(Model, 'findOneAndUpdate'),
        findByIdAndUpdate: this.sandbox.spy(Model, 'findByIdAndUpdate'),
        findOneAndRemove: this.sandbox.spy(Model, 'findOneAndRemove'),
        findByIdAndRemove: this.sandbox.spy(Model, 'findByIdAndRemove'),
        remove: this.sandbox.spy(Model, 'remove'),
        update: this.sandbox.spy(Model, 'update'),
        prototype: {
          save: this.sandbox.spy(Model.prototype, 'save')
        }
      };
    });
  }

  reset() {
    this.sandbox.reset();
  }

  restore() {
    this.sandbox.restore();
  }
}

module.exports = TestHelper;
