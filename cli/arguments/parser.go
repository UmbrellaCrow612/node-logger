package arguments

import (
	"flag"
	"os"

	"github.com/UmbrellaCrow612/node-logger/cli/t"
)

// Parses the args passed to the cli
func Parse() (*t.ArgOptions, error) {
	flagSet := flag.NewFlagSet("node-logger-go", flag.ExitOnError)

	logFileRetentionPeriodInDays := flagSet.Int("period", 30, "How long log files will be retained for a period of x number of days (defaults to 30 days)")
	logFilesBasePath := flagSet.String("base", "", "The base path where the logs will be wrote to pass it as a relative path (defaults to ./logs folder)")

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
	return nil
}
