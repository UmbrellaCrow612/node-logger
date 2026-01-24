package main

import (
	"github.com/UmbrellaCrow612/node-logger/cli/arguments"
	"github.com/UmbrellaCrow612/node-logger/cli/console"
)

// Main entry point
func main() {
	_, err := arguments.Parse()
	if err != nil {
		console.ExitWithError(err)
	}
}
