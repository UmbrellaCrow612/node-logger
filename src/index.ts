import nodeFs = require("node:fs");
import path = require("node:path");

/**
 * List of options you can pass to change the logger behaviour
 */
type NodeLoggerOptions = {
  /**
   * Indicates if output produced specifically to the stdout console should be colored (defaults to `true`)
   */
  useColoredOutput: boolean;

  /**
   * Indicates if stdout console output produced by this logger should be saved to log files (defaults to `true`)
   */
  saveToLogFile: boolean;

  /**
   * The base path / path to the folder to save the log outputs to (defaults to `./logs`) then is converted to a absoulte path interally
   */
  logFilesBasePath: string;

  /**
   * Indicates if it should stack traces i.e the location of where the log was made on what line, useful to quickly navigate to the location using for example
   * text editors like vs code (defaults to `true`)
   */
  showStackTraces: boolean;

  /**
   * Indicates how long old log files should be kept (defaults to `30` days)
   */
  logFileRetentionPeriodInDays: number;

  /**
   * Indicates if it should add the time of when the log was made for a given log item (defaults to `true`)
   */
  showLogTime: boolean;
};

/**
 * Represents a logger used to log to node's stdout console and also save logs to log files
 */
class NodeLogger {
  /**
   * Holds the options passed to the logger
   */
  private _options: NodeLoggerOptions;

  /**
   * Indicates if all options passed on initialization are valid, if it not then any operation performed outside will fail
   */
  private _isValid = false;

  /**
   * Pass addtional options on initialization to change the loggers behaviour
   * @param options Change the behaviour of the logger
   */
  constructor(
    options: NodeLoggerOptions = {
      useColoredOutput: true,
      logFilesBasePath: "./logs",
      saveToLogFile: true,
      logFileRetentionPeriodInDays: 30,
      showStackTraces: true,
      showLogTime: true,
    },
  ) {
    this._options = options;

    if (typeof this._options !== "object") {
      throw new TypeError(
        "Options passed cannot be null or undefined it must be a object",
      );
    }

    if (
      typeof this._options.logFileRetentionPeriodInDays !== "number" ||
      (typeof this._options.logFileRetentionPeriodInDays === "number" &&
        this._options.logFileRetentionPeriodInDays <= 0)
    ) {
      throw new TypeError(
        "logFileRetentionPeriodInDays must be a number and greater than 0",
      );
    }

    if (
      typeof this._options.logFilesBasePath !== "string" ||
      (typeof this._options.logFilesBasePath === "string" &&
        this._options.logFilesBasePath.trim() === "")
    ) {
      throw new TypeError("logFilesBasePath must be a non empty string");
    }

    if (typeof this._options.saveToLogFile !== "boolean") {
      throw new TypeError("saveToLogFile must be a boolean");
    }

    if (typeof this._options.showLogTime !== "boolean") {
      throw new TypeError("showLogTime must be a boolean");
    }

    if (typeof this._options.showStackTraces !== "boolean") {
      throw new TypeError("showStackTraces must be a boolean");
    }

    if (typeof this._options.useColoredOutput !== "boolean") {
      throw new TypeError("useColoredOutput must be a boolean");
    }

    this._options.logFilesBasePath = path.resolve(
      this._options.logFilesBasePath,
    );

    this._isValid = true;
    this.init()
  }

  /**
   * Runs initialization such as making log folders on start and other needed functions
   */
  private init() {
    if (!this._isValid) throw new Error("Invalid state of logger");

    // create the base path
    // clean up any old logs files
  }
}

export = {
  NodeLogger,
};
