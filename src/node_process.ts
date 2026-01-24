/**
 * Self contained process that handles the protcol defined in the DESIGN.md file - basically handles writes to the stdin, process them, then write them to a log file
 * 
 * This is spawned as child process so write it like a script
 */

import type types = require("./types");
// import fs = require("fs");
import path = require("path");

/**
 * Holds args passed to the CLI
 */
const args = process.argv.slice(2);

/**
 * Options for how the process should act
 */
const options: types.NodeProcessOptions = {
  basePath: "",
  startedUtc: new Date().toUTCString(),
};

// set options from cli args passed

for (const arg of args) {
  if (arg.startsWith("--basePath=")) {
    options.basePath = path.resolve(arg.split("=")[1] ?? "");
  }
}

// validate options

if (!options.basePath || options.basePath == "") {
  console.error("Error: --basePath is required");
  console.error("Usage: --basePath=/some/path");
  process.exit(1);
}

console.log(options.basePath);

process.exit();
