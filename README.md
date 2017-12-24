# Test Mongoose Utils



# Installation
```sh
$ npm install test-mongoose-utils
```

# Example Usage
```javascript
const TestMongooseUtils = require('test-mongoose-utils');
const tmu = new TestMongooseUtils();

const Todo = require('./Todo');

describe('module', () => {
  before(done => {
    tmu.registerModels([Todo]); // Enables some functionality.
    // connect to mongoose...
  });

  after(done => {
    tmu.restore(); // Restores spies.
    // disconnect to mongoose...
  });

  afterEach(() => {
    tmu.reset(); // Resets spies' records.
  });

  test('Todo uuid is unique', done => {
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
      }, mainCb);
    const createTodoDupe = mainCb =>
      tmu.assertChanges({ // Will assert @expectedChanges after @act.
        act: cb =>
          Todo.create(data, cb),
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
});
```
