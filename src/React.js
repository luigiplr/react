/**
 * Copyright 2013-2015, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule React
 */

'use strict';

var ReactDOM = require('ReactDOM');
var ReactDOMServer = require('ReactDOMServer');
var ReactIsomorphic = require('ReactIsomorphic');

var assign = require('Object.assign');
var deprecated = require('deprecated');

// `version` will be added here by ReactIsomorphic.
var React = {};

assign(React, ReactIsomorphic);

assign(React, {
  // ReactDOM
  findDOMNode: deprecated(
    'findDOMNode',
    'ReactDOM',
    'react-dom',
    ReactDOM,
    ReactDOM.findDOMNode
  ),
  render: deprecated(
    'render',
    'ReactDOM',
    'react-dom',
    ReactDOM,
    ReactDOM.render
  ),
  unmountComponentAtNode: deprecated(
    'unmountComponentAtNode',
    'ReactDOM',
    'react-dom',
    ReactDOM,
    ReactDOM.unmountComponentAtNode
  ),

  // ReactDOMServer
  renderToString: deprecated(
    'renderToString',
    'ReactDOMServer',
    'react-dom/server',
    ReactDOMServer,
    ReactDOMServer.renderToStringStream
  ),
  renderToStaticMarkup: deprecated(
    'renderToStaticMarkup',
    'ReactDOMServer',
    'react-dom/server',
    ReactDOMServer,
    ReactDOMServer.renderToStaticMarkupStream
  ),
});

React.__SECRET_DOM_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = ReactDOM;

module.exports = React;
