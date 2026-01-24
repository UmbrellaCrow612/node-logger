/**
 * Self contained process that handles the protcol defined in the DESIGN.md file - basically handles writes to the stdin, process them, then write them to a log file
 *
 * This is spawned as child process so write it like a script
 */

import type types = require("./types");
import fs = require("fs");
import path = require("path");

/**
 * Gets todays lof file path in format YYYY-MM-DD and returns a string for example `c:/dev/logs/2026-01.23.log`
 */
function getTodaysLogFile(options: types.NodeProcessOptions): string {
  const today = new Date().toISOString().split("T")[0];
  const filePath = path.join(options.basePath, `${today}.log`);
  return filePath;
}

async function main() {
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

  console.log("Base path: " + options.basePath);

  try {
    if (!fs.existsSync(options.basePath)) {
      fs.mkdirSync(options.basePath);
      console.log("base dir " + options.basePath + " created");
    }
  } catch (error) {
    console.error("Failed to make base dir");
    console.error(error);
    process.exit(1);
  }

  console.log(getTodaysLogFile(options))

  /**
   * Holds the stdin buffer i.e content written to the process
   */
  // const buffer = Buffer.alloc(0)

  process.exit();
}

main();
