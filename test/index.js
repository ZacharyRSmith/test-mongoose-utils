const async = require('async');
const mongoose = require('mongoose');

const TodoSchema = new mongoose.Schema({
  name: String,
  uuid: { type: String, unique: true }
});
const Todo = mongoose.model('Todo', TodoSchema);

const TMU = require('../index.js');
const tmu = new TMU();

describe('index', () => {
  before(done => {
    const conn = mongoose.connect(process.env.TEST_MONGODB).connection;
    conn.on('open', () => {
      tmu.registerModels([Todo]);
      done();
    });
  });

  after(done => {
    tmu.restore();

    async.series([
      cb => Todo.remove({}, cb),
      cb => mongoose.disconnect(cb)
    ], done);
  });

  afterEach(() => {
    tmu.reset();
  });

  it('Todo uuid is unique', done => {
    const data = { uuid: 'bananaMan' };
    const createTodo = mainCb =>
      tmu.assertChanges({ // Will assert @expectedChanges after @act.
        act: cb =>
          Todo.create(data, cb),
        expectedChanges: {
          db: {
            // Tells tmu to assert that Todo.count({}) incr's by 1 after @act.
            counts: [[Todo, {}, 1]]
          }
        }
      }, (...args) => {
        console.log('...args', ...args);
        mainCb(...args);
      });
    const createTodoDupe = mainCb =>
      tmu.assertChanges({ // Will assert @expectedChanges after @act.
        act: async.reflect(cb =>
          Todo.create(data, cb)),
        expectedChanges: {
          db: {
            // Tells tmu to assert that Model.<mutate>
            // or Model.prototype.<mutate> methods were not called.
            wasMutated: [[Todo, false]]
          }
        }
      }, mainCb);

    async.series([
      createTodo,
      createTodoDupe
    ], done);
  });

  it('tracks whether or not static mutation methods were called', done => {
    const staticMethods = [
      ['findOneAndUpdate', false],
      ['findByIdAndUpdate', false],
      ['findOneAndRemove', false],
      ['findByIdAndRemove', false],
      ['remove', false],
      ['update', false]
    ];
    const assertStaticMethodCovered = ([staticMethod, isPrototypeMethod], mainCb) => {
      tmu.reset();

      async.series([
        seriesCb =>
          tmu.assertChanges({
            act: cb => setImmediate(() => cb(null)),
            expectedChanges: {
              db: { wasMutated: [[Todo, false]] }
            }
          }, mainErr => {
            if (mainErr) return void seriesCb(`Error should not exist: '${mainErr}'.`);
            seriesCb();
          }),
        seriesCb =>
          tmu.assertChanges({
            act: cb => {
              if (staticMethod === 'remove') {
                Todo.remove({ do: 'notMatch' }, cb);
              } else if (staticMethod.match(/id/i)) {
                Todo[staticMethod]('5a3fad131476d63bc11fbbd4', {}, cb);
              } else {
                Todo[staticMethod]({}, {}, cb);
              }
            },
            expectedChanges: {
              db: { wasMutated: [[Todo, true]] }
            }
          }, seriesCb)
      ], mainCb);
    };

    async.eachSeries(staticMethods, assertStaticMethodCovered, done);
  });

  it('tracks Model#save was called', done => {
    const t = new Todo();
    tmu.assertChanges({
      act: cb => t.save(cb),
      expectedChanges: {
        db: { wasMutated: [[Todo, true]] }
      }
    }, done);
  });

  it('allows for retry', done => {
    const t = new Todo();
    tmu.assertChanges({
      act: cb => {
        setTimeout(() => t.save(), 1000); // Save might not persist due to schema validationErr.
        setImmediate(() => cb(null));
      },
      expectedChanges: {
        db: { wasMutated: [[Todo, true]] },
        retry: { interval: 100, times: 15 }
      }
    }, done);
  });
});
