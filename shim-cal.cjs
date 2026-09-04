const Module = require("node:module");
const path = require("node:path");
const _load = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === "server-only") return {};
  if (req.startsWith("@/")) return _load.call(this, path.join(__dirname, req.slice(2)), parent, isMain);
  return _load.call(this, req, parent, isMain);
};
