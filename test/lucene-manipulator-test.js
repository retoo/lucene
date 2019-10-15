'use strict';

const lucene_manipulator = require('../lib/lucene-manipulator');
const expect = require('chai').expect;

console.log(lucene_manipulator);
const lucene = require('../');

function printAst(ast) {
  let copy = JSON.parse(JSON.stringify(ast));

  let queue = [copy];

  while (queue.length > 0) {
    let el = queue.pop();

    delete el.fieldLocation;
    delete el.termLocation;
    delete el.quoted;
    delete el.regex;
    delete el.similarity;
    delete el.boost;
    delete el.prefix;

    if (el.left) {
      queue.push(el.left);
    }
    if (el.right) {
      queue.push(el.right);
    }
    //console.log(el);
  }


  return JSON.stringify(ast, null, 2);
}

function runAndLogOnErrors(runnable, originalAst, actualAst, expectedAst) {
  try {
    runnable();
  } catch (e) {
    console.log(formatAstsForLogging(originalAst, actualAst, expectedAst));
    throw e;
  }
}

function formatAstsForLogging(originalAst, actualAst, expectedAst) {
  return '== asts ==\n' +
    'original:\n' + printAst(originalAst) + '\n' +
    'actual:\n' + printAst(actualAst) + '\n' +
    'expected:\n' + printAst(expectedAst) + '\n';
}

function checkResult(originalAst, actualAst, expectedQuery, inputQuery, testMsg) {
  let expectedAst = lucene.parse(expectedQuery);
  let actualQuery = lucene.toString(actualAst);

  let msg = testMsg + '\n' +
    'input: ' + inputQuery + '\n' +
    'expected: ' + expectedQuery + '\n' +
    'actual: ' + actualQuery + '\n' +
    formatAstsForLogging(originalAst, actualAst, expectedAst);
  expect(actualQuery, msg).to.equal(expectedQuery);
}

function ensureDeletesCorrectly(keys, input, expected) {
  it('key ' + keys + ' from query \'' + input + '\'', function () {
    if (typeof keys === 'string') {
      keys = [keys];
    }
    let originalAst = lucene.parse(input);
    let ast = originalAst;

    let handler = () => keys.forEach(key => ast = lucene_manipulator.deleteField(ast, key));

    runAndLogOnErrors(handler, originalAst, ast, lucene.parse(expected));

    checkResult(originalAst, ast, expected, input,
      'trying to set filter to delete ' + keys);

  });
}



function ensureSetInclusionCorrectly(field, value, input, expected) {
  it(`with ${field}=${value} for query '${input}'`, () => {
    let originalAst = lucene.parse(input);

    let ast = lucene_manipulator.setFilter(originalAst, field, value);

    checkResult(originalAst, ast, expected, input,
      'trying to set filter to ' + field + ':' + value);

  });
}

function ensureSetExclusionCorrectly(field, value, input, expected) {
  it(`with ${field}=${value} for query '${input}'`, function () {
    let originalAst = lucene.parse(input);

    let ast = lucene_manipulator.setFilter(originalAst, field, value, true);

    checkResult(originalAst, ast, expected, input,
      'trying to set NOT filter to ' + field + ':' + value);
  });
}

function ensureExtendsInclusionCorrectly(field, value, input, expected) {
  it(`${field}=${value} for query '${input}'`, function () {
    let originalAst = lucene.parse(input);

    let ast = lucene_manipulator.extendFilter(originalAst, field, value);

    checkResult(originalAst, ast, expected, input,
      'trying to extend filter to ' + field + ':' + value);
  });
}

function ensureExtendsExclusionCorrectly(field, value, input, expected) {
  it(`with ${field}=${value} for query '${input}'`, function () {
    let originalAst = lucene.parse(input);

    let ast = lucene_manipulator.extendFilter(originalAst, field, value, true);

    checkResult(originalAst, ast, expected, input,
      'trying to extend NOT filter to ' + field + ':' + value);
  });
}

describe('lucene manipulator', function () {
  describe('should delete', function () {
    ensureDeletesCorrectly('a',
      'a:b OR c:d',
      'c:d');
    ensureDeletesCorrectly('b',
      'a:2 b:3 c:4 d:[1 TO 4]',
      'a:2 c:4 d:[1 TO 4]');
    ensureDeletesCorrectly('d',
      'a:2 b:3 c:4 d:[1 TO 4]',
      'a:2 b:3 c:4');
    ensureDeletesCorrectly('c',
      'a:2 b:3 c:4 d:[1 TO 4]',
      'a:2 b:3 d:[1 TO 4]');
    ensureDeletesCorrectly('a',
      'a:2 b:3 c:4 d:[1 TO 4]',
      'b:3 c:4 d:[1 TO 4]');
    ensureDeletesCorrectly(['a', 'b', 'c', 'd'],
      'a:2 b:3 c:4 d:[1 TO 4]',
      '');
    ensureDeletesCorrectly(['b'],
      'a AND b:c',
      'a');
    ensureDeletesCorrectly(['b'],
      'a AND (b:c OR c:d)',
      'a AND c:d');
    ensureDeletesCorrectly(['b', 'c'],
      'a AND (b:c OR c:d)',
      'a');
    ensureDeletesCorrectly('b',
      'a:2 b:3',
      'a:2');
    ensureDeletesCorrectly('b',
      'b:1 (b:2 OR b:3)',
      '');
    ensureDeletesCorrectly('c',
      'b:(c:d OR c:d OR foo OR e:x)',
      'b:(foo OR e:x)');
    ensureDeletesCorrectly(['c', 'd'],
      'b:(c:d OR d:d)',
      '');
    ensureDeletesCorrectly('b',
      'b:(1 OR 2 OR 3 OR f:2)',
      '');
    ensureDeletesCorrectly('b',
      'a:1 OR b:(1 OR 2 OR 3 OR f:2)',
      'a:1');
    ensureDeletesCorrectly('b',
      'b:(1 OR 2 OR 3 OR f:2) OR a:1',
      'a:1');
    ensureDeletesCorrectly('y',
      'b:(1 OR 2 OR 3 OR f:(x:y OR y:z)) OR a:1',
      'b:(1 OR 2 OR 3 OR f:(x:y)) OR a:1');
    ensureDeletesCorrectly(['x', 'y'],
      'b:(f:(x:y OR y:z)) OR a:1',
      'a:1');

    ensureDeletesCorrectly('f',
      'b:(1 OR 2 OR 3 OR f:(x:y)) OR a:1',
      'b:(1 OR 2 OR 3) OR a:1');
  });

  describe('should set filter', function () {
    // escaping
    ensureSetInclusionCorrectly('b', 'foo bar', '', 'b:"foo bar"');
    ensureSetInclusionCorrectly('b', '*', '', 'b:"*"');
    ensureSetInclusionCorrectly('b', ':', '', 'b:":"');

    ensureSetInclusionCorrectly('b', '13',
      '',
      'b:13');

    ensureSetInclusionCorrectly('b', 13,
      'hello',
      'hello AND b:13');

    ensureSetInclusionCorrectly('b', 13,
      'hello AND b:15',
      'hello AND b:13');

    ensureSetInclusionCorrectly('b', 13,
      'hello AND (b:15 OR c:d)',
      'hello AND c:d AND b:13');

    ensureSetInclusionCorrectly('b', 13,
      'hello AND (b:(5 OR 17) OR c:d)',
      'hello AND c:d AND b:13');

    ensureSetInclusionCorrectly('b', 13,
      'hello AND (b:15 OR b:17 OR c:d)',
      'hello AND c:d AND b:13');

    ensureSetInclusionCorrectly('b', 13,
      'hello AND (b:15 OR b:17 OR c:d)',
      'hello AND c:d AND b:13');

    ensureSetInclusionCorrectly('host', 'foobar',
      'level:INFO OR level:ERROR',
      '(level:INFO OR level:ERROR) AND host:foobar');

    ensureSetInclusionCorrectly('level', 'DEBUG',
      '(level:INFO OR level:ERROR) AND host:foobar',
      'host:foobar AND level:DEBUG');
    ensureSetInclusionCorrectly('level', 'DEBUG',
      '(level:INFO OR host:ERROR) AND host:foobar',
      'host:ERROR AND host:foobar AND level:DEBUG');
  });

  describe('should set NOT filter correctly', function () {
    // escaping
    ensureSetExclusionCorrectly('b', 'foo bar', '', '(NOT b:"foo bar")');
    ensureSetExclusionCorrectly('b', '*', '', '(NOT b:"*")');
    ensureSetExclusionCorrectly('b', ':', '', '(NOT b:":")');
    ensureSetExclusionCorrectly('b', 'OR', '', '(NOT b:"OR")');

    ensureSetExclusionCorrectly('b', '13',
      '',
      '(NOT b:13)');

    ensureSetExclusionCorrectly('b', 13,
      'hello',
      'hello AND (NOT b:13)');

    ensureSetExclusionCorrectly('b', 13,
      'hello AND b:15',
      'hello AND (NOT b:13)');

    ensureSetExclusionCorrectly('b', 13,
      'hello AND (b:15 OR c:d)',
      'hello AND c:d AND (NOT b:13)');

    ensureSetExclusionCorrectly('b', 13,
      'hello AND (b:(5 OR 17) OR c:d)',
      'hello AND c:d AND (NOT b:13)');

    ensureSetExclusionCorrectly('b', 13,
      'hello AND (b:15 OR b:17 OR c:d)',
      'hello AND c:d AND (NOT b:13)');

    ensureSetExclusionCorrectly('b', 13,
      'hello AND (b:15 OR b:17 OR c:d)',
      'hello AND c:d AND (NOT b:13)');

    ensureSetExclusionCorrectly('host', 'foobar',
      'level:INFO OR level:ERROR',
      '(level:INFO OR level:ERROR) AND (NOT host:foobar)');

    ensureSetExclusionCorrectly('level', 'DEBUG',
      '(level:INFO OR level:ERROR) AND host:foobar',
      'host:foobar AND (NOT level:DEBUG)');

    ensureSetExclusionCorrectly('level', 'DEBUG',
      '(level:INFO OR host:ERROR) AND host:foobar',
      'host:ERROR AND host:foobar AND (NOT level:DEBUG)');
  });

  describe('should extend filter correctly', function () {
    ensureExtendsInclusionCorrectly('level', 'DEBUG',
      '',
      'level:DEBUG');
    ensureExtendsInclusionCorrectly('level', 'DEBUG',
      'level:DEBUG',
      'level:DEBUG');
    ensureExtendsInclusionCorrectly('level', 'DEBUG',
      'level:INFO',
      'level:(INFO OR DEBUG)');
    ensureExtendsInclusionCorrectly('level', 'HU HU',
      'level:(INFO OR DEBUG)',
      'level:(INFO OR DEBUG OR "HU HU")');
    ensureExtendsInclusionCorrectly('level', 'FOO',
      'level:INFO AND (NOT level:WARN)',
      'level:(INFO OR FOO)');
    ensureExtendsInclusionCorrectly('level', 'FOO',
      'level:INFO AND (NOT (level:(WARN OR ERROR)))',
      'level:(INFO OR FOO)');

  });

  describe('should extend negative filter correctly', function () {
    ensureExtendsExclusionCorrectly('level', 'DEBUG',
      '',
      '(NOT level:DEBUG)');
    ensureExtendsExclusionCorrectly('level', 'DEBUG',
      'level:DEBUG',
      '(NOT level:DEBUG)');
    ensureExtendsExclusionCorrectly('level', 'DEBUG',
      'level:INFO',
      '(NOT level:DEBUG)');
    ensureExtendsExclusionCorrectly('level', 'DEBUG',
      '(NOT level:INFO)',
      '(NOT level:(INFO OR DEBUG))');
    ensureExtendsExclusionCorrectly('level', 'DEBUG',
      '(NOT level:INFO) AND (NOT level:WARN)',
      '(NOT level:(INFO OR WARN OR DEBUG))');

    ensureExtendsExclusionCorrectly('level', 'HU HU',
      'NOT (level:(INFO OR DEBUG))',
      '(NOT level:(INFO OR DEBUG OR "HU HU"))');

    ensureExtendsExclusionCorrectly('level', 'FOO',
      'level:INFO AND (NOT level:WARN)',
      '(NOT level:(WARN OR FOO))');
    ensureExtendsExclusionCorrectly('level', 'FOO',
      'level:INFO AND (NOT (level:(WARN OR ERROR)))',
      '(NOT level:(WARN OR ERROR OR FOO))');

    ensureExtendsExclusionCorrectly('level', 'FOO',
      'cloudEnv:production OR cloudEnv:integration',
      '(cloudEnv:production OR cloudEnv:integration) AND (NOT level:FOO)');
    ensureExtendsExclusionCorrectly('level', 'FOO',
      'cloudEnv:production AND cloudEnv:integration',
      'cloudEnv:production AND cloudEnv:integration AND (NOT level:FOO)');

  });

});

