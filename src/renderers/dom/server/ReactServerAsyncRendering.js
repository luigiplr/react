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
        if (stream.flush) stream.flush();
        this.buffer = "";
      }
    },

    flush: function() {
      stream.write(this.buffer);
      if (stream.flush) stream.flush();
    },

    end: function(data) {
      stream.write(this.buffer);
      if (stream.flush) stream.flush();
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
      if (stream.flush) stream.flush(); 
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

  var usingV1 = false;
  // deprecation warning for version 2. The v1 API allowed you to pass in a stream and returned
  // a Promise of a hash ; the v2 API returns a stream with a .hash property.
  // v1 also allowed an options hash, which v2 will not.
  if (stream) {
    usingV1 = true;
    console.error(
      "You are using v1.x of the renderToString API, which is deprecated. " +
      "Instead of accepting a stream parameter and returning a Promise of a hash, the API " + 
      "now returns a stream with a hash Promise property. " + 
      "Support for this version of the API will be removed in the 3.0.0 version of react-dom-stream. " +
      "Please update your code, and for more info, check out (TODO: add URL here)."
      );
  } else {
    stream = require("stream").PassThrough();
  }

  var bufferSize = 10000;
  if (options && options.bufferSize) {
    console.error(
      "The options hash and bufferSize arguments have been deprecated and will be removed in " +
      "the v3.0.0 of react-dom-stream. " +
      "Please update your code, and for more info, check out (TODO: add URL here)."
      );
    bufferSize = options.bufferSize;
  }
  var hashPromise = new Promise(function(resolve, reject) {
    var transaction;
    try {
      ReactUpdates.injection.injectBatchingStrategy(ReactServerBatchingStrategy);

      var id = ReactInstanceHandles.createReactRootID();
      transaction = ReactServerRenderingTransaction.getPooled(false);

      var wrappedStream = hashedStream(bufferedStream(stream, bufferSize));
      transaction.perform(function() {
        var componentInstance = instantiateReactComponent(element, null);
        componentInstance.mountComponentAsync(id, transaction, emptyObject, wrappedStream);
        wrappedStream.flush();
        resolve(wrappedStream.hash());
      }, null);
    } finally {
      ReactServerRenderingTransaction.release(transaction);
      // Revert to the DOM batching strategy since these two renderers
      // currently share these stateful modules.
      ReactUpdates.injection.injectBatchingStrategy(ReactDefaultBatchingStrategy);
    }
  });

  if (usingV1) {
    return hashPromise;
  } else {
    stream.hash = hashPromise;
    return stream;
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

  var usingV1 = false;
  // deprecation warning for version 2. The v1 API allowed you to pass in a stream and returned
  // a Promise of a hash ; the v2 API returns a stream with a .hash property.
  // v1 also allowed an options hash, which v2 will not.
  if (stream) {
    usingV1 = true;
    console.error(
      "You are using v1.x of the renderToMarkupStream API, which is deprecated. " +
      "Instead of accepting a stream parameter and returning a Promise, the API now just returns a stream. " + 
      "Support for this version of the API will be removed in the 3.0.0 version of react-dom-stream. " +
      "Please update your code, and for more info, check out (TODO: add URL here)."
      );
  } else {
    stream = require("stream").PassThrough();
  }

  var bufferSize = 10000;
  if (options && options.bufferSize) {
    console.error(
      "The options hash and bufferSize arguments have been deprecated and will be removed in " +
      "the v3.0.0 of react-dom-stream. " +
      "Please update your code, and for more info, check out (TODO: add URL here)."
      );
    bufferSize = options.bufferSize;
  }
  var promise = new Promise(function(resolve, reject) {
    var transaction;
    try {
      ReactUpdates.injection.injectBatchingStrategy(ReactServerBatchingStrategy);

      var id = ReactInstanceHandles.createReactRootID();
      transaction = ReactServerRenderingTransaction.getPooled(true);

      var wrappedStream = bufferedStream(stream, bufferSize);
      transaction.perform(function() {
        var componentInstance = instantiateReactComponent(element, null);
        componentInstance.mountComponentAsync(id, transaction, emptyObject, wrappedStream);
        wrappedStream.flush();
      }, null);

      return Promise.resolve(null);
    } finally {
      ReactServerRenderingTransaction.release(transaction);
      // Revert to the DOM batching strategy since these two renderers
      // currently share these stateful modules.
      ReactUpdates.injection.injectBatchingStrategy(ReactDefaultBatchingStrategy);
    }
  });

  if (usingV1) {
    return promise;
  } else {
    return stream;
  }
}

module.exports = {
  renderToStringStream: renderToStringStream,
  renderToStaticMarkupStream: renderToStaticMarkupStream,
};
