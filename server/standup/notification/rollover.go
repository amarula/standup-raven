package notification

import (
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/pkg/errors"

	"github.com/standup-raven/standup-raven/server/config"
	"github.com/standup-raven/standup-raven/server/logger"
	"github.com/standup-raven/standup-raven/server/otime"
	"github.com/standup-raven/standup-raven/server/standup"
	"github.com/standup-raven/standup-raven/server/util"
)

const (
	// rolloverDays is how many days running a line has to repeat before the
	// member who wrote it is asked about it.
	rolloverDays = 3

	// minSimilarTaskWords is how many significant words a line needs before it
	// says enough to be compared with another day's line: "standup" or "review"
	// on its own is not an item.
	minSimilarTaskWords = 3

	// similarTaskThreshold is the share of the shorter line's significant words
	// that has to appear in the longer one for the two to count as the same
	// item. Wording moves between days, so this compares words rather than text.
	similarTaskThreshold = 0.6

	// rolloverWarningInterval is how long a member is left alone after being
	// asked once, so that the warning cannot turn into a daily nag.
	rolloverWarningInterval = 7 * 24 * time.Hour

	rolloverWarningKeyPrefix = "rollover_warning_"
)

// sendRolloverWarnings asks members whose line has not moved for several days
// whether it is stuck. It is called when a standup window closes, which is the
// point at which the day's lines are final.
func sendRolloverWarnings(channelIDs []string) error {
	if len(channelIDs) == 0 {
		return nil
	}

	if conf := config.GetConfig(); conf != nil && !conf.RolloverWarnings {
		return nil
	}

	for _, channelID := range channelIDs {
		standupConfig, err := standup.GetStandupConfig(channelID)
		if err != nil {
			return err
		}
		if standupConfig == nil {
			continue
		}

		today := otime.Now(standupConfig.Timezone)
		for _, userID := range standupConfig.Members {
			if err := warnAboutRollover(userID, standupConfig, today); err != nil {
				logger.Error("Couldn't check a member's standup for rolled over lines", err, map[string]interface{}{
					"userID":    userID,
					"channelID": channelID,
				})
			}
		}
	}

	return nil
}

func warnAboutRollover(userID string, standupConfig *standup.Config, today otime.OTime) error {
	current, err := standup.GetUserStandup(userID, standupConfig.ChannelID, today)
	if err != nil {
		return err
	}
	if current == nil {
		return nil
	}

	section, task, found, err := repeatedTask(current, standupConfig, today)
	if err != nil || !found {
		return err
	}

	warned, err := rolloverWarningSent(userID, standupConfig.ChannelID)
	if err != nil || warned {
		return err
	}

	if err := sendRolloverWarning(userID, section, task); err != nil {
		return err
	}

	return markRolloverWarningSent(userID, standupConfig.ChannelID)
}

// repeatedTask finds a line that appears under the same section today and on
// each of the preceding days. Sections are walked in the order the channel
// configured them, so the same line always produces the same warning.
func repeatedTask(current *standup.UserStandup, standupConfig *standup.Config, today otime.OTime) (string, string, bool, error) {
	previousDays := make([]*standup.UserStandup, 0, rolloverDays-1)
	for daysAgo := 1; daysAgo < rolloverDays; daysAgo++ {
		previous, err := standup.GetUserStandup(
			current.UserID,
			standupConfig.ChannelID,
			otime.OTime{Time: today.AddDate(0, 0, -daysAgo)},
		)
		if err != nil {
			return "", "", false, err
		}

		previousDays = append(previousDays, previous)
	}

	for _, section := range standupConfig.Sections {
		lines, present := current.Standup[section]
		if !present || lines == nil {
			continue
		}

		for _, line := range *lines {
			task := strings.TrimSpace(line)
			if !sayEnough(task) {
				continue
			}

			repeated := true
			for _, previous := range previousDays {
				if !containsLine(previous, section, task) {
					repeated = false

					break
				}
			}

			if repeated {
				return section, task, true, nil
			}
		}
	}

	return "", "", false, nil
}

func containsLine(userStandup *standup.UserStandup, section, task string) bool {
	if userStandup == nil || userStandup.Standup == nil {
		return false
	}

	lines, present := userStandup.Standup[section]
	if !present || lines == nil {
		return false
	}

	for _, line := range *lines {
		if similarTask(line, task) {
			return true
		}
	}

	return false
}

// similarTask reports whether two lines describe the same item.
//
// Nobody writes the same sentence twice: "waiting on the API team" one day is
// "blocked by the API team response" the next. Lines are therefore compared by
// the significant words they share, ignoring order, case and the words that
// carry no information about which item is meant. A line has to share most of
// the shorter line's words to count, which keeps "fix the login bug" apart from
// "fix the deploy script".
func similarTask(first, second string) bool {
	firstWords, firstNumbers := significantWords(first)
	secondWords, secondNumbers := significantWords(second)

	if !sayEnough(first) || !sayEnough(second) {
		return false
	}

	// A number names a specific thing. Reviewing PR 402 and reviewing PR 519 are
	// different work however alike the rest of the line reads, so unless the two
	// lines share a number they are not the same item.
	if len(firstNumbers) > 0 && len(secondNumbers) > 0 && !sharesAny(firstNumbers, secondNumbers) {
		return false
	}

	shared := sharedWords(firstWords, secondWords) + sharedWords(firstNumbers, secondNumbers)

	shorter := len(firstWords) + len(firstNumbers)
	if other := len(secondWords) + len(secondNumbers); other < shorter {
		shorter = other
	}

	return float64(shared)/float64(shorter) >= similarTaskThreshold
}

// sayEnough reports whether a line says enough about which item it means to be
// compared with another day's line: "standup" on its own is not an item.
func sayEnough(line string) bool {
	words, numbers := significantWords(line)

	return len(words)+len(numbers) >= minSimilarTaskWords
}

func sharesAny(first, second map[string]bool) bool {
	return sharedWords(first, second) > 0
}

func sharedWords(first, second map[string]bool) int {
	shared := 0
	for word := range first {
		if second[word] {
			shared++
		}
	}

	return shared
}

// taskStopWords are the words that appear in any line and so say nothing about
// which item is being described.
var taskStopWords = map[string]bool{
	"a": true, "am": true, "an": true, "and": true, "any": true, "are": true,
	"as": true, "at": true, "be": true, "been": true, "but": true, "by": true,
	"for": true, "from": true, "had": true, "has": true, "have": true, "in": true,
	"into": true, "is": true, "it": true, "its": true, "just": true, "not": true,
	"of": true, "on": true, "or": true, "out": true, "own": true, "same": true,
	"still": true, "than": true, "that": true, "the": true, "then": true,
	"there": true, "this": true, "to": true, "too": true, "up": true, "was": true,
	"were": true, "with": true, "yet": true,
}

// significantWords splits a line into the words worth comparing, and the numbers
// it mentions. Words are lowercased, stripped of punctuation and one or two
// letter noise.
func significantWords(line string) (words map[string]bool, numbers map[string]bool) {
	words = map[string]bool{}
	numbers = map[string]bool{}

	for _, token := range strings.FieldsFunc(strings.ToLower(line), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	}) {
		if isNumber(token) {
			numbers[token] = true

			continue
		}

		if taskStopWords[token] || len(token) < 3 {
			continue
		}

		words[token] = true
	}

	return words, numbers
}

func isNumber(token string) bool {
	for _, r := range token {
		if !unicode.IsDigit(r) {
			return false
		}
	}

	return true
}

func sendRolloverWarning(userID, section, task string) error {
	botUserID := config.GetConfig().BotUserID

	channel, appErr := config.Mattermost.GetDirectChannel(botUserID, userID)
	if appErr != nil {
		return errors.New(appErr.Error())
	}

	post := &model.Post{
		ChannelId: channel.Id,
		UserId:    botUserID,
		Message: fmt.Sprintf(
			"You have had the same item under **%s** for %d days running:\n\n> %s\n\n"+
				"If it is stuck, the team may be able to help: `/standup update <section> <what is blocking you>` adds it to today's standup.",
			section,
			rolloverDays,
			task,
		),
	}

	if _, appErr := config.Mattermost.CreatePost(post); appErr != nil {
		return errors.New(appErr.Error())
	}

	return nil
}

func rolloverWarningKey(userID, channelID string) string {
	return util.GetKeyHash(rolloverWarningKeyPrefix + channelID + "_" + userID)
}

// rolloverWarningSent reports whether this member has been asked about this
// channel recently enough to leave them alone.
func rolloverWarningSent(userID, channelID string) (bool, error) {
	data, appErr := config.Mattermost.KVGet(rolloverWarningKey(userID, channelID))
	if appErr != nil {
		return false, errors.New(appErr.Error())
	}
	if len(data) == 0 {
		return false, nil
	}

	sentAt, err := strconv.ParseInt(string(data), 10, 64)
	if err != nil {
		// An unreadable timestamp is not a reason to stay quiet forever.
		return false, nil
	}

	return time.Since(time.UnixMilli(sentAt)) < rolloverWarningInterval, nil
}

func markRolloverWarningSent(userID, channelID string) error {
	sentAt := []byte(strconv.FormatInt(time.Now().UnixMilli(), 10))

	if appErr := config.Mattermost.KVSet(rolloverWarningKey(userID, channelID), sentAt); appErr != nil {
		return errors.New(appErr.Error())
	}

	return nil
}
