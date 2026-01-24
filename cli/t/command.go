package t

// Action defines the function signature for command actions
type Action func(args ...string) error

type CommandAndAction struct {
	Command string
	Action  Action
}
