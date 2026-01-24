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
	wg       sync.WaitGroup
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

	// recreate channels on init
	logChan = make(chan string, 1000)
	stopChan = make(chan struct{})

	wg.Add(1)
	go backgroundWriter()
}

func backgroundWriter() {
	defer wg.Done()

	for {
		select {
		case msg := <-logChan:
			_, _ = logWriter.WriteString(msg + "\n")

		case <-stopChan:
			return
		}
	}
}

func resetInit() {
	onceMu.Lock()
	defer onceMu.Unlock()
	once = sync.Once{}
}

func enqueueLog(msg string) {
	if logChan == nil {
		return
	}

	logChan <- msg
}

func closeLogger() {
	if stopChan != nil {
		close(stopChan)
		stopChan = nil
	}

	wg.Wait()

	if logWriter != nil {
		_ = logWriter.Close()
		logWriter = nil
	}
}

// List of command the stdin process runs when a matching term is found for the prefix of the line
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
