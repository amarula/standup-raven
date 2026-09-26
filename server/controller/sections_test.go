package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
	"github.com/standup-raven/standup-raven/server/util"
)

func sectionsMock(t *testing.T) *plugintest.API {
	t.Helper()

	mockAPI := &plugintest.API{}
	config.Mattermost = mockAPI

	monkey.Patch(logger.Error, func(msg string, err error, extraData map[string]interface{}) {})
	monkey.Patch(logger.Debug, func(msg string, err error, keyValuePairs ...interface{}) {})

	location, err := time.LoadLocation("Asia/Kolkata")
	assert.NoError(t, err)
	config.SetConfig(&config.Configuration{Location: location})
	otime.DefaultLocation = location

	return mockAPI
}

func Test_executeGetSections(t *testing.T) {
	defer monkey.UnpatchAll()

	mockAPI := sectionsMock(t)

	standupConfig := standup.Config{
		ChannelID:    "channel_id",
		Sections:     []string{"Today", "Details", "Tickets"},
		SectionTypes: map[string]string{"Details": standup.SectionTypeLongText, "Tickets": standup.SectionTypeIssues},
		Timezone:     "Asia/Kolkata",
	}
	stored, err := json.Marshal(standupConfig)
	assert.NoError(t, err)

	mockAPI.On("KVGet", util.GetKeyHash("standup_config_channel_id")).Return(stored, nil)
	mockAPI.On("KVGet", util.GetKeyHash("standup_config_channel_without_standup")).Return(nil, nil)
	mockAPI.On("KVGet", util.GetKeyHash("standup_config_")).Return(nil, nil)

	request := func(channelID string) *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/sections?channel_id="+channelID, nil)

		assert.NoError(t, executeGetSections(recorder, req))

		return recorder
	}

	t.Run("suggests the channel's own sections, in order", func(t *testing.T) {
		var suggestions []model.AutocompleteListItem
		assert.NoError(t, json.Unmarshal(request("channel_id").Body.Bytes(), &suggestions))

		assert.Equal(t, []model.AutocompleteListItem{
			{Item: "Today", HelpText: "Lines"},
			{Item: "Details", HelpText: "Work notes"},
			{Item: "Tickets", HelpText: "Issue IDs"},
		}, suggestions, "what a section takes is said alongside it")
	})

	t.Run("a channel with no standup suggests nothing rather than failing", func(t *testing.T) {
		recorder := request("channel_without_standup")

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Equal(t, "[]", recorder.Body.String())
	})

	t.Run("no channel at all suggests nothing", func(t *testing.T) {
		recorder := request("")

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Equal(t, "[]", recorder.Body.String())
	})
}
