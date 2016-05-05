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

var CSSPropertyOperations = require('CSSPropertyOperations');
var escapeTextContentForBrowser = require('escapeTextContentForBrowser');

// copied from ReactDOMComponent.js
// For HTML, certain tags should omit their close tag. We keep a whitelist for
// those special-case tags.
const selfClosingTags = {
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
  const element = tree.element = getNativeComponent(tree.element);

  // an empty (null) element translates to a comment node.
  if (element === null) {
    return {done: true, text: makeStaticMarkup ? '' : '<!-- react-empty -->'};
  }

  if (element === undefined) {
    throw new Error('A ReactElement resolved to undefined, which is not an allowed value.');
  }

  // now, we should have a dom element (element.type is a string)
  const {props, type: tag} = element;
  const attributes = (tree.root ? ' data-reactroot=""' : '') + propsToAttributes(props, tag, selectValues);
  if (selfClosingTags[tag]
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
    for (var i = 0; i < elementChildren.length; i++) {
      const child = elementChildren[i];
      if (typeof child === 'object' && child !== null) {
        tree.children.push({element: child});
      } else {
        tree.children.push(child);
      }
    }
  }

  for (tree.childIndex = tree.childIndex || 0; tree.childIndex < tree.children.length; tree.childIndex++) {
    if (text.length >= length) {
      return {done:false, text};
    }

    const child = tree.children[tree.childIndex];

    // null children do NOT result in an empty node; they just aren't rendered.
    if (child === null) {
      continue;
    }

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

const getNativeComponent = (element) => {
  while (element && typeof element.type !== 'string' && typeof element.type !== 'number' && typeof element.type !== 'undefined') {
    // TODO: what to do about context?
    const context = {};
    if (shouldConstruct(element.type)) {
      const component = new element.type(element.props, context, updater);
      if (component.componentWillMount) {
        component.componentWillMount();
      }
      updater.drainQueue();
      element = component.render();
    } else if (typeof element.type === 'function') {
      // just call as function for stateless components.
      element = element.type(element.props, context);
    }
  }
  return element;
};

const propNameMap = {
  className: 'class',
  defaultValue: 'value',
  defaultChecked: 'checked',
  htmlFor: 'for',
  xlinkActuate: 'xlink:actuate',
  xlinkArcrole: 'xlink:arcrole',
  xlinkHref: 'xlink:href',
  xlinkRole: 'xlink:role',
  xlinkShow: 'xlink:show',
  xlinkTitle: 'xlink:title',
  xlinkType: 'xlink:type',
  xmlBase: 'xml:base',
  xmlLang: 'xml:lang',
  xmlSpace: 'xml:space',
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
      // TODO: should this use the event registration object?
      || name.substring(0, 2) === 'on'
      || (tagName === 'textarea' && (name === 'value' || name === 'defaultValue'))
      || (tagName === 'select' && (name === 'value' || name === 'defaultValue'))
      || !props.hasOwnProperty(name)) {
      continue;
    }

    let value = props[name];
    if (value === false) {
      continue;
    }
    if (name === 'style') {
      value = CSSPropertyOperations.createMarkupForStyles(value);
      if (value === null) {
        continue;
      }
    }

    name = propNameMap[name] || name;
    if (value === true) {
      result += ' ' + name;
    } else {
      result += ' ' + name + '="' + escapeTextContentForBrowser(value) + '"';
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
