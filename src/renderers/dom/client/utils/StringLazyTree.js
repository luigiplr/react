/**
 * Copyright 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule StringLazyTree
 */

'use strict';

const StringLazyTree = () => {
  return {
    children: [],
  };
};


const queueText = (tree, text, filter) => {
  tree.children.push({text, filter});
};

const queueFunction = (tree, fn, filter) => {
  tree.children.push({fn, filter});
};

const queueSubTree = (tree, subTree, filter) => {
  tree.children.push({subTree, filter});
};

const run = (tree, length) => {
  if (tree.childIndex >= tree.children.length) {
    return null;
  }

  var result = '';
  tree.childIndex = tree.childIndex || 0;
  while (tree.childIndex < tree.children.length) {
    var child = tree.children[tree.childIndex];
    var childText = null;
    if (typeof child.text === 'string') {
      childText = child.text;
      tree.childIndex++;
    } else {
      // instantiate the child if necessary.
      if (!child.subTree) {
        child.subTree = child.fn();
        child.fn = null;
      }
      childText = run(child.subTree, length);
      if (null === childText) {
        tree.childIndex++;
        continue;
      }
    }
    if (child.filter) {
      childText = child.filter(childText);
    }
    result += childText;
    length -= childText.length;
    if (length <= 0) {
      return result;
    }
  }
  return result;
};

const runToFinish = (tree) => {
  return run(tree, Infinity);
};

StringLazyTree.queueText = queueText;
StringLazyTree.queueFunction = queueFunction;
StringLazyTree.queueSubTree = queueSubTree;
StringLazyTree.run = run;
StringLazyTree.runToFinish = runToFinish;

module.exports = StringLazyTree;
