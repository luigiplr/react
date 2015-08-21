/**
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule getSyncFunction
 * @typechecks static-only
 */

'use strict';

/**
 * Gives a dummy stream that can be used in async rendering calls to buffer the string.
 *
 * @return {object} Fake stream that can be use to buffer the stream.
 * @protected
 */


module.exports = function(wrappedFn) {
	return function() {
		
		var stream = {
			buffer:'',
			
			write: function(text) {
				this.buffer += text;
			},
		};

		var args = Array.prototype.slice.call(arguments);
		args[args.length] = stream;

		wrappedFn.apply(this, args);

		return stream.buffer;
	}
}