'use strict';

var queryParser = require('./queryParser');
var escaping = require('./escaping');
var manipulator = require('./lucene-manipulator');

exports.parse = queryParser.parse.bind(queryParser);
exports.toString = require('./toString');

exports.term = {
  escape: escaping.escape,
  unescape: escaping.unescape
};

exports.phrase = {
  escape: escaping.escapePhrase,
  unescape: escaping.unescapePhrase
};

exports.manipulator = {
  extendFilter: manipulator.extendFilter,
  setFilter: manipulator.setFilter,
  deleteField: manipulator.deleteField,
  collectTermsForField: manipulator.collectTermsForField,
};
