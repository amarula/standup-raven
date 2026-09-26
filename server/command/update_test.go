package command

import (
	"strings"
	"testing"
	"time"

	"bou.ke/monkey"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/stretchr/testify/assert"

	"github.com/standup-raven/standup-raven/server/config"
	"github.com/standup-raven/standup-raven/server/logger"
	"github.com/standup-raven/standup-raven/server/otime"
	"github.com/standup-raven/standup-raven/server/standup"
)

const (
	testChannelID = "channel_id"
	testUserID    = "user_id"
	noStandupChan = "channel_without_standup"
)

func mockCommandAPI() *plugintest.API {
	mockAPI := &plugintest.API{}
	config.Mattermost = mockAPI

	monkey.Patch(logger.Debug, func(msg string, err error, keyValuePairs ...interface{}) {})
	monkey.Patch(logger.Error, func(msg string, err error, extraData map[string]interface{}) {})
	monkey.Patch(logger.Info, func(msg string, err error, keyValuePairs ...interface{}) {})
	monkey.Patch(logger.Warn, func(msg string, err error, keyValuePairs ...interface{}) {})

	location, _ := time.LoadLocation("Asia/Kolkata")
	config.SetConfig(&config.Configuration{Location: location})
	otime.DefaultLocation = location

	return mockAPI
}

func updateTestStandupConfig() *standup.Config {
	return &standup.Config{
		ChannelID: testChannelID,
		Sections:  []string{"Yesterday", "Today", "In progress", "in"},
		Timezone:  "Asia/Kolkata",
	}
}

func patchUpdateStandupConfig() {
	monkey.Patch(standup.GetStandupConfig, func(channelID string) (*standup.Config, error) {
		if channelID == noStandupChan {
			return nil, nil
		}
		return updateTestStandupConfig(), nil
	})
}

func newUpdateContext(channelID string) Context {
	return Context{
		CommandArgs: &model.CommandArgs{
			ChannelId: channelID,
			UserId:    testUserID,
		},
		Props: map[string]interface{}{},
	}
}

func TestMatchSection(t *testing.T) {
	sections := []string{"Yesterday", "Today", "In progress", "in"}

	tests := []struct {
		name    string
		section string
		line    string
		args    []string
		matched bool
	}{
		{
			name:    "single word section",
			args:    []string{"today", "shipped", "the", "fix"},
			section: "Today",
			line:    "shipped the fix",
			matched: true,
		},
		{
			name:    "section name with spaces",
			args:    []string{"in", "progress", "reviewing", "the", "PR"},
			section: "In progress",
			line:    "reviewing the PR",
			matched: true,
		},
		{
			name:    "longest matching section wins",
			args:    []string{"in", "progress", "waiting"},
			section: "In progress",
			line:    "waiting",
			matched: true,
		},
		{
			name:    "matching is case insensitive",
			args:    []string{"YESTERDAY", "wrote", "tests"},
			section: "Yesterday",
			line:    "wrote tests",
			matched: true,
		},
		{
			name:    "no section matches",
			args:    []string{"nonsense", "text"},
			matched: false,
		},
		{
			name:    "a section name with nothing left for the line",
			args:    []string{"today"},
			matched: false,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			section, remaining, matched := matchSection(sections, test.args)

			assert.Equal(t, test.matched, matched)
			if !test.matched {
				return
			}

			assert.Equal(t, test.section, section)
			assert.Equal(t, test.line, strings.Join(remaining, " "))
		})
	}
}

func Test_validateCommandUpdate(t *testing.T) {
	defer TearDown()
	mockCommandAPI()
	patchUpdateStandupConfig()

	t.Run("resolves the section and the line", func(t *testing.T) {
		context := newUpdateContext(testChannelID)

		response, appErr := validateCommandUpdate([]string{"in", "progress", "reviewing", "the", "PR"}, context)

		assert.Nil(t, response)
		assert.Nil(t, appErr)
		assert.Equal(t, "In progress", context.Props[propUpdateSection])
		assert.Equal(t, "reviewing the PR", context.Props[propUpdateText])
	})

	t.Run("rejects a section that is not configured", func(t *testing.T) {
		response, appErr := validateCommandUpdate([]string{"unlisted", "something"}, newUpdateContext(testChannelID))

		assert.Nil(t, appErr)
		assert.NotNil(t, response)
		assert.Contains(t, response.Text, "Today")
		assert.Contains(t, response.Text, "In progress")
	})

	t.Run("rejects a missing line", func(t *testing.T) {
		response, appErr := validateCommandUpdate([]string{"today"}, newUpdateContext(testChannelID))

		assert.Nil(t, appErr)
		assert.NotNil(t, response)
		assert.Contains(t, response.Text, "Usage")
	})

	t.Run("rejects an overlong line", func(t *testing.T) {
		response, appErr := validateCommandUpdate(
			[]string{"today", strings.Repeat("x", maxStandupLineLength+1)},
			newUpdateContext(testChannelID),
		)

		assert.Nil(t, appErr)
		assert.NotNil(t, response)
		assert.Contains(t, response.Text, "readable")
	})

	t.Run("rejects a channel without a standup", func(t *testing.T) {
		response, appErr := validateCommandUpdate([]string{"today", "something"}, newUpdateContext(noStandupChan))

		assert.Nil(t, appErr)
		assert.NotNil(t, response)
		assert.Contains(t, response.Text, "not configured")
	})
}

func Test_executeCommandUpdate(t *testing.T) {
	defer TearDown()
	mockAPI := mockCommandAPI()
	mockAPI.On("GetChannel", testChannelID).Return(&model.Channel{Id: testChannelID}, nil)
	patchUpdateStandupConfig()

	var existing *standup.UserStandup
	var saved *standup.UserStandup

	monkey.Patch(standup.GetUserStandup, func(userID, channelID string, date otime.OTime) (*standup.UserStandup, error) {
		return existing, nil
	})
	monkey.Patch(standup.SaveUserStandup, func(userStandup *standup.UserStandup) error {
		saved = userStandup
		return nil
	})

	t.Run("starts a standup when there is none yet", func(t *testing.T) {
		existing = nil
		saved = nil
		context := newUpdateContext(testChannelID)
		context.Props[propUpdateSection] = "Today"
		context.Props[propUpdateText] = "reviewing the PR"

		response, appErr := executeCommandUpdate(nil, context)

		assert.Nil(t, appErr)
		assert.NotNil(t, response)
		assert.Contains(t, response.Text, "reviewing the PR")

		if assert.NotNil(t, saved) {
			assert.Equal(t, testUserID, saved.UserID)
			assert.Equal(t, testChannelID, saved.ChannelID)
			assert.Equal(t, []string{"reviewing the PR"}, *saved.Standup["Today"])
		}
	})

	t.Run("appends to a standup that already exists", func(t *testing.T) {
		previousLines := []string{"shipped the fix"}
		existing = &standup.UserStandup{
			UserID:    testUserID,
			ChannelID: testChannelID,
			Standup: map[string]*[]string{
				"Today": &previousLines,
			},
		}
		saved = nil

		context := newUpdateContext(testChannelID)
		context.Props[propUpdateSection] = "Today"
		context.Props[propUpdateText] = "reviewing the PR"

		response, appErr := executeCommandUpdate(nil, context)

		assert.Nil(t, appErr)
		assert.NotNil(t, response)

		if assert.NotNil(t, saved) {
			assert.Equal(t, []string{"shipped the fix", "reviewing the PR"}, *saved.Standup["Today"])
		}
	})

	t.Run("propagates a save failure", func(t *testing.T) {
		existing = nil
		monkey.Patch(standup.SaveUserStandup, func(userStandup *standup.UserStandup) error {
			return assert.AnError
		})

		context := newUpdateContext(testChannelID)
		context.Props[propUpdateSection] = "Today"
		context.Props[propUpdateText] = "reviewing the PR"

		response, appErr := executeCommandUpdate(nil, context)

		assert.Nil(t, appErr)
		assert.NotNil(t, response)
		assert.Contains(t, response.Text, "Couldn't save")
	})
}
