package standup

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/standup-raven/standup-raven/server/config"
	"github.com/standup-raven/standup-raven/server/otime"
)

func sectionTypesConfig() Config {
	// The window times are not what these tests are about, and building them
	// with otime.Parse would need the default location these tests do not
	// otherwise touch.
	windowOpenTime := otime.OTime{Time: time.Now()}
	windowCloseTime := otime.OTime{Time: time.Now()}

	return Config{
		ChannelID:       "channel_id",
		WindowOpenTime:  windowOpenTime,
		WindowCloseTime: windowCloseTime,
		Enabled:         true,
		Members:         []string{"user_id_1"},
		ReportFormat:    config.ReportFormatUserAggregated,
		Sections:        []string{"Yesterday", "Today", "Details", "Tickets"},
		Timezone:        "Asia/Kolkata",
		RRuleString:     "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR,SA,SU;COUNT=10",
		StartDate:       time.Now(),
	}
}

// A section with nothing recorded is plain text: that is what every section was
// before types existed, and what a configuration saved then has to keep reading
// as.
func TestConfig_SectionType_DefaultsToText(t *testing.T) {
	standupConfig := sectionTypesConfig()

	assert.Equal(t, SectionTypeText, standupConfig.SectionType("Today"))
	assert.Equal(t, SectionTypeText, standupConfig.SectionType("Details"), "a section with no type recorded is plain text")

	standupConfig.SectionTypes = map[string]string{
		"Details": SectionTypeLongText,
		"Tickets": SectionTypeIssues,
	}

	assert.Equal(t, SectionTypeLongText, standupConfig.SectionType("Details"))
	assert.Equal(t, SectionTypeIssues, standupConfig.SectionType("Tickets"))
	assert.Equal(t, SectionTypeText, standupConfig.SectionType("Today"), "the other sections are untouched")
	assert.Equal(t, SectionTypeText, standupConfig.SectionType("Not a section at all"))
	assert.Equal(t, SectionTypeText, standupConfig.SectionType(""), "an unnamed type is no type")
}

func TestConfig_SectionType_NoConfigAtAll(t *testing.T) {
	var missing *Config

	assert.Equal(t, SectionTypeText, missing.SectionType("Today"))
}

// Types that cannot mean anything are dropped on the way in. Refusing the save
// instead would leave an admin with a modal that cannot correct the problem.
func TestConfig_PreSave_PrunesSectionTypes(t *testing.T) {
	defer TearDown()
	baseMock()

	standupConfig := sectionTypesConfig()
	standupConfig.SectionTypes = map[string]string{
		"Details": SectionTypeLongText,
		"Tickets": SectionTypeIssues,
		"Gone":    SectionTypeLongText,
		"Today":   "nonsense",
	}

	err := standupConfig.PreSave()

	assert.NoError(t, err)
	assert.Equal(t, map[string]string{
		"Details": SectionTypeLongText,
		"Tickets": SectionTypeIssues,
	}, standupConfig.SectionTypes, "a type naming no section, or one we do not know, is dropped")
}

func TestConfig_PreSave_NoSectionTypesStaysEmpty(t *testing.T) {
	defer TearDown()
	baseMock()

	standupConfig := sectionTypesConfig()
	standupConfig.SectionTypes = map[string]string{"Gone": SectionTypeLongText}

	err := standupConfig.PreSave()

	assert.NoError(t, err)
	assert.Nil(t, standupConfig.SectionTypes, "nothing survives, so nothing is stored")
}

func TestConfig_SectionTypesSurviveStorage(t *testing.T) {
	standupConfig := sectionTypesConfig()
	standupConfig.SectionTypes = map[string]string{"Details": SectionTypeLongText, "Tickets": SectionTypeIssues}

	stored, err := json.Marshal(standupConfig)
	assert.NoError(t, err)

	var read Config
	assert.NoError(t, json.Unmarshal(stored, &read))
	assert.Equal(t, standupConfig.SectionTypes, read.SectionTypes)

	// And a configuration saved before this field existed reads as plain text.
	var before Config
	assert.NoError(t, json.Unmarshal([]byte(`{"channelId":"channel_id","sections":["Today"]}`), &before))
	assert.Nil(t, before.SectionTypes)
	assert.Equal(t, SectionTypeText, before.SectionType("Today"))
}

func TestSectionBody(t *testing.T) {
	//nolint:govet // a table of cases, where the order that reads best is the one to keep
	tests := []struct {
		name        string
		sectionType string
		lines       []string
		expected    string
	}{
		{
			name:        "a question answered in lines is a numbered list",
			sectionType: SectionTypeText,
			lines:       []string{"Reviewed the board PR", "Ran the calibration suite"},
			expected:    "1. Reviewed the board PR\n1. Ran the calibration suite",
		},
		{
			name:        "work notes are left exactly as written",
			sectionType: SectionTypeLongText,
			lines:       []string{"Trace:\n\n```\nE: timeout\n```\n\nsee https://example.com/log"},
			expected:    "Trace:\n\n```\nE: timeout\n```\n\nsee https://example.com/log",
		},
		{
			name:        "issue IDs are one line",
			sectionType: SectionTypeIssues,
			lines:       []string{"AXELERA-210", "AXELERA-183"},
			expected:    "**Issues:** AXELERA-210, AXELERA-183",
		},
		{
			name:        "a fence left open is closed, so it cannot swallow the rest of the report",
			sectionType: SectionTypeLongText,
			lines:       []string{"```\nE: timeout"},
			expected:    "```\nE: timeout\n```",
		},
		{
			name:        "a fence that was closed is left alone",
			sectionType: SectionTypeLongText,
			lines:       []string{"```\nE: timeout\n```"},
			expected:    "```\nE: timeout\n```",
		},
		{
			name:        "an unclosed fence in a numbered section is closed too",
			sectionType: SectionTypeText,
			lines:       []string{"```", "E: timeout"},
			expected:    "1. ```\n1. E: timeout\n1. ```",
		},
		{
			name:        "an unknown type renders as plain text",
			sectionType: "nonsense",
			lines:       []string{"a"},
			expected:    "1. a",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			assert.Equal(t, test.expected, SectionBody(test.sectionType, test.lines))
		})
	}
}

// The report itself has to change shape with the section's type, not only the
// section body helper.
func TestSectionBody_LeavesTheInputAlone(t *testing.T) {
	lines := []string{"```", "E: timeout"}
	sectionType := SectionTypeLongText

	assert.Equal(t, "```\nE: timeout\n```", SectionBody(sectionType, lines))
	assert.Equal(t, []string{"```", "E: timeout"}, lines, "the stored standup is not modified by rendering it")
}
