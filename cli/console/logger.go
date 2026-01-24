package console

import (
	"fmt"
	"os"
	"time"
)

// ANSI color codes
const (
	colorReset  = "\033[0m"
	colorRed    = "\033[31m"
	colorYellow = "\033[33m"
	colorBlue   = "\033[34m"
)

// Info prints an info message to the console (blue)
func Info(message string, args ...any) {
	printWithColor("INFO", colorBlue, message, args...)
}

// Warn prints a warning message to the console (yellow)
func Warn(message string, args ...any) {
	printWithColor("WARN", colorYellow, message, args...)
}

// Error prints an error message to the console (red)
func Error(message string, args ...any) {
	printWithColor("ERROR", colorRed, message, args...)
}

// ExitWithError prints an error and exits the program
func ExitWithError(err error) {
	if err == nil {
		return
	}

	Error(err.Error())
	os.Exit(1)
}

// Shared formatter
func printWithColor(level, color, message string, args ...any) {
	if len(args) > 0 {
		message = fmt.Sprintf(message, args...)
	}

	timestamp := time.Now().Format("2006-01-02 15:04:05")

	fmt.Printf(
		"%s[%s] [%s]%s %s\n",
		color,
		timestamp,
		level,
		colorReset,
		message,
	)
}
