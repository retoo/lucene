'use strict';

const queryParser = require('./queryParser');

const lucene = {
  parse: queryParser.parse.bind(queryParser),
  toString: require('./toString')
};

// exports

exports.extendFilter = extendFilter;
exports.setFilter = setFilter;
exports.deleteField = deleteField;
exports.collectTermsForField = collectTermsForField;

// *** exported *** //

/**
 * Extend the inclusion/exclusion of a field by a given term. I.e. if you have "foo:bar"  and extend it with
 * foo=baz the returned ast will contain foo:(bar OR baz). The system understands different ways of selecting
 * values, i.e. (foo:1 OR foo:1) extended by foo:3 will result in foo:(1 OR 2 OR 3).
 *
 * The same function can be used to extend exclusions, by setting negated=true.
 *
 * Please note: conflicting terms are automatically removed, if you have (NOT foo:
 *
 * @param ast original ast
 * @param field
 * @param value
 * @param negated set to true if you want a negative filter
 * @returns ast resulting ast
 */
function extendFilter(ast, field, value, negated) {
  let currentValuesMap = collectTermsForField(ast, field, negated);
  currentValuesMap[value] = true;

  let currentValues = Object.keys(currentValuesMap);

  let renderedValues = Array.from(currentValues).map(v => renderValueForQuery(v));

  let renderdValue;
  if (renderedValues.length > 1) {
    renderdValue = '(' + (renderedValues.join(' OR ')) + ')';
  } else {
    renderdValue = renderedValues[0];
  }
  ast = deleteField(ast, field);
  let newQuery = field + ':' + renderdValue;

  if (negated) {
    newQuery = '(NOT ' + newQuery + ')';
  }

  return extendQuery(ast, newQuery);
}


/**
 * ensure that in the given ast the filter is set to the given field/value.
 *
 * i.e. if you have foo:1 AND bar:2 and call it with 'bar:42' you will get 'foo:1 AND bar:42' as a new query.
 *
 * @param ast original ast
 * @param field
 * @param value
 * @param negated negated set to true if you want a negative filter
 * @returns ast resulting ast
 */
function setFilter(ast, field, value, negated = false) {
  ast = deleteField(ast, field);

  let query = field + ':' + renderValueForQuery(value);
  if (negated) {
    query = '(NOT ' + query + ')';
  }
  return extendQuery(ast, query);
}

/**
 * Delete all expressions that use the given field.
 *
 * i.e. 'foo:1 AND (bar:1 OR bar:2)' => will result in foo:1 if you delete 'bar'
 *
 *
 * @param ast original ast
 * @param fieldToBeDeleted
 * @returns ast resulting ast
 */
function deleteField(ast, fieldToBeDeleted) {
  ast = walk(ast, (path, parent, condition) => {
    return condition.field !== fieldToBeDeleted;
  });
  return normalize(ast);
}


/**
 * collect all terms that are set for a given field. Negated terms
 * are not returned, unless negated is set to true
 *
 * @param ast
 * @param field
 * @param countNegated set to true if you want 'NOT' terms to be counted
 * @returns a dict, use keys() to get a list of all terms
 */
function collectTermsForField(ast, field, countNegated = false) {
  let terms = {};
  walk(ast, (path, parent, element) => {
    if (Object.prototype.hasOwnProperty.call(element, 'term')) {
      let term = element.term;
      let ancestors = [...path, element].reverse();

      for (let el of ancestors) {
        if (el.field === field) {
          // now count the negations
          let notCount = ancestors.filter(e => e.start === 'NOT').length;

          let negated = notCount % 2 === 1;
          if (negated === countNegated) {
            terms[term] = true;
          }
          break;
        }
      }

    }
    return true;
  });

  return terms;
}

// *** internal *** //

/**
 * Extend the given ast with the new term. Ensures, that the original
 * expression and the new are combined as an 'AND' statement.
 *
 * i.e. if ast contains "foo OR bar" and renderedTerm contains x:y
 *  => the function will return (foo OR bar) AND x:y
 *
 * @param ast
 * @param renderedTerm
 * @returns modified ast
 */
function extendQuery(ast, renderedTerm) {
  let currentQuery = lucene.toString(ast);
  let newQuery;

  if (currentQuery === '') {
    newQuery = renderedTerm;
  } else {

    if (ast.operator === 'OR') {
      currentQuery = '(' + currentQuery + ')';
    }
    newQuery = currentQuery + ' AND ' + renderedTerm;
  }
  return lucene.parse(newQuery);
}

/**
 * normalize the ast tree deleting elements.
 *
 * @param ast
 * @returns ast
 */
function normalize(ast) {
  let mutations = 0;
  let limit = 1000;
  do {
    limit -= 1;
    mutations = 0;
    ast = nodes(ast, (path, parent, node) => {
      let leftIsNotSet = node.left === null;
      let rightIsNotSet = node.right === null || node.right === undefined;
      let leftNorRightAreSet = leftIsNotSet && rightIsNotSet;

      if (Object.prototype.hasOwnProperty.call(node, 'field')) {
        // node with field set, meaning something like: foo:(x OR y)
        if (leftNorRightAreSet) {
          // all children are gone, we delete the condition
          mutations += 1;
          return false;
        } else if (leftIsNotSet) {
          // left is null, but right is, we move right to left
          mutations += 1;
          // but right is set
          node.left = node.right;
          node.right = null;
        } else if (rightIsNotSet) {
          // just remove it then, that's fine
          delete node.right;
          delete node.operator;
        }
        return true;
      } else {
        if (leftNorRightAreSet) {
          // both sides of a node are gone, we delete this node
          mutations += 1;
          return false;
        } else if (leftIsNotSet) {
          // left is gone, we replace ourself with the right side
          mutations += 1;
          return node.right;
        } else if (node.right === null) {
          // right side gone, we replace ourself with the right side
          mutations += 1;
          return node.left;
        } else {
          return true;
        }
      }
    });

    if (limit < 0) {
      throw Error('infinite loop in normalize for ' + printAst(ast));
    }
  } while (mutations > 0);

  return ast;
}

/**
 * walk through the ast, calling handler for each element
 * @param ast ast to be walked
 * @param handler callback, will get three parameters, a the current path, to this node
 *                the parent elment (or null for root) and the current element
 *
 *                The handler can decide what should happend to a node, return false if this element should be deleted
 *                return a new object to replace that node, or return true for no change.
 *
 *                Please be aware, after modification the tree must be traversed again for a full view!
  * @return modified ast
 */
function walk(ast, handler) {
  var path = [];
  let resp = handler(path, null, ast);


  // handle special case of the root element
  if (typeof resp === 'object') {
    ast = resp;
  } else if (resp === false) {
    // root got deleted
    ast = {};
  } else if (resp === undefined || resp == null) {
    throw new Error('resp should not be undefined or null');
  }
  let queue = [[ast, []]];

  // iterate through tree breadth-first. The callback can
  // decide if any modifications are needed at the tree
  while (queue.length > 0) {
    let [el, path] = queue.shift();


    ['left', 'right'].forEach(side => {
      let value = el[side];
      if (value) {
        let pathCopy = [...path, el];
        let resp = handler(pathCopy, el, value);

        if (resp === true) {
          queue.push([value, pathCopy]);
        } else if (resp === false) {
          el[side] = null;
        } else if (resp === undefined || resp == null) {
          throw new Error('resp should not be undefined or nul');
        } else {
          el[side] = resp;
          queue.push([resp, pathCopy]);
        }
      }
    });

  }
  return ast;
}

/**
 * iterate over all nodes (meaning AST elements that have a left and right side)
 * @param ast
 * @param handler
 * @returns sat
 */
function nodes(ast, handler) {
  return walk(ast, (path, parent, element) => {
    let isNode = Object.prototype.hasOwnProperty.call(element, 'left');
    if (isNode) {
      return handler(path, parent, element);
    } else {
      return true;
    }
  });
}



/**
 * escape all backslashes in a string
 */
function escapeStr(s) {
  return s.replace(/["\\]/g, char => '\\' + char);
}

const OPERATORS = ['OR', 'NOT', 'AND'];

/**
 * check if given term needs quotes
 * @param str
 * @returns {boolean}
 */
function needsQuotes(str) {
  let containsSpecialChar = /[+\-!(){}[\]^"?:\\&|'/\s*~]+/.test(str);
  return containsSpecialChar || OPERATORS.includes(str);
}

/**
 * quote terms if needed
 */
function renderValueForQuery(term) {
  let quoted = needsQuotes(term);
  if (quoted) {
    return '"' + escapeStr(term) + '"';
  } else {
    return term;
  }
}

/**
 * debugging
 * @param ast
 * @returns {string}
 */
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
  }
  return JSON.stringify(copy, null, 2);
}

