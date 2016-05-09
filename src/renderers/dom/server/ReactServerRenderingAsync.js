/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactServerRenderingAsync
 */

/**
tree node looks like:

{
  element: ReactElement that is this tree node
  root: true if at root
  childIndex: which child this node is at
}
*/

'use strict';

var BeforeInputEventPlugin = require('BeforeInputEventPlugin');
var ChangeEventPlugin = require('ChangeEventPlugin');
var CSSPropertyOperations = require('CSSPropertyOperations');
var DOMPropertyOperations = require('DOMPropertyOperations');
var EnterLeaveEventPlugin = require('EnterLeaveEventPlugin');
var EventPluginRegistry = require('EventPluginRegistry');
var escapeTextContentForBrowser = require('escapeTextContentForBrowser');
var ReactInjection = require('ReactInjection');
var SelectEventPlugin = require('SelectEventPlugin');
var SimpleEventPlugin = require('SimpleEventPlugin');

var registrationNameModules = EventPluginRegistry.registrationNameModules;

// copied from ReactDOMComponent.js
// For HTML, certain tags should omit their close tag. We keep a whitelist for
// those special-case tags.
const voidTags = {
  'area': true,
  'base': true,
  'br': true,
  'col': true,
  'embed': true,
  'hr': true,
  'img': true,
  'input': true,
  'keygen': true,
  'link': true,
  'meta': true,
  'param': true,
  'source': true,
  'track': true,
  'wbr': true,
  // NOTE: menuitem's close tag should be omitted, but that causes problems.
};

// copied from ReactDOMComponent.js
var newlineEatingTags = {
  'listing': true,
  'pre': true,
  'textarea': true,
};

var EMPTY_OBJECT = {};

// in order to get good checking of event names, we need to inject event plugins
// this was copied from ReactDefaultInjection.js
ReactInjection.EventPluginHub.injectEventPluginsByName({
  SimpleEventPlugin: SimpleEventPlugin,
  EnterLeaveEventPlugin: EnterLeaveEventPlugin,
  ChangeEventPlugin: ChangeEventPlugin,
  SelectEventPlugin: SelectEventPlugin,
  BeforeInputEventPlugin: BeforeInputEventPlugin,
});


// TODO: make this real like a generator
const renderResultToGenerator = (result, tree, makeStaticMarkup) => {
  return {
    text: result.text,
    next: (length) => {
      if (result.done) {
        return null;
      }
      return renderResultToGenerator(renderImpl(tree, length, makeStaticMarkup), tree, makeStaticMarkup);
    },
  };
};

const render = (element, length, makeStaticMarkup) => {
  const tree = {
    element,
    root: !makeStaticMarkup,
  };
  return renderResultToGenerator(renderImpl(tree, length, makeStaticMarkup), tree, makeStaticMarkup);
};

// side effect: modifies tree in place.
const renderImpl = (tree, length, makeStaticMarkup, selectValues) => {
  // first, if tree.element is a component type (not a dom node), instantiate it
  // and call componentWillMount/render as needed. keep doing this until tree.element
  // is a dom node.
  const {element, context} = getNativeComponent(tree.element, tree.context || {});
  tree.element = element;
  tree.context = context;

  // when there's a false child, it's rendered as an empty string.
  if (element === false) {
    return {done:true, text:''};
  }

  // an empty (null) element translates to a comment node.
  if (element === null) {
    return {done: true, text: makeStaticMarkup ? '' : '<!-- react-empty -->'};
  }

  if (element === undefined) {
    throw new Error('A ReactElement resolved to undefined, which is not an allowed value.');
  }

  // now, we should have a dom element (element.type is a string)
  const {props, type: rawTag} = element;
  if (typeof rawTag !== 'string') {
    throw new Error(`A ReactElement had a type of '${rawTag}', when it should have been a tag name.`);
  }
  const tag = rawTag.toLowerCase();
  const attributes = (tree.root ? ' data-reactroot=""' : '') + propsToAttributes(props, tag, selectValues);
  if (voidTags[tag]
    && (props.children === '' || props.children === null || props.children === undefined)) {

    return {done: true, text: '<' + tag + attributes + '/>'};
  }
  const prefix = '<' + tag + attributes + '>';
  const suffix = '</' + tag + '>';

  if (!props) {
    return {done: true, text: prefix + suffix};
  }

  if (!tree.filter) {
    tree.filter = identityFn;

    if (newlineEatingTags[tag]) {
      var childTextProcessed = false;
      tree.filter = (text) => {
        if (childTextProcessed || text.length === 0) {
          return text;
        }
        childTextProcessed = true;
        if (text.charAt(0) === '\n') {
          text = '\n' + text;
        }
        return text;
      };
    }
  }

  if (tag === 'textarea' && (props.hasOwnProperty('value') || props.hasOwnProperty('defaultValue'))) {
    let textareaValue = props.hasOwnProperty('value') ? props.value : props.defaultValue;
    return {done: true, text: prefix + escapeTextContentForBrowser(tree.filter(textareaValue)) + suffix};
  }

  // if dangerouslySetInnerHTML is set, then that's the contents, and we ignore the children.
  if (props.dangerouslySetInnerHTML && props.dangerouslySetInnerHTML.__html) {
    return {done: true, text: prefix + tree.filter(props.dangerouslySetInnerHTML.__html) + suffix};
  }

  if (!props.children) {
    return {done: true, text: prefix + suffix};
  }

  // if there a single child that is a string or number, that's the text of the node.
  if (typeof props.children === 'string' || typeof props.children === 'number') {
    return {done: true, text: prefix + escapeTextContentForBrowser(tree.filter(props.children)) + suffix};
  }

  let text = '';
  if (!tree.hasOwnProperty('childIndex')) {
    text = prefix;

    const elementChildren = props.children.length ? props.children : [props.children];
    tree.children = [];
    addChildrenToArray(elementChildren, tree.children, tree.context);
  }

  for (tree.childIndex = tree.childIndex || 0; tree.childIndex < tree.children.length; tree.childIndex++) {
    if (text.length >= length) {
      return {done:false, text};
    }

    const child = tree.children[tree.childIndex];

    if (typeof child === 'string' || typeof child === 'number') {
      text += tree.filter(makeStaticMarkup ?
        escapeTextContentForBrowser(child) :
        '<!-- react-text -->' + child + '<!-- /react-text -->');
      continue;
    }

    if (!selectValues) {
      selectValues = getSelectValues(tag, props);
    }
    const childResults = renderImpl(child, length - text.length, makeStaticMarkup, selectValues);
    text += tree.filter(childResults.text);

    if (!childResults.done) {
      return {done: false, text};
    }
  }
  // now that we are done, free up the tree.
  tree.children = null;
  return {done: true, text: text + suffix};
};

const identityFn = (text) => text;

const getSelectValues = (tag, props) => {
  let result = null;
  if (tag === 'select' && (props.hasOwnProperty('value') || props.hasOwnProperty('defaultValue'))) {
    result = props.value || props.defaultValue;
    if (!Array.isArray(result)) {
      result = [result];
    }
  }
  return result;
};

const addChildrenToArray = (children, resultArray, context) => {
  for (var i = 0; i < children.length; i++) {
    const child = children[i];
    if (Array.isArray(child)) {
      addChildrenToArray(child, resultArray, context);
    } else if (child === null || child === false) {
      // null children do NOT result in an empty node; they just aren't rendered.
      continue;
    } else if (typeof child === 'object') {
      resultArray.push({element: child, context});
    } else {
      resultArray.push(child);
    }
  }
};

const getNativeComponent = (element, context) => {
  while (element && typeof element.type !== 'string'
    && typeof element.type !== 'number' && typeof element.type !== 'undefined') {

    let component = null;

    // which parts of the context should we expose to the component, if any?
    var contextToExpose = element.type.contextTypes ?
      filterContext(context, element.type.contextTypes) :
      EMPTY_OBJECT;

    // instantiate the component.
    if (shouldConstruct(element.type)) {
      component = new element.type(element.props, contextToExpose, updater);
      if (!component.render) {
        // TODO: get the component display name for the error.
        throw new Error('The component has no render method.');
      }
    } else if (typeof element.type === 'function') {
      // just call as function for stateless components or factory components.
      component = element.type(element.props, contextToExpose);
    }

    // if it has a componentWillMount method, we need to fire it now.
    if (component && component.componentWillMount) {
      component.componentWillMount();
    }

    // if setState or replaceState was called in componentWillMount, we need to
    // fire those calls now.
    updater.drainQueue();

    if (component && component.getChildContext) {
      if (!element.type.childContextTypes) {
        // TODO: how best to get the component display name here?
        throw new Error('childContextTypes must be defined in order to use getChildContext().');
      }
      var childContext = component.getChildContext();
      for (var childContextName in childContext) {
        if (!element.type.childContextTypes.hasOwnProperty(childContextName)) {
          // TODO: how best to get the component display name here?
          throw new Error(`getChildContext(): key "${childContextName}" is not defined in childContextTypes.`);
        }
      }
      context = Object.assign({}, context, childContext);
    }

    // finally, render the component.
    if (component && component.render) {
      element = component.render();
    } else {
      // stateless components just return an element, not a component with a render method.
      element = component;
    }
  }
  return {element, context};
};

const filterContext = (context, types) => {
  const result = {};
  for (var name in types) {
    result[name] = context[name];
  }
  return result;
};

const propsToAttributes = (props, tagName, selectValues) => {
  let result = '';

  // for select values
  if (tagName === 'option' && selectValues) {
    var optionValue = props.value;
    if (optionValue) {
      for (const selectValue of selectValues) {
        if (selectValue === optionValue) {
          result += ' selected';
          break;
        }
      }
    }
  }

  for (var name in props) {
    if (name === 'children'
      || name === 'dangerouslySetInnerHTML'
      || name === 'ref'
      || (tagName === 'textarea' && (name === 'value' || name === 'defaultValue'))
      || (tagName === 'select' && (name === 'value' || name === 'defaultValue'))
      || !props.hasOwnProperty(name)
      || registrationNameModules.hasOwnProperty(name)) {
      continue;
    }

    let value = props[name];

    if (name === 'style') {
      value = CSSPropertyOperations.createMarkupForStyles(value);
      if (value === null) {
        continue;
      }
    }
    if (name === 'defaultValue') {
      name = 'value';
    }
    if (name === 'defaultChecked') {
      name = 'checked';
    }

    var markup = DOMPropertyOperations.createMarkupForProperty(name, value);
    if (markup) {
      result += ' ' + markup;
    }
  }
  return result;
};

// copied and modified from ReactCompositeComponent.js
const shouldConstruct = (Component) => {
  return Component && Component.prototype && Component.prototype.isReactComponent;
};

const updater = {
  queue: [],

  isMounted: function(publicInstance) {
    return false;
  },
  // no-op
  enqueueCallback: function(publicInstance, callback) {
    if (callback) {
      this.queue.push(callback);
    }
  },

  enqueueForceUpdate: function(publicInstance) { },

  enqueueReplaceState: function(publicInstance, completeState) {
    this.queue.push(replaceState.bind(publicInstance, completeState));
  },

  enqueueSetState: function(publicInstance, partialState) {
    this.queue.push(setState.bind(publicInstance, partialState));
  },

  drainQueue: function() {
    for (const fn of this.queue) {
      fn();
    }
    this.queue = [];
  },
};

function setState(partialStateOrFn) {
  var partialState;

  if (typeof partialStateOrFn === 'function') {
    partialState = partialStateOrFn(this.state, this.props);
  } else {
    partialState = partialStateOrFn;
  }

  this.state = Object.assign({}, this.state, partialState);
}

function replaceState(partialStateOrFn) {
  if (typeof partialStateOrFn === 'function') {
    this.state = partialStateOrFn(this.state, this.props);
  } else {
    this.state = partialStateOrFn;
  }
}

module.exports = {
  render,
};
