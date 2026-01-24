package logfiles

import (
	"errors"
	"os"
	"path/filepath"
	"time"

	"github.com/UmbrellaCrow612/node-logger/cli/t"
)

// Gets the path to todays log file if it does not exit it will make it in the base path
// In the format of YYYY-MM-DD for example c:/dev/logs/2026-01-13.log
func GetTodaysLogFile(options *t.ArgOptions) (string, error) {
	today := time.Now().Format("2006-01-02")
	fileName := today + ".log"
	filePath := filepath.Join(*options.BasePath, fileName)

	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", err
	}

	_, err := os.Stat(filePath)
	if errors.Is(err, os.ErrNotExist) {
		_, err := os.Create(filePath)
		if err != nil {
			return "", err
		}
	} else if err != nil {
		return "", err
	}

	info, err := os.Stat(filePath)
	if err != nil {
		return "", err
	}
	if info.IsDir() {
		return "", errors.New("created a folder instead of a file")
	}

	return filePath, nil
}
