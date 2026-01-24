package main

import (
	"github.com/UmbrellaCrow612/node-logger/cli/arguments"
	"github.com/UmbrellaCrow612/node-logger/cli/console"
	"github.com/UmbrellaCrow612/node-logger/cli/logfiles"
)

// Main entry point
func main() {
	options, err := arguments.Parse()
	if err != nil {
		console.ExitWithError(err)
	}

	fp, err := logfiles.GetTodaysLogFile(options)
	console.Info(fp)
}
