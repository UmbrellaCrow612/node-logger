package commands

import (
	"os"
	"strings"

	"github.com/UmbrellaCrow612/node-logger/cli/console"
	"github.com/UmbrellaCrow612/node-logger/cli/logfiles"
	"github.com/UmbrellaCrow612/node-logger/cli/t"
)

// List of command and what sneed for them to run from the cli stdin
var CommandActions = []t.CommandAndAction{
	{
		PrefixMatcher: "exit",
		Action: func(options *t.ArgOptions, line string) error {
			console.Info("Exiting...")
			os.Exit(0)
			return nil
		},
	},
	{
		PrefixMatcher: "write:",
		Action: func(options *t.ArgOptions, line string) error {
			fp, err := logfiles.GetTodaysLogFile(options)
			if err != nil {
				console.ExitWithError(err)
			}

			file, err := os.OpenFile(fp, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
			if err != nil {
				console.ExitWithError(err)
			}
			defer file.Close()

			if _, err := file.WriteString(strings.TrimPrefix(line, "write:") + "\n"); err != nil {
				return err
			}

			console.Info("Writing:", line)
			return nil
		},
	},
}
