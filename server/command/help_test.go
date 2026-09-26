package command

import (
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
