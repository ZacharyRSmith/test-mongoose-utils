# Test Mongoose Utils



# Installation
```sh
$ npm install test-mongoose-utils
```

# Example Usage
```javascript
const TestMongooseUtils = require('test-mongoose-utils');
const tmu = new TestMongooseUtils();

describe('module', () => {
  before(done => {
    tmu.registerModels([Todo]);
    // connect to mongoose...
  });

  after(done => {
    tmu.restore();
    // disconnect to mongoose...
  });

  afterEach(() => {
    tmu.reset();
  });

  test('with mongoose', done => {
    tmu.assertChanges({
      act: cb =>
        createTodo(cb),
      expectedChanges: {
        db: {
          counts: [[Todo, {}, 1]]
        }
      }
    });
  });
});
