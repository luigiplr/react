/**
 * Copyright 2013-2015, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @emails react-core
 */

'use strict';

var mocks = require('mocks');

var ExecutionEnvironment;
var React;
var ReactDOM;
var ReactMarkupChecksum;
var ReactReconcileTransaction;
var ReactTestUtils;
var ReactServerAsyncRendering;

var concatStream;

var ID_ATTRIBUTE_NAME;

describe('ReactServerAsyncRendering', function() {
  beforeEach(function() {
    require('mock-modules').dumpCache();
    React = require('React');
    ReactDOM = require('ReactDOM');
    ReactMarkupChecksum = require('ReactMarkupChecksum');
    ReactTestUtils = require('ReactTestUtils');
    ReactReconcileTransaction = require('ReactReconcileTransaction');

    ExecutionEnvironment = require('ExecutionEnvironment');
    ExecutionEnvironment.canUseDOM = false;
    ReactServerAsyncRendering = require('ReactServerAsyncRendering');

    concatStream = require('concat-stream');

    var DOMProperty = require('DOMProperty');
    ID_ATTRIBUTE_NAME = DOMProperty.ID_ATTRIBUTE_NAME;
    spyOn(console, 'error');
  });

  describe('renderToString', function() {
    it('should generate simple markup', function() {
      var stream = concatStream({encoding: "string"}, function(result) {
        expect(result).toMatch(
          '<span ' + ID_ATTRIBUTE_NAME + '="[^"]+">hello world</span>'
        );
      });

      ReactServerAsyncRendering.renderToString(
        <span>hello world</span>,
        stream
      );

      stream.end();
    });

    it('should generate simple markup for self-closing tags', function() {
      var stream = concatStream({encoding: "string"}, function(result) {
        expect(result).toMatch(
          '<img ' + ID_ATTRIBUTE_NAME + '="[^"]+"/>'
        );
      });

      ReactServerAsyncRendering.renderToString(
        <img />,
        stream
      );

      stream.end();
    });

    it('should generate simple markup for attribute with `>` symbol', function() {
      var stream = concatStream({encoding: "string"}, function(result) {
        expect(result).toMatch(
          '<img data-attr="&gt;" ' + ID_ATTRIBUTE_NAME + '="[^"]+"/>'
        );
      });
      var response = ReactServerAsyncRendering.renderToString(
        <img data-attr=">" />,
        stream
      );

      stream.end();
    });

    it('should not register event listeners', function() {
      var stream = concatStream({encoding: "string"}, function(result) {});
      var EventPluginHub = require('EventPluginHub');
      var cb = mocks.getMockFunction();

      ReactServerAsyncRendering.renderToString(
        <span onClick={cb}>hello world</span>,
        stream
      );
      stream.end();
      expect(EventPluginHub.__getListenerBank()).toEqual({});
    });

    it('should render composite components', function() {
      var stream = concatStream({encoding: "string"}, function(result) {
        expect(result).toMatch(
          '<div ' + ID_ATTRIBUTE_NAME + '="[^"]+">' +
            '<span ' + ID_ATTRIBUTE_NAME + '="[^"]+">' +
              '<span ' + ID_ATTRIBUTE_NAME + '="[^"]+">My name is </span>' +
              '<span ' + ID_ATTRIBUTE_NAME + '="[^"]+">child</span>' +
            '</span>' +
          '</div>'
        );
      });
      var Parent = React.createClass({
        render: function() {
          return <div><Child name="child" /></div>;
        },
      });
      var Child = React.createClass({
        render: function() {
          return <span>My name is {this.props.name}</span>;
        },
      });
      var response = ReactServerAsyncRendering.renderToString(
        <Parent />, stream
      );

      stream.end();
    });

    it('should only execute certain lifecycle methods', function() {
      function runTest() {
        var stream = concatStream({encoding: "string"}, function(result) {
          expect(result).toMatch(
            '<span ' + ID_ATTRIBUTE_NAME + '="[^"]+">' +
              '<span ' + ID_ATTRIBUTE_NAME + '="[^"]+">Component name: </span>' +
              '<span ' + ID_ATTRIBUTE_NAME + '="[^"]+">TestComponent</span>' +
            '</span>'
          );
        });
        var lifecycle = [];
        var TestComponent = React.createClass({
          componentWillMount: function() {
            lifecycle.push('componentWillMount');
          },
          componentDidMount: function() {
            lifecycle.push('componentDidMount');
          },
          getInitialState: function() {
            lifecycle.push('getInitialState');
            return {name: 'TestComponent'};
          },
          render: function() {
            lifecycle.push('render');
            return <span>Component name: {this.state.name}</span>;
          },
          componentWillUpdate: function() {
            lifecycle.push('componentWillUpdate');
          },
          componentDidUpdate: function() {
            lifecycle.push('componentDidUpdate');
          },
          shouldComponentUpdate: function() {
            lifecycle.push('shouldComponentUpdate');
          },
          componentWillReceiveProps: function() {
            lifecycle.push('componentWillReceiveProps');
          },
          componentWillUnmount: function() {
            lifecycle.push('componentWillUnmount');
          },
        });

        var response = ReactServerAsyncRendering.renderToString(
          <TestComponent />, stream
        );

        stream.end();

        expect(lifecycle).toEqual(
          ['getInitialState', 'componentWillMount', 'render']
        );
      }

      runTest();

      // This should work the same regardless of whether you can use DOM or not.
      ExecutionEnvironment.canUseDOM = true;
      runTest();
    });

    it('should have the correct mounting behavior', function() {
      // This test is testing client-side behavior.
      ExecutionEnvironment.canUseDOM = true;

      var mountCount = 0;
      var numClicks = 0;

      var TestComponent = React.createClass({
        componentDidMount: function() {
          mountCount++;
        },
        click: function() {
          numClicks++;
        },
        render: function() {
          return (
            <span ref="span" onClick={this.click}>Name: {this.props.name}</span>
          );
        },
      });

      var element = document.createElement('div');
      ReactDOM.render(<TestComponent />, element);

      var lastMarkup = element.innerHTML;

      // Exercise the update path. Markup should not change,
      // but some lifecycle methods should be run again.
      ReactDOM.render(<TestComponent name="x" />, element);
      expect(mountCount).toEqual(1);

      // Unmount and remount. We should get another mount event and
      // we should get different markup, as the IDs are unique each time.
      ReactDOM.unmountComponentAtNode(element);
      expect(element.innerHTML).toEqual('');
      ReactDOM.render(<TestComponent name="x" />, element);
      expect(mountCount).toEqual(2);
      expect(element.innerHTML).not.toEqual(lastMarkup);

      // Now kill the node and render it on top of server-rendered markup, as if
      // we used server rendering. We should mount again, but the markup should
      // be unchanged. We will append a sentinel at the end of innerHTML to be
      // sure that innerHTML was not changed.
      ReactDOM.unmountComponentAtNode(element);
      expect(element.innerHTML).toEqual('');

      ExecutionEnvironment.canUseDOM = false;
      var stream = concatStream({encoding: "string"}, function(lastMarkup) {
        // first, we need to add the react checksum to the markup 
        lastMarkup = lastMarkup.replace(/\/?>/, ' data-react-checksum="' + hash + '"$&"')
        ExecutionEnvironment.canUseDOM = true;
        element.innerHTML = lastMarkup;

        ReactDOM.render(<TestComponent name="x" />, element);
        expect(mountCount).toEqual(3);
        expect(element.innerHTML).toBe(lastMarkup);
        ReactDOM.unmountComponentAtNode(element);
        expect(element.innerHTML).toEqual('');

        // Now simulate a situation where the app is not idempotent. React should
        // warn but do the right thing.
        element.innerHTML = lastMarkup;
        var instance = ReactDOM.render(<TestComponent name="y" />, element);
        expect(mountCount).toEqual(4);
        expect(console.error.argsForCall.length).toBe(1);
        expect(element.innerHTML.length > 0).toBe(true);
        expect(element.innerHTML).not.toEqual(lastMarkup);

        // Ensure the events system works
        expect(numClicks).toEqual(0);
        ReactTestUtils.Simulate.click(React.findDOMNode(instance.refs.span));
        expect(numClicks).toEqual(1);
      });

      var hash = ReactServerAsyncRendering.renderToString(
        <TestComponent name="x" />, stream
      );
      stream.end();
    });

    it('should throw with silly args', function() {
      expect(
        ReactServerAsyncRendering.renderToString.bind(
          ReactServerAsyncRendering,
          'not a component',
          concatStream({encoding: "string"}, function(result) {})
        )
      ).toThrow(
        'Invariant Violation: renderToString(): You must pass ' +
        'a valid ReactElement.'
      );
    });
  });

  describe('renderToStaticMarkup', function() {
    it('should not put checksum and React ID on components', function() {
      var stream = concatStream({encoding: "string"}, function(result) {
        expect(result).toBe('<span><div>inner text</div></span>');
      });
      var NestedComponent = React.createClass({
        render: function() {
          return <div>inner text</div>;
        },
      });

      var TestComponent = React.createClass({
        render: function() {
          return <span><NestedComponent /></span>;
        },
      });

      var response = ReactServerAsyncRendering.renderToStaticMarkup(
        <TestComponent />, stream
      );

      stream.end();
    });

    it('should not put checksum and React ID on text components', function() {
      var stream = concatStream({encoding: "string"}, function(result) {
        expect(result).toBe('<span>hello world</span>');
      });
      var TestComponent = React.createClass({
        render: function() {
          return <span>{'hello'} {'world'}</span>;
        },
      });

      var response = ReactServerAsyncRendering.renderToStaticMarkup(
        <TestComponent />, stream
      );

      stream.end();
    });

    it('should not register event listeners', function() {
      var EventPluginHub = require('EventPluginHub');
      var cb = mocks.getMockFunction();

      ReactServerAsyncRendering.renderToString(
        <span onClick={cb}>hello world</span>,
        concatStream({encoding: "string"}, function(result) {})
      );
      expect(EventPluginHub.__getListenerBank()).toEqual({});
    });

    it('should only execute certain lifecycle methods', function() {
      function runTest() {
        var lifecycle = [];
        var TestComponent = React.createClass({
          componentWillMount: function() {
            lifecycle.push('componentWillMount');
          },
          componentDidMount: function() {
            lifecycle.push('componentDidMount');
          },
          getInitialState: function() {
            lifecycle.push('getInitialState');
            return {name: 'TestComponent'};
          },
          render: function() {
            lifecycle.push('render');
            return <span>Component name: {this.state.name}</span>;
          },
          componentWillUpdate: function() {
            lifecycle.push('componentWillUpdate');
          },
          componentDidUpdate: function() {
            lifecycle.push('componentDidUpdate');
          },
          shouldComponentUpdate: function() {
            lifecycle.push('shouldComponentUpdate');
          },
          componentWillReceiveProps: function() {
            lifecycle.push('componentWillReceiveProps');
          },
          componentWillUnmount: function() {
            lifecycle.push('componentWillUnmount');
          },
        });

        var stream = concatStream({encoding: "string"}, function(result) {
          expect(result).toBe('<span>Component name: TestComponent</span>');
        });

        var response = ReactServerAsyncRendering.renderToStaticMarkup(
          <TestComponent />, stream
        );

        stream.end();
        expect(lifecycle).toEqual(
          ['getInitialState', 'componentWillMount', 'render']
        );
      }

      runTest();

      // This should work the same regardless of whether you can use DOM or not.
      ExecutionEnvironment.canUseDOM = true;
      runTest();
    });

    it('should throw with silly args', function() {
     expect(
        ReactServerAsyncRendering.renderToStaticMarkup.bind(
          ReactServerAsyncRendering,
          'not a component',
          concatStream({encoding: "string"}, function(result) {})
        )
      ).toThrow(
        'Invariant Violation: renderToStaticMarkup(): You must pass ' +
        'a valid ReactElement.'
      );
    });

    it('allows setState in componentWillMount without using DOM', function() {
      var stream = concatStream({encoding: "string"}, function(result) {
        expect(result.indexOf('hello, world') >= 0).toBe(true);
      });

      var Component = React.createClass({
        componentWillMount: function() {
          this.setState({text: 'hello, world'});
        },
        render: function() {
          return <div>{this.state.text}</div>;
        },
      });

      ReactReconcileTransaction.prototype.perform = function() {
        // We shouldn't ever be calling this on the server
        throw new Error('Browser reconcile transaction should not be used');
      };
      ReactServerAsyncRendering.renderToString(
        <Component />, stream
      );

      stream.end();
    });
  });
});
