package commands

import (
	"fmt"
	"os"

	"github.com/UmbrellaCrow612/node-logger/cli/t"
)

// List of commands that can be written to the stdin of the praser to do specific stuff
var (
	Exit   = "exit"
	Reload = "reload"
)

var CommandActions = []t.CommandAndAction{
	{
		Command: Exit,
		Action: func(args ...string) error {
			fmt.Println("Exiting...")
			os.Exit(0)
			return nil
		},
	},
	{
		Command: Reload,
		Action: func(args ...string) error {
			fmt.Println("Reloading config...")
			// Add reload logic here
			return nil
		},
	},
}
