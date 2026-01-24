package commands

import (
	"os"
	"strings"

	"github.com/UmbrellaCrow612/node-logger/cli/logfiles"
	"github.com/UmbrellaCrow612/node-logger/cli/t"
)

// List of commands
var CommandActions = []t.CommandAndAction{
	{
		PrefixMatcher: "exit",
		Action: func(options *t.ArgOptions, line string) error {
			os.Exit(0)
			return nil
		},
	},
	{
		PrefixMatcher: "write:",
		Action: func(options *t.ArgOptions, line string) error {
			content := strings.TrimSpace(strings.TrimPrefix(line, "write:"))
			fp, err := logfiles.GetTodaysLogFile(options)
			if err != nil {
				return err
			}

			file, err := os.OpenFile(fp, os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0600)
			if err != nil {
				return err
			}
			defer file.Close()

			if _, err = file.WriteString(content + "\n"); err != nil {
				return err
			}
			return nil
		},
	},
}
