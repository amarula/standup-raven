package command

import (
	"sort"
	"testing"

	"github.com/stretchr/testify/assert"
)

func Test_validateCommandHelp(t *testing.T) {
	response, appErr := validateCommandHelp([]string{}, Context{})
	assert.Nil(t, response)
	assert.Nil(t, appErr)
}

func Test_executeCommandHelp(t *testing.T) {
	response, appErr := executeCommandHelp([]string{}, Context{})
	assert.NotNil(t, response)
	assert.Nil(t, appErr)
}

// The help text lists commands by hand because reading the registry from here
// would be an initialisation cycle, so this keeps the list in step with what is
// actually registered.
func TestCommandHelp_ListsEveryRegisteredCommand(t *testing.T) {
	defer TearDown()
	mockCommandAPI()

	response, appErr := executeCommandHelp([]string{}, Context{})
	assert.Nil(t, appErr)
	if !assert.NotNil(t, response) {
		return
	}

	for trigger := range commands {
		assert.Contains(t, response.Text, "* `"+trigger, "the help text does not mention the %s subcommand", trigger)
	}
}

// Mattermost refuses to start a plugin whose command autocomplete data does not
// satisfy its own rules, and it says so in the server log rather than at build
// time - so a rule like "a positional argument cannot be optional" reaches a
// running server before it reaches a test. This asks Mattermost's validator about
// every registered command.
func Test_CommandsHaveValidAutocompleteData(t *testing.T) {
	triggers := make([]string, 0, len(commands))
	for trigger := range commands {
		triggers = append(triggers, trigger)
	}
	sort.Strings(triggers)

	for _, trigger := range triggers {
		t.Run(trigger, func(t *testing.T) {
			assert.NoError(t, commands[trigger].AutocompleteData.IsValid(),
				"this command's autocomplete data would stop the plugin from starting")
		})
	}
}
