package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"bou.ke/monkey"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"

	"github.com/standup-raven/standup-raven/server/config"
	"github.com/standup-raven/standup-raven/server/logger"
)

func Test_executeOpenStandup(t *testing.T) {
	defer monkey.UnpatchAll()

	mockAPI := &plugintest.API{}
	config.Mattermost = mockAPI

	monkey.Patch(logger.Error, func(msg string, err error, extraData map[string]interface{}) {})

	var publishedEvent string
	var publishedPayload map[string]interface{}
	var publishedBroadcast *model.WebsocketBroadcast

	mockAPI.On("PublishWebSocketEvent", mock.Anything, mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		publishedEvent = args.Get(0).(string)
		publishedPayload = args.Get(1).(map[string]interface{})
		publishedBroadcast = args.Get(2).(*model.WebsocketBroadcast)
	}).Return()

	t.Run("asks the clicking user's client to open the channel's modal", func(t *testing.T) {
		body := `{"user_id":"user_id","channel_id":"channel_id","context":{"channel_id":"channel_id"}}`
		recorder := httptest.NewRecorder()

		err := executeOpenStandup("user_id", recorder, newPostRequest(body))

		assert.Nil(t, err)
		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Equal(t, "open_standup_modal", publishedEvent)
		assert.Equal(t, map[string]interface{}{"channel_id": "channel_id"}, publishedPayload)
		assert.Equal(t, "user_id", publishedBroadcast.UserId)
	})

	t.Run("falls back to the post's channel when the context has none", func(t *testing.T) {
		publishedPayload = nil
		body := `{"user_id":"user_id","channel_id":"channel_from_post","context":{}}`
		recorder := httptest.NewRecorder()

		err := executeOpenStandup("user_id", recorder, newPostRequest(body))

		assert.Nil(t, err)
		assert.Equal(t, map[string]interface{}{"channel_id": "channel_from_post"}, publishedPayload)
	})

	t.Run("rejects a request with no channel at all", func(t *testing.T) {
		recorder := httptest.NewRecorder()

		err := executeOpenStandup("user_id", recorder, newPostRequest(`{"user_id":"user_id"}`))

		assert.NotNil(t, err)
		assert.Equal(t, http.StatusBadRequest, recorder.Code)
	})

	t.Run("rejects a body it cannot read", func(t *testing.T) {
		recorder := httptest.NewRecorder()

		err := executeOpenStandup("user_id", recorder, newPostRequest(`not json`))

		assert.NotNil(t, err)
		assert.Equal(t, http.StatusBadRequest, recorder.Code)
	})
}

func newPostRequest(body string) *http.Request {
	return httptest.NewRequest(http.MethodPost, config.PathOpenStandup, strings.NewReader(body))
}
