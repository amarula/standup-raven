package command

import (
	"fmt"
	"strconv"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/standup-raven/standup-raven/server/standup"
	"github.com/standup-raven/standup-raven/server/standup/week"
	"github.com/standup-raven/standup-raven/server/util"
)

const propWeekOffset = "weekOffset"

func commandWeek() *Config {
	return &Config{
		AutocompleteData: &model.AutocompleteData{
			Trigger:  "week",
			HelpText: "Show this week's standups grouped by the issues they name",
			RoleID:   model.SystemUserRoleId,
			Arguments: []*model.AutocompleteArg{
				{
					HelpText: "How many weeks back to look. Leave it out for this week.",
					Type:     model.AutocompleteArgTypeText,
					Required: false,
					Data: &model.AutocompleteTextArg{
						Hint:    "[weeks]",
						Pattern: "\\d",
					},
				},
			},
		},
		ExtraHelpText: "The week's standups as Markdown, grouped by issue, to copy from when logging the work against tickets. Only you see the reply. An entry naming several issues is listed under each; work that named no issue is grouped at the end.",
		Validate:      validateCommandWeek,
		Execute:       executeCommandWeek,
	}
}

func validateCommandWeek(args []string, context Context) (*model.CommandResponse, *model.AppError) {
	standupConfig, err := standup.GetStandupConfig(context.CommandArgs.ChannelId)
	if err != nil {
		return util.SendEphemeralText("Error getting standup config of the channel")
	}

	if standupConfig == nil {
		return util.SendEphemeralText("Standup not configured for the channel")
	}

	weeksAgo := 0

	if len(args) > 0 && args[0] != "" {
		weeks, parseErr := strconv.Atoi(args[0])
		if parseErr != nil || weeks < 0 || weeks > week.MaxWeeksBack() {
			return util.SendEphemeralText(fmt.Sprintf(
				"Please say how many weeks back to look, from 0 to %d. For example: /standup week 1",
				week.MaxWeeksBack(),
			))
		}

		weeksAgo = weeks
	}

	context.Props[propWeekOffset] = weeksAgo

	return nil, nil
}

func executeCommandWeek(args []string, context Context) (*model.CommandResponse, *model.AppError) {
	weeksAgo, _ := context.Props[propWeekOffset].(int)

	parts, err := week.Generate(context.CommandArgs.ChannelId, weeksAgo)
	if err != nil {
		return util.SendEphemeralText("Error building the week report: " + err.Error())
	}

	if len(parts) == 0 {
		return util.SendEphemeralText("There is nothing to show for that week.")
	}

	// A long week is sent as several replies rather than cut short: a week with a
	// day missing from it is a week someone logs wrongly.
	response := &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         parts[0],
	}

	for _, part := range parts[1:] {
		response.ExtraResponses = append(response.ExtraResponses, &model.CommandResponse{
			ResponseType: model.CommandResponseTypeEphemeral,
			Text:         part,
		})
	}

	return response, nil
}
