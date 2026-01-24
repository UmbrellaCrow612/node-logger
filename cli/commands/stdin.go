package commands

import (
	"bufio"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/UmbrellaCrow612/node-logger/cli/console"
	"github.com/UmbrellaCrow612/node-logger/cli/logfiles"
	"github.com/UmbrellaCrow612/node-logger/cli/t"
)

// LogWriter handles efficient batched writing to log files
type LogWriter struct {
	mu      sync.Mutex
	file    *os.File
	writer  *bufio.Writer
	buffer  []string
	maxSize int
	ticker  *time.Ticker
	done    chan bool
}

var logWriter *LogWriter

// InitLogWriter sets up the log writer with buffering
func InitLogWriter(filepath string, bufferSize int, flushInterval time.Duration) error {
	file, err := os.OpenFile(filepath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("failed to open log file: %w", err)
	}

	logWriter = &LogWriter{
		file:    file,
		writer:  bufio.NewWriterSize(file, 64*1024), // 64KB buffer
		buffer:  make([]string, 0, bufferSize),
		maxSize: bufferSize,
		ticker:  time.NewTicker(flushInterval),
		done:    make(chan bool),
	}

	// Start periodic flush goroutine
	go logWriter.periodicFlush()

	return nil
}

// Add adds a log entry to the buffer
func (lw *LogWriter) Add(content string) error {
	lw.mu.Lock()
	defer lw.mu.Unlock()

	lw.buffer = append(lw.buffer, content)

	// Flush if buffer is full
	if len(lw.buffer) >= lw.maxSize {
		return lw.flushLocked()
	}

	return nil
}

// flushLocked writes buffered entries to disk (must be called with lock held)
func (lw *LogWriter) flushLocked() error {
	if len(lw.buffer) == 0 {
		return nil
	}

	for _, entry := range lw.buffer {
		if _, err := lw.writer.WriteString(entry + "\n"); err != nil {
			return fmt.Errorf("write error: %w", err)
		}
	}

	if err := lw.writer.Flush(); err != nil {
		return fmt.Errorf("flush error: %w", err)
	}

	// Clear buffer
	lw.buffer = lw.buffer[:0]
	return nil
}

// Flush writes all buffered entries to disk
func (lw *LogWriter) Flush() error {
	lw.mu.Lock()
	defer lw.mu.Unlock()
	return lw.flushLocked()
}

// periodicFlush runs in a goroutine to flush at intervals
func (lw *LogWriter) periodicFlush() {
	for {
		select {
		case <-lw.ticker.C:
			if err := lw.Flush(); err != nil {
				console.Error("Periodic flush error: " + err.Error())
			}
		case <-lw.done:
			return
		}
	}
}

// Close flushes remaining data and closes the file
func (lw *LogWriter) Close() error {
	lw.ticker.Stop()
	lw.done <- true

	lw.mu.Lock()
	defer lw.mu.Unlock()

	if err := lw.flushLocked(); err != nil {
		return err
	}

	return lw.file.Close()
}

// List of commands
var CommandActions = []t.CommandAndAction{
	{
		PrefixMatcher: "exit",
		Action: func(options *t.ArgOptions, line string) error {
			console.Info("Exiting...")
			if logWriter != nil {
				logWriter.Close()
			}
			os.Exit(0)
			return nil
		},
	},
	{
		PrefixMatcher: "reload",
		Action: func(options *t.ArgOptions, line string) error {
			console.Info("Reloading logger...")

			if logWriter != nil {
				if err := logWriter.Close(); err != nil {
					return fmt.Errorf("failed to close existing log writer: %w", err)
				}
			}

			fp, err := logfiles.GetTodaysLogFile(options)
			if err != nil {
				return fmt.Errorf("failed to get log file path: %w", err)
			}

			if err := InitLogWriter(fp, 100, 5*time.Second); err != nil {
				return fmt.Errorf("failed to reinitialize log writer: %w", err)
			}

			console.Info(fmt.Sprintf("Logger reloaded with file: %s", fp))
			return nil
		},
	},
	{
		PrefixMatcher: "write:",
		Action: func(options *t.ArgOptions, line string) error {
			content := strings.TrimSpace(strings.TrimPrefix(line, "write:"))

			if logWriter == nil {
				fp, err := logfiles.GetTodaysLogFile(options)
				if err != nil {
					return err
				}
				if err := InitLogWriter(fp, 100, 5*time.Second); err != nil {
					return err
				}
			}

			return logWriter.Add(content)
		},
	},
	{
		PrefixMatcher: "flush",
		Action: func(options *t.ArgOptions, line string) error {
			if logWriter != nil {
				if err := logWriter.Flush(); err != nil {
					return err
				}
				console.Info("Log flushed to disk")
			} else {
				console.Warn("No log writer to flush")
			}
			return nil
		},
	},
}
