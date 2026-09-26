package command

import (
	"net/http"
	"testing"

	"bou.ke/monkey"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"

	"github.com/standup-raven/standup-raven/server/util"
)

// standupWithStaleMember is a stored standup whose member list still holds an
// account that no longer exists.
const standupWithStaleMember = `{"channelId":"channel_id","members":["gone_user_id"],"scheduleEnabled":false}` //nolint:gosec // a fixture, not a credential

func patchCallerRoles() {
	monkey.Patch(util.GetUserRoles, func(userID, channelID string) ([]string, *model.AppError) {
		return []string{model.SystemUserRoleId}, nil
	})
}

func Test_validateRemoveMembers_StaleMemberByID(t *testing.T) {
	defer TearDown()
	mockAPI := mockCommandAPI()
	patchCallerRoles()

	// The account cannot be found by username any more, which is what made it
	// impossible to remove, but the standup still holds its user ID.
	mockAPI.On("GetUserByUsername", "gone_user_id").Return(nil, &model.AppError{StatusCode: http.StatusNotFound, Message: "no such user"})
	mockAPI.On("KVGet", util.GetKeyHash("standup_config_"+testChannelID)).Return([]byte(standupWithStaleMember), nil)

	context := newUpdateContext(testChannelID)
	_, appErr := validateRemoveMembers([]string{"gone_user_id"}, context)

	assert.Nil(t, appErr)
	assert.Equal(t, []string{"gone_user_id"}, context.Props["userIDs"], "the ID is taken as the member to remove")
	assert.Empty(t, context.Props["usernamesNotFound"])
}

func Test_validateRemoveMembers_UnknownNameIsStillReported(t *testing.T) {
	defer TearDown()
	mockAPI := mockCommandAPI()
	patchCallerRoles()

	mockAPI.On("GetUserByUsername", "nobody").Return(nil, &model.AppError{StatusCode: http.StatusNotFound, Message: "no such user"})
	mockAPI.On("KVGet", util.GetKeyHash("standup_config_"+testChannelID)).Return([]byte(standupWithStaleMember), nil)

	context := newUpdateContext(testChannelID)
	_, appErr := validateRemoveMembers([]string{"nobody"}, context)

	assert.Nil(t, appErr)
	assert.Empty(t, context.Props["userIDs"], "a name that is neither a user nor a member removes nothing")
	assert.Equal(t, []string{"nobody"}, context.Props["usernamesNotFound"])
}

func Test_executeRemoveMembers_StaleMemberByID(t *testing.T) {
	defer TearDown()
	mockAPI := mockCommandAPI()

	var saved []byte
	mockAPI.On("KVGet", util.GetKeyHash("standup_config_"+testChannelID)).Return([]byte(standupWithStaleMember), nil)
	mockAPI.On("KVSet", mock.AnythingOfType("string"), mock.Anything).Run(func(args mock.Arguments) {
		saved = args.Get(1).([]byte)
	}).Return(nil)
	mockAPI.On("GetChannel", testChannelID).Return(&model.Channel{}, nil)
	mockAPI.On("UpdateChannel", mock.Anything).Return(nil, nil)

	context := newUpdateContext(testChannelID)
	context.Props["userIDs"] = []string{"gone_user_id"}
	context.Props["usernamesByUserID"] = map[string]string{"gone_user_id": "gone_user_id"}
	context.Props["usernamesNotFound"] = []string{}

	response, appErr := executeRemoveMembers(nil, context)

	assert.Nil(t, appErr)
	if assert.NotNil(t, response) {
		assert.Contains(t, response.Text, "Removed users from standup: gone_user_id")
	}
	if assert.NotNil(t, saved) {
		assert.NotContains(t, string(saved), "gone_user_id", "the account that is gone is no longer a member")
	}
}
