# Goal

Offer a fast logger that you can pass anything to and it will extract information from it for example `Error` and give actual good logs with all it's information and also
write them to a file, becuase sometimes devs miss stuff the error object has or over objects have and they just want to dump it to this logger, we just write what they give us
to a log file and console output with some colors, we are not trying to make a json log file or any of that we just wana `dump really fast` lol.

# Design

- `NodeLogger` - Public api to pass user logs through
- `node_process` - Spawned by `NodeLogger` to pass logs given to it via binary protocol, interally it will batch them then write them to a file

# Binary protocol spec

The spec we define for requests and responses.

```
[id: u32le: 4]
[method: u8: 1]
[level: u8: 1]
[timestamp: u32le: 4]
[payload_len: u32le: 4]
[payload: N bytes]
```

- 14 bytes

## Request protocol spec

This contains the spec for requests made to `node_process` writes raw binary data to it's stdin for it to interally digest and then perform actions

In JSON terms it will look like

```
{
  "id": 1,
  "method": "log",
  "level": "info",
  "payload": "Server started"
}
```

In binary terms it will look like:

```
// Frame length (14 header + 14 payload = 28)
1C 00 00 00

// Header
01 00 00 00     // id: 1 (u32le)
01              // method: log (0x01)
00              // level: info (0x00)
78 5C 8A 67     // timestamp: 1735689600 (example)
0E 00 00 00     // payload_len: 14

// Payload (UTF-8 bytes)
53 65 72 76 65 72 20 73 74 61 72 74 65 64   // "Server started"
```

| Value | Level   |
| ----- | ------- |
| 0x00  | `info`  |
| 0x01  | `warn`  |
| 0x02  | `error` |

| Value | Method   | Payload Meaning             |
| ----- | -------- | --------------------------- |
| 0x01  | `log`    | Log message string          |
| 0x02  | `flush`  | Empty (force write to disk) |
| 0x03  | `reload` | Empty (reopen log files)    |

## Response protocol spec

Response messages from the server for certain methods

```
[length: u32le][id: u32le][status: u8]
```

| Status | Meaning           |
| ------ | ----------------- |
| 0x00   | OK                |
| 0x01   | Invalid method    |
| 0x02   | Payload too large |
| 0x03   | Internal error    |

# Logger spec

- `info` - Log information
- `warn` - Log warning
- `error` - Log errors
- `flush` - Called at the end of the application
