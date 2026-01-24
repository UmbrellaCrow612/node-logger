package main

import (
	"fmt"
	"os"

	"github.com/UmbrellaCrow612/node-logger/cli/arguments"
	"github.com/UmbrellaCrow612/node-logger/cli/protocol"
)

// Main entry point
func main() {
	_, err := arguments.Parse()
	if err != nil {
		fmt.Println(err)
		os.Exit(1)
	}

	reader := protocol.NewProtocolReader(os.Stdin)

	if err := reader.ProcessMessages(protocol.DefaultHandler); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}
