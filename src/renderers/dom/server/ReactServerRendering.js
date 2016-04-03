/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactServerRendering
 */
'use strict';

var ReactDOMContainerInfo = require('ReactDOMContainerInfo');
var ReactDefaultBatchingStrategy = require('ReactDefaultBatchingStrategy');
var ReactElement = require('ReactElement');
var ReactMarkupChecksum = require('ReactMarkupChecksum');
var ReactServerBatchingStrategy = require('ReactServerBatchingStrategy');
var ReactServerRenderingTransaction =
  require('ReactServerRenderingTransaction');
var ReactUpdates = require('ReactUpdates');
var StringLazyTree = require('StringLazyTree');

var emptyObject = require('emptyObject');
var instantiateReactComponent = require('instantiateReactComponent');
var invariant = require('invariant');
var stream = require('stream');

/**
 * @param {ReactElement} element
 * @return {string} the HTML markup
 */
function renderToStringImpl(element, makeStaticMarkup) {
  var transaction;
  try {
    ReactUpdates.injection.injectBatchingStrategy(ReactServerBatchingStrategy);

    transaction = ReactServerRenderingTransaction.getPooled(makeStaticMarkup);

    return transaction.perform(function() {
      var componentInstance = instantiateReactComponent(element);
      var markup = componentInstance.mountComponent(
        transaction,
        null,
        ReactDOMContainerInfo(),
        emptyObject
      );
      markup = StringLazyTree.runToFinish(markup);
      if (!makeStaticMarkup) {
        markup = ReactMarkupChecksum.addChecksumToMarkup(markup);
      }
      return markup;
    }, null);
  } finally {
    ReactServerRenderingTransaction.release(transaction);
    // Revert to the DOM batching strategy since these two renderers
    // currently share these stateful modules.
    ReactUpdates.injection.injectBatchingStrategy(ReactDefaultBatchingStrategy);
  }
}

class RenderStream extends stream.Readable {
  constructor(lazyTree, options) {
    super(options);
    this.lazyTree = lazyTree;
  }

  _read(n) {
    ReactUpdates.injection.injectBatchingStrategy(ReactServerBatchingStrategy);
    this.push(StringLazyTree.run(this.lazyTree, n));
    // Revert to the DOM batching strategy since these two renderers
    // currently share these stateful modules.
    ReactUpdates.injection.injectBatchingStrategy(ReactDefaultBatchingStrategy);
  }
}

/**
 * @param {ReactElement} element
 * @return {string} the HTML markup
 */
function renderToStreamImpl(element, makeStaticMarkup) {
  var transaction;
  var resultStream;
  try {
    ReactUpdates.injection.injectBatchingStrategy(ReactServerBatchingStrategy);
    transaction = ReactServerRenderingTransaction.getPooled(makeStaticMarkup);

    resultStream = transaction.perform(function() {
      var componentInstance = instantiateReactComponent(element);
      var markup = componentInstance.mountComponent(
        transaction,
        null,
        ReactDOMContainerInfo(),
        emptyObject
      );
      ReactUpdates.injection.injectBatchingStrategy(ReactDefaultBatchingStrategy);
      return new RenderStream(markup);
      // if (!makeStaticMarkup) {
      //   markup = ReactMarkupChecksum.addChecksumToMarkup(markup);
      // }
    }, null);
  } catch (e) {
    ReactServerRenderingTransaction.release(transaction);
    throw e;
  }
  resultStream.on('end', () => {
    ReactServerRenderingTransaction.release(transaction);
  });
  return resultStream;
}

function renderToString(element) {
  invariant(
    ReactElement.isValidElement(element),
    'renderToString(): You must pass a valid ReactElement.'
  );
  return renderToStringImpl(element, false);
}

function renderToStaticMarkup(element) {
  invariant(
    ReactElement.isValidElement(element),
    'renderToStaticMarkup(): You must pass a valid ReactElement.'
  );
  return renderToStringImpl(element, true);
}

function renderToStream(element) {
  invariant(
    ReactElement.isValidElement(element),
    'renderToStream(): You must pass a valid ReactElement.'
  );
  return renderToStreamImpl(element, false);
}

function renderToStaticMarkupStream(element) {
  invariant(
    ReactElement.isValidElement(element),
    'renderToStaticMarkupStream(): You must pass a valid ReactElement.'
  );
  return renderToStreamImpl(element, true);
}

module.exports = {
  renderToString: renderToString,
  renderToStaticMarkup: renderToStaticMarkup,
  renderToStream: renderToStream,
  renderToStaticMarkupStream: renderToStaticMarkupStream,
};
