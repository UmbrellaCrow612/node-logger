# Design

- Spawn logger class
- Interally it spawns `node_process.ts` file which handles the stdin log writing to a file using JSON rpc protocol, basically we write to this then it writes the stuff to a log file
in a serpate process to not block the main loop

Protocol for `node_process`

```bash
Content-Length: 1234/r/n/r/n
{JSON-String-Content}
```

Similar to LSP json rpc protocol but we have custom json mesages

# Requests 

These are the stuff sent to the stdin process 

```bash
{
    id: number
    method: string
    data: any
}
```


# Responses 

Every time a log is parsed we output a event for it 

```bash
{
    id:number
    method: string
    success: boolean
    error: any
    message: any
}
```

# Example requests


- log 

Write a log message to a log file 

- reload 

Trys to switch to a new day file file and write to that

- flush

Final exit style command that writes any remaning logs then exists the process


# Writing / testing 

Write the code for logger then generate the code with `npx tsc` 

Then run the testjs file which tests the javascript produced as you can't run ts `node .\test.js`