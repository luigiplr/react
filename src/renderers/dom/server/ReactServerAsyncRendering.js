/**
 * Copyright 2013-2015, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @typechecks static-only
 * @providesModule ReactServerAsyncRendering
 */
'use strict';

var ReactDefaultBatchingStrategy = require('ReactDefaultBatchingStrategy');
var ReactElement = require('ReactElement');
var ReactInstanceHandles = require('ReactInstanceHandles');
var ReactMarkupChecksum = require('ReactMarkupChecksum');
var ReactServerBatchingStrategy = require('ReactServerBatchingStrategy');
var ReactServerRenderingTransaction =
  require('ReactServerRenderingTransaction');
var ReactUpdates = require('ReactUpdates');

var emptyObject = require('emptyObject');
var instantiateReactComponent = require('instantiateReactComponent');
var invariant = require('invariant');
var rollingAdler32 = require('rollingAdler32');

function bufferedStream(stream, bufferSize) {
  // for now, we need to buffer some of the stream coming out; express performs really poorly if you 
  // chunk out a few bytes at a time. I plan to move this functionality into react-dom-stream.
  return {
    write: function(data) {
      this.buffer = this.buffer || "";
      this.buffer += data;

      if (this.buffer.length >= bufferSize) {
        stream.write(this.buffer);
        stream.flush();
        this.buffer = "";
      }
    },

    flush: function() {
      stream.write(this.buffer);
      stream.flush();
    },

    end: function(data) {
      stream.write(this.buffer);
      stream.flush();
      stream.end(data);
    }
  }

}

function hashedStream(stream) {
  return {
    rollingHash: rollingAdler32(''),

    write: function(text) {
      // pass through to the underlying stream.
      stream.write(text);
      // also, add to the rolling hash.
      this.rollingHash = rollingAdler32(text, this.rollingHash);
    },
    
    flush: function() { 
      stream.flush(); 
    },
    
    end: function(data) { 
      stream.end(data); 
      this.rollingHash = rollingAdler32(data, this.rollingHash);
    },

    hash: function() { return this.rollingHash.hash(); }
  }
}

/**
 * @param {ReactElement} element
 * @param {Stream} stream to write to
 * @return {Promise(Number)} a Promise of the markup checksum, which resolves when the method is done.
 */
function renderToStringStream(element, stream, options) {
  invariant(
    ReactElement.isValidElement(element),
    'renderToStringStream(): You must pass a valid ReactElement.'
  );

  var bufferSize = 10000;
  if (options && options.bufferSize) {
    bufferSize = options.bufferSize;
  }
  var transaction;
  try {
    ReactUpdates.injection.injectBatchingStrategy(ReactServerBatchingStrategy);

    var id = ReactInstanceHandles.createReactRootID();
    transaction = ReactServerRenderingTransaction.getPooled(false);

    stream = bufferedStream(stream, bufferSize);
    stream = hashedStream(stream);
    var hash = transaction.perform(function() {
      var componentInstance = instantiateReactComponent(element, null);
      componentInstance.mountComponentAsync(id, transaction, emptyObject, stream);
      stream.flush();
      return stream.hash();
    }, null);
    return Promise.resolve(hash);
  } finally {
    ReactServerRenderingTransaction.release(transaction);
    // Revert to the DOM batching strategy since these two renderers
    // currently share these stateful modules.
    ReactUpdates.injection.injectBatchingStrategy(ReactDefaultBatchingStrategy);
  }
}

/**
 * @param {ReactElement} element
 * @param {Stream} stream to write markup to, without the extra React ID
 * @return {Promise} a Promise that resolves when the method is done. 
 * (for generating static pages)
 */
function renderToStaticMarkupStream(element, stream, options) {
  invariant(
    ReactElement.isValidElement(element),
    'renderToStaticMarkupStream(): You must pass a valid ReactElement.'
  );

  var bufferSize = 10000;
  if (options && options.bufferSize) {
    bufferSize = options.bufferSize;
  }
  var transaction;
  try {
    ReactUpdates.injection.injectBatchingStrategy(ReactServerBatchingStrategy);

    var id = ReactInstanceHandles.createReactRootID();
    transaction = ReactServerRenderingTransaction.getPooled(true);

    stream = bufferedStream(stream, bufferSize);
    transaction.perform(function() {
      var componentInstance = instantiateReactComponent(element, null);
      componentInstance.mountComponentAsync(id, transaction, emptyObject, stream);
      stream.flush();
    }, null);

    return Promise.resolve(null);
  } finally {
    ReactServerRenderingTransaction.release(transaction);
    // Revert to the DOM batching strategy since these two renderers
    // currently share these stateful modules.
    ReactUpdates.injection.injectBatchingStrategy(ReactDefaultBatchingStrategy);
  }
}

module.exports = {
  renderToStringStream: renderToStringStream,
  renderToStaticMarkupStream: renderToStaticMarkupStream,
};
