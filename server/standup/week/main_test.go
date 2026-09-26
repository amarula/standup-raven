package week

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

func baseMock() *plugintest.API {
	mockAPI := &plugintest.API{}
	config.Mattermost = mockAPI

	monkey.Patch(logger.Debug, func(msg string, err error, keyValuePairs ...interface{}) {})
	monkey.Patch(logger.Error, func(msg string, err error, extraData map[string]interface{}) {})

	return mockAPI
}

func TearDown() {
	monkey.UnpatchAll()
}

func dayIn(t *testing.T, timezone string, day string) otime.OTime {
	t.Helper()

	location, err := time.LoadLocation(timezone)
	assert.NoError(t, err)

	parsed, err := time.ParseInLocation("2006-01-02 15:04", day+" 09:00", location)
	assert.NoError(t, err)

	return otime.OTime{Time: parsed}
}

// The days a digest reads are the days standups were filed under, so this is the
// table that decides whether someone's Tuesday appears in their week.
func Test_DatesFor(t *testing.T) {
	//nolint:govet // a table of cases, where the order that reads best is the one to keep
	tests := []struct {
		name     string
		today    string
		timezone string
		expected []string
		weeksAgo int
	}{
		{
			name:     "midweek starts on Monday and stops at today",
			today:    "2026-09-24",
			timezone: "Asia/Kolkata",
			expected: []string{"20260921", "20260922", "20260923", "20260924"},
		},
		{
			name:     "on a Monday the week is one day",
			today:    "2026-09-21",
			timezone: "Asia/Kolkata",
			expected: []string{"20260921"},
		},
		{
			name:     "on a Sunday the week is whole",
			today:    "2026-09-27",
			timezone: "Asia/Kolkata",
			expected: []string{"20260921", "20260922", "20260923", "20260924", "20260925", "20260926", "20260927"},
		},
		{
			name:     "the week before is Monday to Sunday",
			today:    "2026-09-24",
			timezone: "Asia/Kolkata",
			weeksAgo: 1,
			expected: []string{"20260914", "20260915", "20260916", "20260917", "20260918", "20260919", "20260920"},
		},
		{
			// A zone behind UTC is where a date built through UTC lands on the
			// wrong day.
			name:     "a western timezone does not shift the week",
			today:    "2026-09-24",
			timezone: "America/New_York",
			expected: []string{"20260921", "20260922", "20260923", "20260924"},
		},
		{
			name:     "a week across a month boundary",
			today:    "2026-09-02",
			timezone: "Asia/Kolkata",
			weeksAgo: 1,
			expected: []string{"20260824", "20260825", "20260826", "20260827", "20260828", "20260829", "20260830"},
		},
		{
			// The clocks go back on the Sunday of this week, which is where
			// stepping by 24 hours instead of by date loses a day.
			name:     "a week whose clocks change still has seven days",
			today:    "2026-10-25",
			timezone: "Europe/Berlin",
			expected: []string{"20261019", "20261020", "20261021", "20261022", "20261023", "20261024", "20261025"},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			dates := DatesFor(dayIn(t, test.timezone, test.today), test.weeksAgo)

			got := make([]string, 0, len(dates))
			for _, date := range dates {
				got = append(got, date.GetDateString())
			}

			assert.Equal(t, test.expected, got)
		})
	}
}

// The digest reads by walking members against days, because stored standups are
// keyed by a hash and cannot be listed. This is the check that the days asked for
// are the days meant.
func Test_Collect_AsksForTheRightDays(t *testing.T) {
	defer TearDown()

	mockAPI := baseMock()
	mockAPI.On("GetUser", "user_id_1").Return(&model.User{Username: "alice"}, nil)

	var asked []string
	monkey.Patch(standup.GetUserStandup, func(userID, channelID string, date otime.OTime) (*standup.UserStandup, error) {
		asked = append(asked, date.GetDateString())
		return nil, nil
	})

	standupConfig := &standup.Config{
		ChannelID: "channel_id",
		Members:   []string{"user_id_1"},
		Sections:  []string{"Today"},
		Timezone:  "Asia/Kolkata",
	}

	in := Collect(standupConfig, 1, dayIn(t, "Asia/Kolkata", "2026-09-24"))

	assert.Equal(t,
		[]string{"20260914", "20260915", "20260916", "20260917", "20260918", "20260919", "20260920"},
		asked,
		"the week before, in full, and never today")
	assert.Equal(t, []string{"alice"}, in.Silent, "someone who filed nothing all week is named")
}

func utcDay(day string) otime.OTime {
	location, _ := time.LoadLocation("UTC")
	parsed, _ := time.ParseInLocation("2006-01-02 15:04", day+" 09:00", location)

	return otime.OTime{Time: parsed}
}

func buildInput(entries []Entry) Input {
	return Input{
		From:     utcDay("2026-09-21"),
		To:       utcDay("2026-09-24"),
		Sections: []string{"Today", "Details", "Tickets"},
		Types:    map[string]string{"Details": standup.SectionTypeLongText, "Tickets": standup.SectionTypeIssues},
		Entries:  entries,
		Silent:   []string{},
	}
}

func entry(day string, name string, sections map[string][]string, issues []string) Entry {
	return Entry{
		Date:     utcDay(day),
		Name:     name,
		Standup:  sections,
		IssueIDs: issues,
	}
}

func Test_BuildDigest_GroupsByIssue(t *testing.T) {
	digest := strings.Join(BuildDigest(buildInput([]Entry{
		entry("2026-09-21", "alice", map[string][]string{"Today": {"Reviewed the board PR"}, "Tickets": {"AXELERA-210"}}, []string{"AXELERA-210"}),
		entry("2026-09-22", "bob", map[string][]string{"Today": {"Wrote the bring-up notes"}, "Tickets": {"AXELERA-183"}}, []string{"AXELERA-183"}),
		entry("2026-09-23", "alice", map[string][]string{"Today": {"Second look at the fix"}, "Tickets": {"AXELERA-210"}}, []string{"AXELERA-210"}),
	})), "\n")

	assert.Contains(t, digest, "#### AXELERA-210")
	assert.Contains(t, digest, "#### AXELERA-183")
	assert.Less(t, strings.Index(digest, "AXELERA-210"), strings.Index(digest, "AXELERA-183"),
		"issues appear in the order the week mentions them")
	assert.Contains(t, digest, "**alice** — Mon 21 Sep")
	assert.Contains(t, digest, "**alice** — Wed 23 Sep")
}

func Test_BuildDigest_WorkWithNoIssueIsNotHidden(t *testing.T) {
	digest := strings.Join(BuildDigest(buildInput([]Entry{
		entry("2026-09-21", "alice", map[string][]string{"Today": {"Setup work for the new board"}}, nil),
	})), "\n")

	assert.Contains(t, digest, "#### "+noIssueHeading)
	assert.Contains(t, digest, "Setup work for the new board")
}

func Test_BuildDigest_NamingSeveralIssuesAppearsUnderEach(t *testing.T) {
	digest := strings.Join(BuildDigest(buildInput([]Entry{
		entry("2026-09-21", "alice", map[string][]string{
			"Today":   {"Chased the regression through both boards"},
			"Tickets": {"AXELERA-210", "AXELERA-183"},
		}, []string{"AXELERA-210", "AXELERA-183"}),
	})), "\n")

	assert.Equal(t, 2, strings.Count(digest, "Chased the regression through both boards"),
		"listed under each issue it names")
}

// Work notes are one stored value holding a whole Markdown body, and the digest
// has to hand it over intact.
func Test_BuildDigest_WorkNotesSurviveIntact(t *testing.T) {
	notes := "Trace:\n\n```\nE: timeout\n\nretry afterwards\n```"

	digest := strings.Join(BuildDigest(buildInput([]Entry{
		entry("2026-09-21", "alice", map[string][]string{"Today": {"Debugged the sensor"}, "Details": {notes}}, []string{"AXELERA-210"}),
	})), "\n")

	assert.Contains(t, digest, notes, "the code block comes through whole")
	assert.NotContains(t, digest, "1. Trace:", "work notes are not turned into a numbered list")
	assert.Contains(t, digest, "*Details*\n\nTrace:", "and start on their own line, under their own heading")
}

func Test_BuildDigest_SaysWhoFiledNothing(t *testing.T) {
	in := buildInput([]Entry{
		entry("2026-09-21", "alice", map[string][]string{"Today": {"something"}}, []string{"AXELERA-210"}),
	})
	in.Silent = []string{"carol", "dan"}

	digest := strings.Join(BuildDigest(in), "\n")

	assert.Contains(t, digest, "Nobody filed a standup all week")
	assert.Contains(t, digest, "carol, dan")
}

func Test_BuildDigest_SaysWhenSomethingCouldNotBeRead(t *testing.T) {
	in := buildInput([]Entry{
		entry("2026-09-21", "alice", map[string][]string{"Today": {"something"}}, []string{"AXELERA-210"}),
	})
	in.Failures = 2

	digest := strings.Join(BuildDigest(in), "\n")

	assert.Contains(t, digest, "Some standups could not be read")
	assert.Contains(t, digest, "2 could not be fetched")
}

func Test_BuildDigest_AnEmptyWeekSaysSo(t *testing.T) {
	digest := strings.Join(BuildDigest(buildInput(nil)), "\n")

	assert.Contains(t, digest, "Nobody filed a standup this week.")
}

// A week too long for one message is sent as several, rather than losing a day.
func Test_BuildDigest_SplitsRatherThanTruncates(t *testing.T) {
	entries := []Entry{}
	for day := 1; day <= 20; day++ {
		entries = append(entries, entry("2026-09-21", "alice", map[string][]string{
			"Today": {strings.Repeat("a long day of work ", 60)},
		}, []string{"AXELERA-" + strings.Repeat("1", day)}))
	}

	parts := BuildDigest(buildInput(entries))

	assert.Greater(t, len(parts), 1, "a long week is more than one message")
	for _, part := range parts {
		assert.LessOrEqual(t, len([]rune(part)), maxPartRunes, "and every part fits in one message")
	}
}
