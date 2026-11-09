// Preloaded with --require by old-node.test.mjs: this Node acts like one without node:sqlite
// (older than 22.13), the way /usr/bin/node v18 fails to load it.
const Module = require('node:module');
const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'node:sqlite' || request === 'sqlite') {
    const error = new Error(`No such built-in module: ${request}`);
    error.code = 'ERR_UNKNOWN_BUILTIN_MODULE';
    throw error;
  }
  return load.call(this, request, ...rest);
};
