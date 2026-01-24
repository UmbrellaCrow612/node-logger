package arguments

import (
	"errors"
	"flag"
	"os"
	"path/filepath"

	"github.com/UmbrellaCrow612/node-logger/cli/t"
)

// Parses the args passed to the cli
func Parse() (*t.ArgOptions, error) {
	flagSet := flag.NewFlagSet("node-logger-go", flag.ExitOnError)

	logFileRetentionPeriodInDays := flagSet.Int("period", 30, "How long log files will be retained for a period of x number of days (defaults to 30 days)")
	logFilesBasePath := flagSet.String("base", "./logs", "The base path where the logs will be wrote to pass it as a relative path (defaults to ./logs folder)")

	err := flagSet.Parse(os.Args[1:])
	if err != nil {
		return nil, err
	}

	options := &t.ArgOptions{RetentionPeriod: logFileRetentionPeriodInDays, BasePath: logFilesBasePath}
	err = validateArgsOptions(options)
	if err != nil {
		return nil, err
	}

	return options, nil
}

// Validates the options passed ot the cli
func validateArgsOptions(options *t.ArgOptions) error {
	if *options.RetentionPeriod <= 0 {
		return errors.New("Retention period cannot be a below or euqal to 0")
	}

	if *options.BasePath == "" {
		return errors.New("Base path cannot be a empty string")
	}

	abs, err := filepath.Abs(*options.BasePath)
	if err != nil {
		return err
	}
	options.BasePath = &abs

	_, err = os.Stat(abs)
	if errors.Is(err, os.ErrNotExist) {
		err := os.MkdirAll(abs, os.ModeAppend)
		if err != nil {
			return err
		}
	} else {
		return err
	}

	info, err := os.Stat(abs)
	if err != nil {
		return err
	}

	if !info.IsDir() {
		return errors.New("base path cannot be a path to a file " + abs)
	}

	return nil
}
