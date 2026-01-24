package main

import (
	"bufio"
	"os"

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
	if err != nil {
		console.ExitWithError(err)
	}

	file, err := os.OpenFile(fp, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		console.ExitWithError(err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(os.Stdin)

	for scanner.Scan() {
		line := scanner.Text()

		if _, err := file.WriteString(line + "\n"); err != nil {
			console.ExitWithError(err)
		}
	}

	if err := scanner.Err(); err != nil {
		console.ExitWithError(err)
	}
}
