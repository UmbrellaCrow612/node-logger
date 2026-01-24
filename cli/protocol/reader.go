package protocol

import (
	"bufio"
	"fmt"
	"io"

	"github.com/UmbrellaCrow612/node-logger/cli/t"
)

func NewProtocolReader(r io.Reader) *t.ProtocolReader {
	return &t.ProtocolReader{
		Reader: bufio.NewReader(r),
	}
}

func DefaultHandler(msg *t.Message) error {
	fmt.Printf("Method: %s\n", msg.Method)
	fmt.Printf("Data: %s\n", msg.Data)
	fmt.Println("---")

	// Example: Route based on method
	switch msg.Method {
	case "ping":
		return nil
	default:
		return nil
	}
}
