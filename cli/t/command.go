package t

// Action defines the function signature for command actions
type Action func(options *ArgOptions, line string) error

type CommandAndAction struct {
	// Whats need at the prefix of the message for it to match
	PrefixMatcher string

	// THe specific logic to run
	Action Action
}
