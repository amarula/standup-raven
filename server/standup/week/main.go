// Package week builds the weekly digest: what a channel's members filed over one
// week, grouped by the issue each entry names, as Markdown to copy from when the
// work is logged against the tickets.
//
// It is split in two on purpose. Collect talks to Mattermost and turns a week of
// stored standups into plain data; BuildDigest turns that data into the text and
// touches nothing else, so the grouping, the buckets and the date arithmetic can
// be tested without a server.
package week

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/standup-raven/standup-raven/server/config"
	"github.com/standup-raven/standup-raven/server/logger"
	"github.com/standup-raven/standup-raven/server/otime"
	"github.com/standup-raven/standup-raven/server/standup"
)

const (
	// Mattermost's own default limit for a post, and the only length the model
	// package this plugin builds against exposes. Counted in runes, as
	// Mattermost counts.
	maxPartRunes = model.PostMessageMaxRunesV1

	// The bucket for work that named no issue. Shown rather than hidden, because
	// work with no ticket is exactly the work that goes unlogged.
	noIssueHeading = "Not tied to an issue"

	// How far back /standup week will look.
	WeeksBackLimit = 1

	daysInWeek = 7
)

// Entry is one member's standup for one day, already reduced to the sections that
// hold something.
type Entry struct {
	Date     otime.OTime
	Name     string
	Standup  map[string][]string
	IssueIDs []string
}

// Input is everything the digest is built from.
type Input struct {
	From     otime.OTime
	To       otime.OTime
	Sections []string
	Types    map[string]string
	Entries  []Entry
	Silent   []string
	Failures int
}

// MaxWeeksBack is how many weeks back the digest can be asked for.
func MaxWeeksBack() int {
	return WeeksBackLimit
}

// BuildDigest renders the week, split into as many parts as Mattermost will let
// one message hold. Splitting rather than truncating is deliberate: a week with a
// day quietly missing from it is a week someone logs wrongly.
func BuildDigest(in Input) []string {
	parts := []string{}
	var current strings.Builder

	header := fmt.Sprintf("### Standup: %s – %s\n\n", in.From.Format("2 Jan"), in.To.Format("2 Jan 2006"))
	continuation := fmt.Sprintf("### Standup: %s (continued)\n\n", in.From.Format("2 Jan"))

	flush := func() {
		if current.Len() > 0 {
			parts = append(parts, strings.TrimRight(current.String(), "\n"))
			current.Reset()
		}
	}

	current.WriteString(header)

	for _, heading := range groupOrder(in.Entries) {
		rendered := renderGroup(heading, groupEntries(in.Entries, heading), in)

		if len([]rune(current.String()))+len([]rune(rendered)) > maxPartRunes {
			flush()
			current.WriteString(continuation)
			rendered = fitOnePart(heading, rendered)
		}

		current.WriteString(rendered)
	}

	if len(in.Silent) > 0 {
		fmt.Fprintf(&current, "#### Nobody filed a standup all week\n\n%s\n\n", strings.Join(in.Silent, ", "))
	}

	if in.Failures > 0 {
		fmt.Fprintf(&current, "#### Some standups could not be read\n\n%d could not be fetched, so this week may be missing entries.\n\n", in.Failures)
	}

	if len(in.Entries) == 0 && len(in.Silent) == 0 {
		current.WriteString("Nobody filed a standup this week.\n")
	}

	flush()

	return parts
}

// groupOrder is the issues in the order the week first mentions them, which reads
// as the week's own timeline: sorting the IDs as strings would put AXELERA-100
// before AXELERA-99.
func groupOrder(entries []Entry) []string {
	seen := map[string]bool{}
	order := []string{}

	for _, entry := range entries {
		ids := entry.IssueIDs
		if len(ids) == 0 {
			ids = []string{noIssueHeading}
		}

		for _, issueID := range ids {
			if seen[issueID] {
				continue
			}

			seen[issueID] = true
			order = append(order, issueID)
		}
	}

	return order
}

func groupEntries(entries []Entry, heading string) []Entry {
	group := []Entry{}

	for _, entry := range entries {
		if len(entry.IssueIDs) == 0 {
			if heading == noIssueHeading {
				group = append(group, entry)
			}
			continue
		}

		for _, issueID := range entry.IssueIDs {
			if issueID == heading {
				group = append(group, entry)
				break
			}
		}
	}

	return group
}

func renderGroup(heading string, entries []Entry, in Input) string {
	var group strings.Builder

	fmt.Fprintf(&group, "#### %s\n\n", heading)

	for _, entry := range entries {
		fmt.Fprintf(&group, "**%s** — %s\n\n", entry.Name, entry.Date.Format("Mon 2 Jan"))
		group.WriteString(renderSections(entry, in))
	}

	return group.String()
}

func renderSections(entry Entry, in Input) string {
	var body strings.Builder

	for _, sectionTitle := range in.Sections {
		lines := entry.Standup[sectionTitle]
		if len(lines) == 0 {
			continue
		}

		fmt.Fprintf(&body, "*%s*\n", sectionTitle)

		if sectionTypeOf(in.Types, sectionTitle) == standup.SectionTypeLongText {
			// A blank line first: work notes may open with a fence, and without
			// it that fence would glue itself to the line above.
			body.WriteString("\n")
		}

		body.WriteString(standup.SectionBody(sectionTypeOf(in.Types, sectionTitle), lines))
		body.WriteString("\n\n")
	}

	return body.String()
}

func sectionTypeOf(types map[string]string, sectionTitle string) string {
	if sectionType := types[sectionTitle]; sectionType != "" {
		return sectionType
	}

	return standup.SectionTypeText
}

// fitOnePart handles a group too long to fit a message on its own: it is shown
// cut at a line boundary rather than dropped, so a ticket is never silently
// missing from the week.
func fitOnePart(heading string, rendered string) string {
	notice := "\n_(as much of this one as fits in a single message)_\n"
	prefix := fmt.Sprintf("#### %s\n\n", heading)
	keep := maxPartRunes - len([]rune(prefix)) - len([]rune(notice))

	var kept []string
	used := 0

	for _, line := range strings.Split(rendered, "\n") {
		if used+len([]rune(line))+1 > keep {
			break
		}

		kept = append(kept, line)
		used += len([]rune(line)) + 1
	}

	return strings.Join(kept, "\n") + notice
}

// Collect gathers the week: one read per member per day. Stored standups are
// keyed by a hash of the date and the user, so there is nothing to enumerate and
// no way to ask for a range; walking members against days is how the rollover
// scanner reads back earlier days too.
func Collect(standupConfig *standup.Config, weeksAgo int, today otime.OTime) Input {
	dates := DatesFor(today, weeksAgo)

	in := Input{
		From:     dates[0],
		To:       dates[len(dates)-1],
		Sections: standupConfig.Sections,
		Types:    standupConfig.SectionTypes,
		Entries:  []Entry{},
		Silent:   []string{},
	}

	for _, userID := range standupConfig.Members {
		name := displayName(userID)
		filed := false

		for _, date := range dates {
			userStandup, err := standup.GetUserStandup(userID, standupConfig.ChannelID, date)
			if err != nil {
				// One unreadable day must not cost the whole week: it is counted
				// and then said out loud in the digest.
				logger.Error("Couldn't fetch a standup for the weekly digest", err, map[string]interface{}{"userID": userID})
				in.Failures++
				continue
			}

			entry, ok := entryFor(userStandup, standupConfig, date, name)
			if !ok {
				continue
			}

			filed = true
			in.Entries = append(in.Entries, entry)
		}

		if !filed {
			in.Silent = append(in.Silent, name)
		}
	}

	sort.SliceStable(in.Entries, func(i, j int) bool {
		return in.Entries[i].Date.Before(in.Entries[j].Date.Time)
	})

	return in
}

func entryFor(userStandup *standup.UserStandup, standupConfig *standup.Config, date otime.OTime, name string) (Entry, bool) {
	if userStandup == nil {
		return Entry{}, false
	}

	entry := Entry{
		Date:    date,
		Name:    name,
		Standup: map[string][]string{},
	}

	for _, sectionTitle := range standupConfig.Sections {
		lines := userStandup.Standup[sectionTitle]
		if lines == nil || len(*lines) == 0 {
			continue
		}

		entry.Standup[sectionTitle] = *lines

		if standupConfig.SectionType(sectionTitle) == standup.SectionTypeIssues {
			entry.IssueIDs = append(entry.IssueIDs, *lines...)
		}
	}

	return entry, len(entry.Standup) > 0
}

// DatesFor is the week containing today — Monday to Sunday in the day's own
// location, stopped at today — or the week before it.
//
// Midnight is taken in the location before stepping, and stepping uses AddDate:
// a zone whose clocks change at midnight would otherwise land on 23:00 of the day
// before, and stepping by 24 hours across such a change yields the wrong dates.
func DatesFor(today otime.OTime, weeksAgo int) []otime.OTime {
	location := today.Location()
	day := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, location)
	day = day.AddDate(0, 0, -((int(today.Weekday()) + 6) % 7))

	if weeksAgo > 0 {
		day = day.AddDate(0, 0, -daysInWeek*weeksAgo)
	}

	dates := []otime.OTime{}
	for len(dates) < daysInWeek {
		if weeksAgo == 0 && day.After(today.Time) {
			break
		}

		dates = append(dates, otime.OTime{Time: day})
		day = day.AddDate(0, 0, 1)
	}

	return dates
}

// Generate loads the channel's configuration and builds the digest for a week.
// Today is resolved in the channel's own timezone, since that is the timezone the
// standups were filed under.
func Generate(channelID string, weeksAgo int) ([]string, error) {
	standupConfig, err := standup.GetStandupConfig(channelID)
	if err != nil {
		return nil, err
	}

	if standupConfig == nil {
		return nil, fmt.Errorf("standup not configured for channel: %s", channelID)
	}

	today := otime.Now(standupConfig.Timezone)

	return BuildDigest(Collect(standupConfig, weeksAgo, today)), nil
}

// displayName is what the digest calls someone. It is deliberately more relaxed
// than the reports' own helper: any failure to look an account up falls back to
// the user ID, because a name is not worth losing a week's digest over.
func displayName(userID string) string {
	user, appErr := config.Mattermost.GetUser(userID)
	if appErr != nil {
		logger.Debug("Couldn't fetch display name for user", appErr, map[string]string{"userID": userID})
		return userID
	}

	return user.GetDisplayName(model.ShowFullName)
}
