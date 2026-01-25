# Design

* Spawn a logger class
* Internally, it spawns the `node_process.ts` file, which handles stdin log writing to a file using the JSON-RPC protocol. Basically, we write to this process, and it writes the data to a log file in a separate process to avoid blocking the main loop.

Protocol for `node_process`

```bash
Content-Length: 1234\r\n\r\n
{JSON-String-Content}
```

Similar to the LSP JSON-RPC protocol, but we have custom JSON messages.

# Requests

These are the messages sent to the stdin process.

```bash
{
    id: number
    method: string
    data: any
}
```

# Responses

Every time a log is parsed, we output an event for it.

```bash
{
    id: number
    method: string
    success: boolean
    error: any
    message: any
}
```

# Example requests

* **log**

  Write a log message to a log file.

* **reload**

  Tries to switch to a new day file and write to that.

* **flush**

  Final exit-style command that writes any remaining logs, then exits the process.

# Writing / testing

Write the code for the logger, then generate the code with `npx tsc`.

Then run the `test.js` file, which tests the generated JavaScript, as you can't run TypeScript directly:

```bash
node .\test.js
```
