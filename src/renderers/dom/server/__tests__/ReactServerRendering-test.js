/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @emails react-core
 */

'use strict';

var ExecutionEnvironment;
var React;
var ReactDOM;
var ReactMarkupChecksum;
var ReactReconcileTransaction;
var ReactTestUtils;
var ReactServerRendering;

var ID_ATTRIBUTE_NAME;
var ROOT_ATTRIBUTE_NAME;

function withStringAndStreamIt(desc, testFn) {
  it(desc + ' with string rendering', testFn.bind(null, function(component, callback) {
    callback(ReactServerRendering.renderToString(component));
  }));
  it(desc + ' with stream rendering', testFn.bind(null, function(component, callback) {
    var result = '';
    ReactServerRendering.renderToStream(component)
      .on('data', function(data) {
        result += data;
      })
      .on('end', function() {
        callback(result);
      });
  }));
}

function withStaticStringAndStreamIt(desc, testFn) {
  it(desc + ' with static string rendering', testFn.bind(null, function(component, callback) {
    callback(ReactServerRendering.renderToStaticMarkup(component));
  }));
  it(desc + ' with static stream rendering', testFn.bind(null, function(component, callback) {
    var result = '';
    ReactServerRendering.renderToStaticMarkupStream(component)
      .on('data', function(data) {
        result += data;
      })
      .on('end', function() {
        callback(result);
      });
  }));
}

describe('ReactServerRendering', function() {
  beforeEach(function() {
    jest.resetModuleRegistry();
    React = require('React');
    ReactDOM = require('ReactDOM');
    ReactMarkupChecksum = require('ReactMarkupChecksum');
    ReactTestUtils = require('ReactTestUtils');
    ReactReconcileTransaction = require('ReactReconcileTransaction');

    ExecutionEnvironment = require('ExecutionEnvironment');
    ExecutionEnvironment.canUseDOM = false;
    ReactServerRendering = require('ReactServerRendering');

    var DOMProperty = require('DOMProperty');
    ID_ATTRIBUTE_NAME = DOMProperty.ID_ATTRIBUTE_NAME;
    ROOT_ATTRIBUTE_NAME = DOMProperty.ROOT_ATTRIBUTE_NAME;
  });

  describe('renderToString', function() {
    withStringAndStreamIt('should generate simple markup', function(render) {
      var done = false;
      render(
        <span>hello world</span>,
        (response) => {
          expect(response).toMatch(
            '<span ' + ROOT_ATTRIBUTE_NAME + '="" ' +
              ID_ATTRIBUTE_NAME + '="[^"]+"( ' +
              ReactMarkupChecksum.CHECKSUM_ATTR_NAME + '="[^"]+")?>hello world</span>'
          );
          done = true;
        }
      );
      waitsFor(() => done);
    });

    withStringAndStreamIt('should generate simple markup for self-closing tags', function(render) {
      var done = false;
      render(
        <img />,
        (response) => {
          expect(response).toMatch(
            '<img ' + ROOT_ATTRIBUTE_NAME + '="" ' +
              ID_ATTRIBUTE_NAME + '="[^"]+"( ' +
              ReactMarkupChecksum.CHECKSUM_ATTR_NAME + '="[^"]+")?/>'
          );
          done = true;
        }
      );
      waitsFor(() => done);
    });

    withStringAndStreamIt('should generate simple markup for attribute with `>` symbol', function(render) {
      var done = false;
      render(
        <img data-attr=">" />,
        (response) => {
          expect(response).toMatch(
            '<img data-attr="&gt;" ' + ROOT_ATTRIBUTE_NAME + '="" ' +
              ID_ATTRIBUTE_NAME + '="[^"]+"( ' +
              ReactMarkupChecksum.CHECKSUM_ATTR_NAME + '="[^"]+")?/>'
          );
          done = true;
        }
      );
      waitsFor(() => done);
    });

    withStringAndStreamIt('should generate comment markup for component returns null', function(render) {
      var NullComponent = React.createClass({
        render: function() {
          return null;
        },
      });
      var done = false;
      render(<NullComponent />,
        (response) => {
          expect(response).toBe('<!-- react-empty: 1 -->');
          done = true;
        }
      );
      waitsFor(() => done);
    });

    withStringAndStreamIt('should not register event listeners', function(render) {
      var EventPluginHub = require('EventPluginHub');
      var cb = jest.genMockFn();

      var done = false;
      render(
        <span onClick={cb}>hello world</span>,
        (response) => {
          expect(EventPluginHub.__getListenerBank()).toEqual({});
          done = true;
        }
      );
      waitsFor(() => done);
    });

    withStringAndStreamIt('should render composite components', function(render) {
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
      var done = false;
      render(
        <Parent />,
        (response) => {
          expect(response).toMatch(
            '<div ' + ROOT_ATTRIBUTE_NAME + '="" ' +
              ID_ATTRIBUTE_NAME + '="[^"]+"( ' +
              ReactMarkupChecksum.CHECKSUM_ATTR_NAME + '="[^"]+")?>' +
              '<span ' + ID_ATTRIBUTE_NAME + '="[^"]+">' +
                '<!-- react-text: [0-9]+ -->My name is <!-- /react-text -->' +
                '<!-- react-text: [0-9]+ -->child<!-- /react-text -->' +
              '</span>' +
            '</div>'
          );
          done = true;
        }
      );
      waitsFor(() => done);
    });

    withStringAndStreamIt('should only execute certain lifecycle methods', function(render) {
      function runTest(cb) {
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

        render(
          <TestComponent />,
          (response) => {
            expect(response).toMatch(
              '<span ' + ROOT_ATTRIBUTE_NAME + '="" ' +
                ID_ATTRIBUTE_NAME + '="[^"]+"( ' +
                ReactMarkupChecksum.CHECKSUM_ATTR_NAME + '="[^"]+")?>' +
                '<!-- react-text: [0-9]+ -->Component name: <!-- /react-text -->' +
                '<!-- react-text: [0-9]+ -->TestComponent<!-- /react-text -->' +
              '</span>'
            );
            expect(lifecycle).toEqual(
              ['getInitialState', 'componentWillMount', 'render']
            );
            cb();
          }
        );

      }

      var done = false;
      runTest(() => {
        // This should work the same regardless of whether you can use DOM or not.
        ExecutionEnvironment.canUseDOM = true;
        runTest(() => {
          done = true;
        });
      });
      waitsFor(() => done);
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
      lastMarkup = ReactServerRendering.renderToString(
        <TestComponent name="x" />
      );
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
      spyOn(console, 'error');
      var instance = ReactDOM.render(<TestComponent name="y" />, element);
      expect(mountCount).toEqual(4);
      expect(console.error.argsForCall.length).toBe(1);
      expect(element.innerHTML.length > 0).toBe(true);
      expect(element.innerHTML).not.toEqual(lastMarkup);

      // Ensure the events system works
      expect(numClicks).toEqual(0);
      ReactTestUtils.Simulate.click(ReactDOM.findDOMNode(instance.refs.span));
      expect(numClicks).toEqual(1);
    });

    it('should throw with silly args with string rendering', function() {
      expect(
        ReactServerRendering.renderToString.bind(
          ReactServerRendering,
          'not a component'
        )
      ).toThrow(
        'renderToString(): You must pass a valid ReactElement.'
      );
    });

    it('should throw with silly args with stream rendering', function() {
      expect(
        ReactServerRendering.renderToStream.bind(
          ReactServerRendering,
          'not a component'
        )
      ).toThrow(
        'renderToStream(): You must pass a valid ReactElement.'
      );
    });
  });

  describe('renderToStaticMarkup', function() {
    withStaticStringAndStreamIt('should not put checksum and React ID on components', function(render) {
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

      var done = false;
      render(
        <TestComponent />,
        (response) => {
          expect(response).toBe('<span><div>inner text</div></span>');
          done = true;
        }
      );
      waitsFor(() => done);
    });

    withStaticStringAndStreamIt('should not put checksum and React ID on text components', function(render) {
      var TestComponent = React.createClass({
        render: function() {
          return <span>{'hello'} {'world'}</span>;
        },
      });

      var done = false;
      render(
        <TestComponent />,
        (response) => {
          expect(response).toBe('<span>hello world</span>');
          done = true;
        }
      );
      waitsFor(() => done);
    });

    withStaticStringAndStreamIt('should not register event listeners', function(render) {
      var EventPluginHub = require('EventPluginHub');
      var cb = jest.genMockFn();

      var done = false;
      render(
        <span onClick={cb}>hello world</span>,
        () => {
          expect(EventPluginHub.__getListenerBank()).toEqual({});
          done = true;
        }
      );
      waitsFor(() => done);
    });

    withStaticStringAndStreamIt('should only execute certain lifecycle methods', function(render) {
      function runTest(cb) {
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

        render(
          <TestComponent />,
          (response) => {
            expect(response).toBe('<span>Component name: TestComponent</span>');
            expect(lifecycle).toEqual(
              ['getInitialState', 'componentWillMount', 'render']
            );
            cb();
          }
        );
      }

      var done = false;
      runTest(() => {
        // This should work the same regardless of whether you can use DOM or not.
        ExecutionEnvironment.canUseDOM = true;
        runTest(() => {
          done = true;
        });
      });
      waitsFor(() => done);
    });

    it('should throw with silly args', function() {
      expect(
        ReactServerRendering.renderToStaticMarkup.bind(
          ReactServerRendering,
          'not a component'
        )
      ).toThrow(
        'renderToStaticMarkup(): You must pass a valid ReactElement.'
      );
    });

    it('should throw with silly args', function() {
      expect(
        ReactServerRendering.renderToStaticMarkupStream.bind(
          ReactServerRendering,
          'not a component'
        )
      ).toThrow(
        'renderToStaticMarkupStream(): You must pass a valid ReactElement.'
      );
    });

    withStaticStringAndStreamIt('allows setState in componentWillMount without using DOM', function(render) {
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
      var done = false;
      render(
        <Component />,
        (markup) => {
          expect(markup.indexOf('hello, world') >= 0).toBe(true);
          done = true;
        }
      );
      waitsFor(() => done);
    });
  });
});
