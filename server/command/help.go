package command

import (
	"github.com/mattermost/mattermost/server/public/model"
)

func commandHelp() *Config {
	return &Config{
		AutocompleteData: &model.AutocompleteData{
			Trigger:  "help",
			HelpText: "Display Standup Raven help text.", // TODO prepare this help text
			RoleID:   model.SystemUserRoleId,
		},
		Validate: validateCommandHelp,
		Execute:  executeCommandHelp,
	}
}

func validateCommandHelp(args []string, context Context) (*model.CommandResponse, *model.AppError) {
	return nil, nil
}

func executeCommandHelp(args []string, context Context) (*model.CommandResponse, *model.AppError) {
	// This list cannot be read from the command registry: the registry's own
	// initialisation refers to this function, so reading it here is an
	// initialisation cycle. TestCommandHelp_ListsEveryRegisteredCommand keeps
	// the two in step instead.
	helpText := generateHelpText([]*Config{
		commandConfig(),
		commandAddMembers(),
		commandRemoveMembers(),
		commandStandup(),
		commandUpdate(),
		commandHelp(),
	})

	return &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         helpText,
	}, nil
}

func generateHelpText(commands []*Config) string {
	text := "### Standup Raven\n" +
		"A Mattermost plugin for communicating daily standups across teams\n\n" +
		"Follow the user guide [here](https://github.com/standup-raven/standup-raven/blob/master/docs/user_guide.md) to get started.\n\n\n" +
		"**Slash Command Help**\n\n"

	for _, command := range commands {
		text += command.GetHelpText() + "\n"
	}

	return text
}
