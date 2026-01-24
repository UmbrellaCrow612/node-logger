package main

import (
	"bufio"
	"os"
	"strings"

	"github.com/UmbrellaCrow612/node-logger/cli/arguments"
	"github.com/UmbrellaCrow612/node-logger/cli/commands"
	"github.com/UmbrellaCrow612/node-logger/cli/console"
)

// Main entry point
func main() {
	options, err := arguments.Parse()
	if err != nil {
		console.ExitWithError(err)
	}

	scanner := bufio.NewScanner(os.Stdin)

	for scanner.Scan() {
		line := scanner.Text()

		for _, cmd := range commands.CommandActions {
			if strings.HasPrefix(line, cmd.PrefixMatcher) {
				err := cmd.Action(options, line)
				if err != nil {
					console.ExitWithError(err)
				}
			}
		}
	}

	if err := scanner.Err(); err != nil {
		console.ExitWithError(err)
	}
}
