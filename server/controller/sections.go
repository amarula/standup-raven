package controller

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/standup-raven/standup-raven/server/logger"
	"github.com/standup-raven/standup-raven/server/standup"
)

// getSections answers with a channel's standup sections, for the argument list
// of /standup update.
//
// Mattermost's own server fetches this while someone is typing the command - not
// the browser - passing channel_id, user_id and what has been typed so far. It
// answers with suggestions rather than errors, because a list of suggestions is
// not worth an error page: anything that cannot be answered is an empty list.
//
// No middleware: the request is server to server and carries no user header. All
// that comes back is section names, which the channel's own header already
// carries.
var getSections = &Endpoint{
	Path:    "/sections",
	Method:  http.MethodGet,
	Execute: executeGetSections,
}

func executeGetSections(w http.ResponseWriter, r *http.Request) error {
	channelID := r.URL.Query().Get("channel_id")
	suggestions := []model.AutocompleteListItem{}

	standupConfig, err := standup.GetStandupConfig(channelID)
	if err != nil {
		logger.Error("Couldn't read a channel's sections to suggest them", err, map[string]interface{}{"channelID": channelID})
	} else if standupConfig != nil {
		for _, sectionTitle := range standupConfig.Sections {
			suggestions = append(suggestions, model.AutocompleteListItem{
				Item:     sectionTitle,
				HelpText: sectionTypeLabel(standupConfig.SectionType(sectionTitle)),
			})
		}
	}

	body, err := json.Marshal(suggestions)
	if err != nil {
		return err
	}

	w.Header().Set("Content-Type", "application/json")

	if _, err := w.Write(body); err != nil {
		return errors.New(err.Error())
	}

	return nil
}

// sectionTypeLabel says, in the list of suggestions, what kind of answer a
// section takes. Someone who has never used the command learns the sections and
// what they are for in the same glance.
func sectionTypeLabel(sectionType string) string {
	switch sectionType {
	case standup.SectionTypeLongText:
		return "Work notes"
	case standup.SectionTypeIssues:
		return "Issue IDs"
	default:
		return "Lines"
	}
}
