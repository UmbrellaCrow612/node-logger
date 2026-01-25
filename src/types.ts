/**
 * List of methods / actions that the node_process can perform
 */
export type RequestMethod = "log" | "reload" | "flush";

/**
 * Represents the shape of data sent to the node_process
 */
export type NodeProcessRequest = {
  id: number;
  method: RequestMethod;
  data: any;
};

/**
 * Response shape
 */
export type NodeProcessResponse = {
  id: number;
  method: RequestMethod;
  success: boolean;
  error: any;
  message: any;
};

/**
 * Options for node_process mapped from CLI args
 */
export type NodeProcessOptions = {
  /**
   * The base path that points to the directory we will write the log files to
   */
  basePath: string;

  /**
   * The time the process started as a string in UTC time
   */
  startedUtc: string;
};

/**
 * Indicates which level of log should be used
 */
export type LogLevel = "WARN" | "INFO" | "ERROR";

/**
 * List of options you can pass to change the logger behaviour
 */
export type NodeLoggerOptions = {
  /**
   * Indicates if stdout console output produced by this logger should be saved to log files (defaults to `true`)
   */
  saveToLogFile: boolean;

  /**
   * The base path / path to the folder to save the log outputs to (defaults to `./logs`) then is converted to an absolute path internally
   */
  logFilesBasePath: string;

  /**
   * Indicates if it should add the time of when the log was made for a given log item (defaults to `true`)
   */
  showLogTime: boolean;

  /**
   * Indicates if it should use colored console outputs (defaults to `true`)
   */
  useAnsiColors: boolean;

  /**
   * Mapped type: Each LogLevel must correspond to a string color value
   * 
   * (default)
   * ```js
   *   colorMap: {
        INFO: "\x1b[32m", // Green
        WARN: "\x1b[33m", // Yellow
        ERROR: "\x1b[31m", // Red
  },
   * ```
   */
  colorMap: {
    [key in LogLevel]: string;
  };
};
