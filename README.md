# Node logger

```bash
npm i node-logy
```

A lightweight logger for node js to print to console and also save them to log files auto rotating

![example](./public/node_logy.gif)

# Example


```ts
import { Logger } from "node-logy";

const logger = new Logger({ saveToLogFiles: true, basePath: "./logs" });

// Multiple arguments of any type
logger.info({ hello: "world" }, 123, "some more");
logger.warn("Heads up!");
logger.error(new Error("Something went wrong"));

// Ensure all logs are written before exit
await logger.flush();
await logger.shutdown();
```


console output:

```bash
[2026-02-07T17:43:06.654Z] [INFO]: { hello: world } 123 some more
[2026-02-07T17:43:06.656Z] [ERROR]: Error { name: Error, message: Yo, stack: Error: Yo
    at main (C:\dev\node-logger\tests\example.js:7:16)
    at Object.<anonymous> (C:\dev\node-logger\tests\example.js:14:1)
    at Module._compile (node:internal/modules/cjs/loader:1730:14)
    at Object..js (node:internal/modules/cjs/loader:1895:10)
    at Module.load (node:internal/modules/cjs/loader:1465:32)
    at Function._load (node:internal/modules/cjs/loader:1282:12)
    at TracingChannel.traceSync (node:diagnostics_channel:322:14)
    at wrapModuleLoad (node:internal/modules/cjs/loader:235:24)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:170:5)
    at node:internal/main/run_main_module:36:49 }
[2026-02-07T17:43:06.656Z] [WARN]: warning
```

log file:

```txt
[2026-02-07T17:43:06.654Z] [INFO]: { hello: world } 123 some more
[2026-02-07T17:43:06.656Z] [ERROR]: Error { name: Error, message: Yo, stack: Error: Yo
    at main (C:\dev\node-logger\tests\example.js:7:16)
    at Object.<anonymous> (C:\dev\node-logger\tests\example.js:14:1)
    at Module._compile (node:internal/modules/cjs/loader:1730:14)
    at Object..js (node:internal/modules/cjs/loader:1895:10)
    at Module.load (node:internal/modules/cjs/loader:1465:32)
    at Function._load (node:internal/modules/cjs/loader:1282:12)
    at TracingChannel.traceSync (node:diagnostics_channel:322:14)
    at wrapModuleLoad (node:internal/modules/cjs/loader:235:24)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:170:5)
    at node:internal/main/run_main_module:36:49 }
[2026-02-07T17:43:06.656Z] [WARN]: warning

```

# Performance 


```bash
=== Performance Test: 10,000 Log Lines ===

Total time (fire-and-forget): 32.82ms
Flush time: 8.496ms

=== Results ===
Fire-and-forget loop time: 31.91ms
Flush time:                8.49ms
Total end-to-end time:     40.90ms
Average time per log:      0.004ms
Throughput:                244496 logs/second
Memory used:               0.39 MB
Log file size:             721.57 KB

=== Test Complete ===
```