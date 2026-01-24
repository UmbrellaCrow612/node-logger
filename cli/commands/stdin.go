package commands

import (
	"os"
	"strings"
	"sync"

	"github.com/UmbrellaCrow612/node-logger/cli/console"
	"github.com/UmbrellaCrow612/node-logger/cli/logfiles"
	"github.com/UmbrellaCrow612/node-logger/cli/t"
)

var (
	logFilePath string
	logWriter   *os.File
	once        sync.Once
	onceMu      sync.Mutex
)

func initLogWriter(options *t.ArgOptions) {
	fp, err := logfiles.GetTodaysLogFile(options)
	if err != nil {
		console.ExitWithError(err)
	}

	file, err := os.OpenFile(fp, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		console.ExitWithError(err)
	}

	logFilePath = fp
	logWriter = file
}

func resetInit() {
	onceMu.Lock()
	defer onceMu.Unlock()
	once = sync.Once{}
}

var CommandActions = []t.CommandAndAction{
	{
		PrefixMatcher: "exit",
		Action: func(options *t.ArgOptions, line string) error {
			console.Info("Exiting...")

			if logWriter != nil {
				_ = logWriter.Close()
			}

			os.Exit(0)
			return nil
		},
	},
	{
		PrefixMatcher: "reload",
		Action: func(options *t.ArgOptions, line string) error {
			console.Info("Reloading log writer...")

			if logWriter != nil {
				_ = logWriter.Close()
				logWriter = nil
			}

			resetInit()
			return nil
		},
	},
	{
		PrefixMatcher: "write:",
		Action: func(options *t.ArgOptions, line string) error {
			once.Do(func() {
				initLogWriter(options)
			})

			if logWriter == nil {
				return nil
			}

			if _, err := logWriter.WriteString(strings.TrimPrefix(line, "write:") + "\n"); err != nil {
				return err
			}

			return nil
		},
	},
}
