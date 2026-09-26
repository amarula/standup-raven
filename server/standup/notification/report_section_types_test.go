package notification

import (
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/stretchr/testify/assert"

	"github.com/standup-raven/standup-raven/server/otime"
	"github.com/standup-raven/standup-raven/server/standup"
)

// SectionBody has its own tests. These check the generators actually use it, so
// that a section configured as work notes comes out as work notes rather than as
// a numbered list, in both report formats.
func sectionTypesReportConfig() *standup.Config {
	return &standup.Config{
		ChannelID:    "channel_id",
		Sections:     []string{"Today", "Details", "Tickets"},
		SectionTypes: map[string]string{"Details": standup.SectionTypeLongText, "Tickets": standup.SectionTypeIssues},
		Members:      []string{"user_id_1"},
		Timezone:     "Asia/Kolkata",
	}
}

func standupWithEverySection() *standup.UserStandup {
	return &standup.UserStandup{
		UserID:    "user_id_1",
		ChannelID: "channel_id",
		Standup: map[string]*[]string{
			"Today":   {"Reviewed the board PR", "Ran the calibration suite"},
			"Details": {"Trace:\n\n```\nE: timeout\n```"},
			"Tickets": {"AXELERA-210", "AXELERA-183"},
		},
	}
}

func Test_Reports_RenderSectionsByType(t *testing.T) {
	generators := []struct {
		generate func(*standup.Config, []*standup.UserStandup, []string, []string, string, otime.OTime) (*model.Post, error)
		name     string
	}{
		{name: "user aggregated", generate: generateUserAggregatedStandupReport},
		{name: "type aggregated", generate: generateTypeAggregatedStandupReport},
	}

	for _, generator := range generators {
		t.Run(generator.name, func(t *testing.T) {
			defer TearDown()

			mockAPI := setUp()
			baseMock(mockAPI)
			mockAPI.On("GetUser", "user_id_1").Return(&model.User{Username: "alice"}, nil)

			report, err := generator.generate(
				sectionTypesReportConfig(),
				[]*standup.UserStandup{standupWithEverySection()},
				nil,
				nil,
				"channel_id",
				otime.OTime{Time: time.Now()},
			)

			assert.NoError(t, err)
			if !assert.NotNil(t, report) {
				return
			}

			assert.Contains(t, report.Message, "1. Reviewed the board PR\n1. Ran the calibration suite",
				"a question answered in lines keeps its numbering")
			assert.Contains(t, report.Message, "```\nE: timeout\n```",
				"work notes keep their code block")
			assert.Contains(t, report.Message, "**Issues:** AXELERA-210, AXELERA-183",
				"issue IDs are shown as one line")
			assert.NotContains(t, report.Message, "1. Trace:",
				"work notes are not turned into a numbered list")
		})
	}
}
