# Node logger

```bash
npm i node-logger
```

A lightweight logger for node js to print to console and also save them to log files auto rotating


# Example


```ts
let logger = new NodeLogger();

logger.info("Hello world", "more", 123);
logger.warn("Hello world");
logger.error(new Error("Yo"), "some other");

process.on("exit", () => {
  logger.flushLogsSync();
  console.log("finished");
});

```


```bash
[Fri, 23 Jan 2026 14:57:23 GMT] [INFO] Hello world more 123
[Fri, 23 Jan 2026 14:57:23 GMT] [WARN] Hello world
[Fri, 23 Jan 2026 14:57:23 GMT] [ERROR] Name: Error
Message: Yo
Stack: Error: Yo
    at Object.<anonymous> (C:\dev\node-logger\src\test.ts:7:14)
    at Module._compile (node:internal/modules/cjs/loader:1730:14)
    at Module.m._compile (C:\dev\node-logger\node_modules\ts-node\src\index.ts:1618:23)
    at node:internal/modules/cjs/loader:1895:10
    at Object.require.extensions.<computed> [as .ts] (C:\dev\node-logger\node_modules\ts-node\src\index.ts:1621:12)
    at Module.load (node:internal/modules/cjs/loader:1465:32)
    at Function._load (node:internal/modules/cjs/loader:1282:12)
    at TracingChannel.traceSync (node:diagnostics_channel:322:14)
    at wrapModuleLoad (node:internal/modules/cjs/loader:235:24)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:170:5) some other
finished
```

log file:

```log
Fri, 23 Jan 2026 14:54:17 GMT INFO Hello world more 123
Fri, 23 Jan 2026 14:54:17 GMT WARN Hello world
Fri, 23 Jan 2026 14:54:17 GMT ERROR Name: Error
Message: Yo
Stack: Error: Yo
    at Object.<anonymous> (C:\dev\node-logger\src\test.ts:7:14)
    at Module._compile (node:internal/modules/cjs/loader:1730:14)
    at Module.m._compile (C:\dev\node-logger\node_modules\ts-node\src\index.ts:1618:23)
    at node:internal/modules/cjs/loader:1895:10
    at Object.require.extensions.<computed> [as .ts] (C:\dev\node-logger\node_modules\ts-node\src\index.ts:1621:12)
    at Module.load (node:internal/modules/cjs/loader:1465:32)
    at Function._load (node:internal/modules/cjs/loader:1282:12)
    at TracingChannel.traceSync (node:diagnostics_channel:322:14)
    at wrapModuleLoad (node:internal/modules/cjs/loader:235:24)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:170:5) some other
```
