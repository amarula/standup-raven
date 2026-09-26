package controller

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/standup-raven/standup-raven/server/config"
	"github.com/standup-raven/standup-raven/server/controller/middleware"
	"github.com/standup-raven/standup-raven/server/logger"
)

// openStandupModalEvent is published to the user who clicked the prompt button.
// The webapp listens for it as custom_standup-raven_open_standup_modal, the way
// it already does for open_config_modal.
const openStandupModalEvent = "open_standup_modal"

// postActionIntegrationRequest is the shape Mattermost posts to a plugin URL
// when a message button is clicked. Only the fields used here are decoded.
type postActionIntegrationRequest struct {
	Context   map[string]any `json:"context"`
	UserID    string         `json:"user_id"`
	ChannelID string         `json:"channel_id"`
}

var openStandup = &Endpoint{
	Path:    config.PathOpenStandup,
	Method:  http.MethodPost,
	Execute: authenticatedControllerWrapper(executeOpenStandup),
	Middlewares: []middleware.Middleware{
		middleware.Authenticated,
	},
}

// executeOpenStandup turns a click on the standup prompt into a websocket event
// for the user who clicked, asking their client to open the modal for the
// channel the prompt belongs to. The button click is authenticated by the
// server, which sets the user header on plugin requests, so the event can only
// be sent to the user who made the request.
func executeOpenStandup(userID string, w http.ResponseWriter, r *http.Request) error {
	request := &postActionIntegrationRequest{}
	if err := json.NewDecoder(r.Body).Decode(request); err != nil {
		logger.Error("Couldn't decode the standup prompt action", err, nil)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return err
	}

	channelID, _ := request.Context["channel_id"].(string)
	if channelID == "" {
		channelID = request.ChannelID
	}
	if channelID == "" {
		http.Error(w, "No channel in request", http.StatusBadRequest)
		return errors.New("no channel ID in the standup prompt action")
	}

	config.Mattermost.PublishWebSocketEvent(
		openStandupModalEvent,
		map[string]any{
			"channel_id": channelID,
		},
		&model.WebsocketBroadcast{
			UserId: userID,
		},
	)

	// Mattermost expects a JSON body on success; the button itself has nothing
	// to show.
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write([]byte("{}")); err != nil {
		return err
	}

	return nil
}
