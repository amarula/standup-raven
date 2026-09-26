package command

import (
	"fmt"
	"strings"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/standup-raven/standup-raven/server/config"
	"github.com/standup-raven/standup-raven/server/otime"
	"github.com/standup-raven/standup-raven/server/standup"
	"github.com/standup-raven/standup-raven/server/util"
)

const (
	// maxStandupLineLength keeps one entry short enough to stay readable in the
	// aggregated report, which posts every member's lines in a single message.
	maxStandupLineLength = 500

	propUpdateSection = "updateSection"
	propUpdateText    = "updateText"
)

func commandUpdate() *Config {
	return &Config{
		AutocompleteData: &model.AutocompleteData{
			Trigger:  "update",
			HelpText: "Add a line to one section of today's standup",
			RoleID:   model.SystemUserRoleId,
			Arguments: []*model.AutocompleteArg{
				{
					HelpText: "Section to add the line to.",
					Type:     model.AutocompleteArgTypeDynamicList,
					Required: true,

					// Mattermost's server fetches this while the command is
					// being typed, passing the channel, so what is offered is
					// this channel's own sections rather than a list to remember.
					Data: &model.AutocompleteDynamicListArg{FetchURL: config.URLPluginBase + "/sections"},
				},
				{
					HelpText: "What you want to record",
					Type:     model.AutocompleteArgTypeText,
					Required: true,
					Data:     &model.AutocompleteTextArg{Hint: "your update"},
				},
			},
		},
		ExtraHelpText: "* the line is added to today's standup, and anything already there is kept\n" +
			"* quote the section name if it contains spaces, for example\n" +
			"	`/standup update \"in progress\" fixing the flaky login test`",
		Validate: validateCommandUpdate,
		Execute:  executeCommandUpdate,
	}
}

func validateCommandUpdate(args []string, context Context) (*model.CommandResponse, *model.AppError) {
	standupConfig, err := standup.GetStandupConfig(context.CommandArgs.ChannelId)
	if err != nil {
		return util.SendEphemeralText("Couldn't fetch the standup configuration for this channel: " + err.Error())
	}
	if standupConfig == nil {
		return util.SendEphemeralText("Standup is not configured for this channel.")
	}

	example := "today"
	if len(standupConfig.Sections) > 0 {
		example = standupConfig.Sections[0]
	}

	if len(args) == 0 {
		// No section named: say which there are, since that is what someone
		// typing this for the first time is trying to find out. The command's
		// own argument list suggests these too, where the client shows it.
		return util.SendEphemeralText(fmt.Sprintf(
			"Which section? This channel's sections are: %s\n\nFor example: `/standup update \"%s\" reviewing the login fix`",
			strings.Join(standupConfig.Sections, ", "),
			example,
		))
	}

	if len(args) < 2 {
		return util.SendEphemeralText(fmt.Sprintf(
			"Nothing to add to %s. Usage: `/standup update <section> <what you want to record>`",
			args[0],
		))
	}

	section, remaining, matched := matchSection(standupConfig.Sections, args)
	if !matched {
		return util.SendEphemeralText(fmt.Sprintf(
			"Couldn't match a section. This channel's sections are: %s",
			strings.Join(standupConfig.Sections, ", "),
		))
	}

	line := strings.TrimSpace(strings.Join(remaining, " "))
	if line == "" {
		return util.SendEphemeralText("Nothing to add. Usage: `/standup update <section> <what you want to record>`")
	}
	if len(line) > maxStandupLineLength {
		return util.SendEphemeralText(fmt.Sprintf(
			"That line is %d characters long. Keep it under %d so the report stays readable.",
			len(line),
			maxStandupLineLength,
		))
	}

	// Resolved once here so that execution does not repeat the matching.
	context.Props[propUpdateSection] = section
	context.Props[propUpdateText] = line

	return nil, nil
}

func executeCommandUpdate(_ []string, context Context) (*model.CommandResponse, *model.AppError) {
	channelID := context.CommandArgs.ChannelId
	userID := context.CommandArgs.UserId

	section, ok := context.Props[propUpdateSection].(string)
	if !ok {
		return util.SendEphemeralText("Couldn't tell which section to update.")
	}
	line, ok := context.Props[propUpdateText].(string)
	if !ok {
		return util.SendEphemeralText("Couldn't tell what to add.")
	}

	standupConfig, err := standup.GetStandupConfig(channelID)
	if err != nil {
		return util.SendEphemeralText("Couldn't fetch the standup configuration for this channel: " + err.Error())
	}
	if standupConfig == nil {
		return util.SendEphemeralText("Standup is not configured for this channel.")
	}

	userStandup, err := standup.GetUserStandup(userID, channelID, otime.Now(standupConfig.Timezone))
	if err != nil {
		return util.SendEphemeralText("Couldn't fetch today's standup: " + err.Error())
	}
	if userStandup == nil {
		userStandup = &standup.UserStandup{}
	}
	if userStandup.Standup == nil {
		userStandup.Standup = map[string]*[]string{}
	}
	userStandup.UserID = userID
	userStandup.ChannelID = channelID

	lines := []string{}
	if existing, present := userStandup.Standup[section]; present && existing != nil {
		lines = append(lines, *existing...)
	}
	lines = append(lines, line)
	userStandup.Standup[section] = &lines

	// The same validation the modal's submissions go through, so the two paths
	// cannot drift apart.
	if err := userStandup.IsValid(); err != nil {
		return util.SendEphemeralText(err.Error())
	}
	if err := standup.SaveUserStandup(userStandup); err != nil {
		return util.SendEphemeralText("Couldn't save your standup: " + err.Error())
	}

	return util.SendEphemeralText(formatSectionLines(section, lines))
}

// matchSection works out which configured section a command's arguments name.
//
// Section names are free-form and may contain spaces, so the longest configured
// name matching the leading words wins ("in progress" over "in"), and at least
// one word has to be left over for the line itself.
func matchSection(sections []string, args []string) (string, []string, bool) {
	matched := ""
	matchedWords := 0

	for _, section := range sections {
		words := len(strings.Fields(section))
		if words == 0 || words >= len(args) || words <= matchedWords {
			continue
		}

		if strings.EqualFold(strings.Join(args[:words], " "), section) {
			matched = section
			matchedWords = words
		}
	}

	if matched == "" {
		return "", nil, false
	}

	return matched, args[matchedWords:], true
}

func formatSectionLines(section string, lines []string) string {
	if len(lines) == 0 {
		return fmt.Sprintf("There is nothing in *%s* yet.", section)
	}

	return fmt.Sprintf("Your *%s* now reads:\n1. %s", section, strings.Join(lines, "\n1. "))
}
