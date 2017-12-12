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

/*:: type Expectation = [MongooseModelT, MongooseQueryT, number]; */
/*:: type ModelwasMutated = [MongooseModelT, bool]; */
class TestHelper {
  constructor() {
    this.sandbox;
    this.spies = {};
  }

  assertChanges({ act, expectedChanges }/*: {
    act: AsyncFunctionT, expectedChanges: { db: { counts: Expectation[], wasMutated: ModelwasMutated[] } }
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
      newStates: ['act', (results, cb) => getNewStates({}, cb)],
      _assertChanges: ['newStates', ({ origStates, newStates }, cb) => {
        async.parallel([
          cb2 => {
            if (!expectedChanges.db.wasMutated) return void cb2(null);
            this.assertNotWasMutated(expectedChanges.db.wasMutated.map(([Model]) => Model), cb);
          },
          cb2 => {
            if (!expectedChanges.db.counts) return void cb2(null);
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

            if (fails.length) return void cb2(new Error(fails.join('\n')));
            cb2(null);
          }
        ], cb);
      }]
    }, mainCb);
  }

  assertNotWasMutated(Models, mainCb) {
    const modelNames = Models.map(M => M.modelName);
    const wasRemoveCalledOnModel = modelName => !!this.spies[modelName].remove.called;
    const assertRemoveNotCalled = cb => {
      const assertRemoveNotCalledOnModel = (modelName, cb2) => {
        if (wasRemoveCalledOnModel(modelName)) {
          return void cb2(new Error(`${modelName}.remove() was called.`));
        }
        cb2(null);
      };
      async.each(modelNames, assertRemoveNotCalledOnModel, cb);
    };
    const assertSaveNotCalled = cb => {
      const wasSaveCalledOnModel = modelName => this.spies[modelName].prototype.save.called;
      const assertSaveNotCalledOnModel = (modelName, cb2) => {
        if (wasSaveCalledOnModel(modelName)) {
          return void cb2(new Error(`${modelName}.prototype.save() was called.`));
        }
        cb2(null);
      };
      async.each(modelNames, assertSaveNotCalledOnModel, cb);
    };

    const tasks = {
      assertRemoveNotCalled,
      assertSaveNotCalled
    };
    async.parallel(tasks, mainCb);
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
        remove: this.sandbox.spy(Model, 'remove'),
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
