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

	logChan  chan string
	stopChan chan struct{}
)

// initLogWriter opens the log file and starts the background writer goroutine
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

	// recreate channels on init
	logChan = make(chan string, 1000)
	stopChan = make(chan struct{})

	go backgroundWriter()
}

// backgroundWriter consumes messages from the channel and writes to disk
func backgroundWriter() {
	for {
		select {
		case msg := <-logChan:
			_, _ = logWriter.WriteString(msg + "\n")
		case <-stopChan:
			return
		}
	}
}

// resetInit resets the once guard so initLogWriter can be called again
func resetInit() {
	onceMu.Lock()
	defer onceMu.Unlock()
	once = sync.Once{}
}

// enqueueLog sends message to the channel
func enqueueLog(msg string) {
	logChan <- msg
}

// closeLogger closes writer and stops goroutine
func closeLogger() {
	if stopChan != nil {
		close(stopChan)
		stopChan = nil
	}

	if logWriter != nil {
		_ = logWriter.Close()
		logWriter = nil
	}
}

var CommandActions = []t.CommandAndAction{
	{
		PrefixMatcher: "exit",
		Action: func(options *t.ArgOptions, line string) error {
			console.Info("Exiting...")
			closeLogger()
			os.Exit(0)
			return nil
		},
	},
	{
		PrefixMatcher: "reload",
		Action: func(options *t.ArgOptions, line string) error {
			console.Info("Reloading logger...")
			closeLogger()
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

			enqueueLog(strings.TrimPrefix(line, "write:"))
			return nil
		},
	},
}
