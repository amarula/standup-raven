package command

import (
	"strings"

	"github.com/thoas/go-funk"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/pkg/errors"

	"github.com/standup-raven/standup-raven/server/config"
	"github.com/standup-raven/standup-raven/server/standup"
	"github.com/standup-raven/standup-raven/server/util"
)

func commandRemoveMembers() *Config {
	return &Config{
		AutocompleteData: &model.AutocompleteData{
			Trigger: "removemembers",
			Hint:    "[username 1] [username 2] [username 3]...",
			HelpText: "Removes specified members from the channel's standup. " +
				"Members are NOT removed from the channel automatically.",
			RoleID: model.SystemUserRoleId,
			Arguments: []*model.AutocompleteArg{
				{
					Type:     model.AutocompleteArgTypeText,
					Required: true,
					HelpText: "Use @ mentions to quickly refer to a user. For example `@johndoe`",
					Data: &model.AutocompleteTextArg{
						Hint:    "Usernames",
						Pattern: ".+",
					},
				},
			},
		},
		ExtraHelpText: "* doesn't remove the users from the channel\n" +
			"	* usernames can be specified as @ mentions",
		Validate: validateRemoveMembers,
		Execute:  executeRemoveMembers,
	}
}

func validateRemoveMembers(args []string, context Context) (*model.CommandResponse, *model.AppError) {
	userRoles, appErr := util.GetUserRoles(context.CommandArgs.UserId, context.CommandArgs.ChannelId)
	if appErr != nil {
		return nil, appErr
	}

	if funk.Contains(userRoles, model.SystemGuestRoleId) {
		return util.SendEphemeralText("Guest users are not allowed to perform this operation.")
	}

	// we need at least one member
	if len(args) < 1 {
		return util.SendEphemeralText("Please specify at least one user to remove")
	}

	// removing @ from usernames if they were specified using mentions.
	// We do allow it. Pretty cool!
	usernamesNotFound := []string{}
	userIDs := []string{}
	usernamesByUserID := map[string]string{}

	for _, username := range args {
		usernameToUse := strings.TrimPrefix(username, "@")
		user, err := config.Mattermost.GetUserByUsername(usernameToUse)
		if err == nil {
			userIDs = append(userIDs, user.Id)
			usernamesByUserID[user.Id] = user.Username

			continue
		}

		// A member whose account no longer exists cannot be looked up by
		// username, and that username may since belong to somebody else, so
		// accept their user ID when it names a member of this standup.
		if memberID := memberIDInStandup(usernameToUse, context.CommandArgs.ChannelId); memberID != "" {
			userIDs = append(userIDs, memberID)
			usernamesByUserID[memberID] = memberID

			continue
		}

		usernamesNotFound = append(usernamesNotFound, usernameToUse)
	}

	// saving formatted usernames to context for later use
	context.Props["usernamesNotFound"] = usernamesNotFound
	context.Props["userIDs"] = userIDs
	context.Props["usernamesByUserID"] = usernamesByUserID
	return nil, nil
}

func executeRemoveMembers(args []string, context Context) (*model.CommandResponse, *model.AppError) {
	userIDs := context.Props["userIDs"].([]string)
	userIDsNotInStandup, removedUserIDs, err := removeMembersFromStandup(userIDs, context.CommandArgs.ChannelId)
	if err != nil {
		return util.SendEphemeralText("An error occurred while removing members from standup")
	}

	usernamesByUserID := context.Props["usernamesByUserID"].(map[string]string)

	removedUsernames := make([]string, len(removedUserIDs))
	for i, userID := range removedUserIDs {
		removedUsernames[i] = usernamesByUserID[userID]
	}

	notInStandupUsernames := make([]string, len(userIDsNotInStandup))
	for i, userID := range userIDsNotInStandup {
		notInStandupUsernames[i] = usernamesByUserID[userID]
	}

	text := ""

	if len(removedUserIDs) > 0 {
		text += "Removed users from standup: " + strings.Join(removedUsernames, ", ")
	}

	if len(userIDsNotInStandup) > 0 {
		text += "\nUsers not in standup: " + strings.Join(notInStandupUsernames, ", ")
	}

	if len(context.Props["usernamesNotFound"].([]string)) > 0 {
		text += "\nUsers not found: " + strings.Join(context.Props["usernamesNotFound"].([]string), ", ")
		text += "\nMembers whose accounts no longer exist are dropped from the standup on their own, or can be removed by user ID."
	}

	return &model.CommandResponse{
		Type: model.CommandResponseTypeEphemeral,
		Text: text,
	}, nil
}

func removeMembersFromStandup(userIDs []string, channelID string) ([]string, []string, error) {
	standupConfig, err := standup.GetStandupConfig(channelID)
	if err != nil {
		return nil, nil, err
	}

	if standupConfig == nil {
		return nil, nil, errors.New("Unable to find standup config for channel: " + channelID)
	}

	membersNotInStandup := util.Difference(userIDs, standupConfig.Members)

	originalMembers := standupConfig.Members
	standupConfig.Members = util.Difference(standupConfig.Members, userIDs)

	membersRemovedFromStandup := util.Difference(originalMembers, standupConfig.Members)

	_, err = standup.SaveStandupConfig(standupConfig)
	if err != nil {
		return nil, nil, err
	}

	return membersNotInStandup, membersRemovedFromStandup, nil
}

// memberIDInStandup returns the argument when it is the user ID of a member of
// the channel's standup. It is how a member whose account no longer exists is
// removed: the account cannot be found by username, but the standup still holds
// its ID.
func memberIDInStandup(argument, channelID string) string {
	standupConfig, err := standup.GetStandupConfig(channelID)
	if err != nil || standupConfig == nil {
		return ""
	}

	if funk.Contains(standupConfig.Members, argument) {
		return argument
	}

	return ""
}
