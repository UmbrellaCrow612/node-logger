package t

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"
)

// Represents a message sent to the stdin
type Message struct {
	// The specific method
	Method string `json:"method"`

	// The shape of the data
	Data string `json:"data"`
}

type MessageHandler func(*Message) error

// Used to read bytes
type ProtocolReader struct {
	Reader *bufio.Reader
}

func (pr *ProtocolReader) ProcessMessages(handler MessageHandler) error {
	for {
		msg, err := pr.ReadMessage()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}

		if err := handler(msg); err != nil {
			return fmt.Errorf("handler error: %w", err)
		}
	}
}

// ReadMessage reads a single message from the stream
func (pr *ProtocolReader) ReadMessage() (*Message, error) {
	// Read the Content-length header
	headerLine, err := pr.Reader.ReadString('\n')
	if err != nil {
		return nil, err
	}

	// Parse Content-length header
	headerLine = strings.TrimSpace(headerLine)
	if !strings.HasPrefix(headerLine, "Content-length:") {
		return nil, fmt.Errorf("invalid header: expected 'Content-length:', got '%s'", headerLine)
	}

	lengthStr := strings.TrimPrefix(headerLine, "Content-length:")
	lengthStr = strings.TrimSpace(lengthStr)
	contentLength, err := strconv.Atoi(lengthStr)
	if err != nil {
		return nil, fmt.Errorf("invalid content length: %w", err)
	}

	// Read exactly contentLength bytes
	content := make([]byte, contentLength)
	_, err = io.ReadFull(pr.Reader, content)
	if err != nil {
		return nil, fmt.Errorf("failed to read content: %w", err)
	}

	// Read the trailing newline
	trailingByte, err := pr.Reader.ReadByte()
	if err != nil && err != io.EOF {
		return nil, fmt.Errorf("failed to read trailing newline: %w", err)
	}
	if trailingByte != '\n' && err != io.EOF {
		return nil, fmt.Errorf("expected trailing newline, got byte: %v", trailingByte)
	}

	// Parse JSON
	var msg Message
	if err := json.Unmarshal(content, &msg); err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %w", err)
	}

	return &msg, nil
}
