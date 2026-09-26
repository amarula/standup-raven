package notification

import (
	"strconv"
	"testing"
	"time"

	"bou.ke/monkey"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"

	"github.com/standup-raven/standup-raven/server/config"
	"github.com/standup-raven/standup-raven/server/otime"
	"github.com/standup-raven/standup-raven/server/standup"
)

func Test_repeatedTask(t *testing.T) {
	defer TearDown()
	mockAPI := setUp()
	baseMock(mockAPI)

	standupConfig := &standup.Config{
		ChannelID: "channel_id",
		Timezone:  "Asia/Kolkata",
		Sections:  []string{"Yesterday", "Today"},
	}
	today := otime.Now(standupConfig.Timezone)

	// lines recorded under the "Today" section, keyed by the date they were
	// recorded on
	history := map[string][]string{}
	monkey.Patch(standup.GetUserStandup, func(userID, channelID string, date otime.OTime) (*standup.UserStandup, error) {
		lines, recorded := history[date.GetDateString()]
		if !recorded {
			return nil, nil
		}

		held := lines

		return &standup.UserStandup{
			UserID:    userID,
			ChannelID: channelID,
			Standup:   map[string]*[]string{"Today": &held},
		}, nil
	})

	previousDays := func(daysAgo ...int) {
		history = map[string][]string{}
		for _, days := range daysAgo {
			history[otime.OTime{Time: today.AddDate(0, 0, -days)}.GetDateString()] = []string{"waiting on the API team"}
		}
	}
	todayWith := func(lines ...string) *standup.UserStandup {
		held := lines

		return &standup.UserStandup{
			UserID:    "user_id",
			ChannelID: standupConfig.ChannelID,
			Standup:   map[string]*[]string{"Today": &held},
		}
	}

	tests := []struct {
		name      string
		expect    string
		history   []int
		today     []string
		expectHit bool
	}{
		{
			name:      "the same line three days running",
			history:   []int{1, 2},
			today:     []string{"waiting on the API team"},
			expect:    "waiting on the API team",
			expectHit: true,
		},
		{
			name:      "the same line for only two days",
			history:   []int{1},
			today:     []string{"waiting on the API team"},
			expectHit: false,
		},
		{
			name:      "the same item written differently",
			history:   []int{1, 2},
			today:     []string{"API team still not responding"},
			expect:    "API team still not responding",
			expectHit: true,
		},
		{
			name:      "case and surrounding spaces do not hide a repeat",
			history:   []int{1, 2},
			today:     []string{"  Waiting On The API Team  "},
			expect:    "Waiting On The API Team",
			expectHit: true,
		},
		{
			name:      "a line that says too little",
			history:   []int{1, 2},
			today:     []string{"deploy hotfix"},
			expectHit: false,
		},
		{
			name:      "different items that share a word",
			history:   []int{1, 2},
			today:     []string{"fix the API timeout"},
			expectHit: false,
		},
		{
			name:      "no history at all",
			today:     []string{"waiting on the API team"},
			expectHit: false,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			previousDays(test.history...)

			section, task, found, err := repeatedTask(todayWith(test.today...), standupConfig, today)

			assert.Nil(t, err)
			assert.Equal(t, test.expectHit, found)
			if test.expectHit {
				assert.Equal(t, "Today", section)
				assert.Equal(t, test.expect, task)
			}
		})
	}
}

func Test_rolloverWarningSent(t *testing.T) {
	defer TearDown()
	mockAPI := setUp()
	baseMock(mockAPI)

	key := rolloverWarningKey("user_id", "channel_id")

	mockAPI.On("KVGet", key).Return(nil, nil).Once()
	sent, err := rolloverWarningSent("user_id", "channel_id")
	assert.Nil(t, err)
	assert.False(t, sent, "nothing recorded yet, so the member has not been asked")

	mockAPI.On("KVGet", key).Return([]byte(strconv.FormatInt(time.Now().UnixMilli(), 10)), nil).Once()
	sent, err = rolloverWarningSent("user_id", "channel_id")
	assert.Nil(t, err)
	assert.True(t, sent, "asked a moment ago, so leave them alone")

	mockAPI.On("KVGet", key).Return([]byte(strconv.FormatInt(time.Now().Add(-8*24*time.Hour).UnixMilli(), 10)), nil).Once()
	sent, err = rolloverWarningSent("user_id", "channel_id")
	assert.Nil(t, err)
	assert.False(t, sent, "asked more than a week ago, so ask again")

	mockAPI.On("KVGet", key).Return([]byte("not a timestamp"), nil).Once()
	sent, err = rolloverWarningSent("user_id", "channel_id")
	assert.Nil(t, err)
	assert.False(t, sent, "an unreadable timestamp does not silence the warning")
}

func Test_markRolloverWarningSent(t *testing.T) {
	defer TearDown()
	mockAPI := setUp()
	baseMock(mockAPI)

	key := rolloverWarningKey("user_id", "channel_id")

	var recorded []byte
	mockAPI.On("KVSet", key, mock.Anything).Run(func(args mock.Arguments) {
		recorded = args.Get(1).([]byte)
	}).Return(nil)

	err := markRolloverWarningSent("user_id", "channel_id")

	assert.Nil(t, err)
	if assert.NotEmpty(t, recorded) {
		sentAt, parseErr := strconv.ParseInt(string(recorded), 10, 64)
		assert.Nil(t, parseErr, "the recorded value is a timestamp")
		assert.WithinDuration(t, time.Now(), time.UnixMilli(sentAt), time.Minute)
	}
}

func Test_sendRolloverWarning(t *testing.T) {
	defer TearDown()
	mockAPI := setUp()
	baseMock(mockAPI)

	config.GetConfig().BotUserID = "bot_user_id"

	var posted *model.Post
	mockAPI.On("GetDirectChannel", "bot_user_id", "user_id").Return(&model.Channel{Id: "dm_channel_id"}, nil)
	mockAPI.On("CreatePost", mock.AnythingOfType("*model.Post")).Run(func(args mock.Arguments) {
		posted = args.Get(0).(*model.Post)
	}).Return(&model.Post{Id: "post_id"}, nil)

	err := sendRolloverWarning("user_id", "Today", "waiting on the API team")

	assert.Nil(t, err)
	if assert.NotNil(t, posted) {
		assert.Equal(t, "dm_channel_id", posted.ChannelId)
		assert.Equal(t, "bot_user_id", posted.UserId)
		assert.Contains(t, posted.Message, "waiting on the API team")
		assert.Contains(t, posted.Message, "Today")
		assert.Contains(t, posted.Message, "/standup update", "the member is told how to act on it")
	}
}

// The matching is a heuristic, so the cases it handles and the cases it does not
// are both spelled out here.
func Test_similarTask(t *testing.T) {
	tests := []struct {
		name   string
		first  string
		second string
		expect bool
	}{
		{
			name:   "the same line",
			first:  "waiting on the API team",
			second: "waiting on the API team",
			expect: true,
		},
		{
			name:   "case and punctuation do not matter",
			first:  "Waiting on the API team!",
			second: "waiting on the api team",
			expect: true,
		},
		{
			name:   "word order does not matter",
			first:  "API team waiting on response",
			second: "waiting on response from API team",
			expect: true,
		},
		{
			name:   "the same item described in other words",
			first:  "waiting on the API team",
			second: "API team still not responding",
			expect: true,
		},
		{
			name:   "one line grows a detail",
			first:  "reviewing the deploy script",
			second: "reviewing the deploy script before the release",
			expect: true,
		},
		{
			name:   "filler words are ignored",
			first:  "waiting on the API team",
			second: "still waiting on the API team for now",
			expect: true,
		},
		{
			name:   "different items that share a word",
			first:  "waiting on the API team",
			second: "fix the API timeout",
			expect: false,
		},
		{
			name:   "a line that says too little",
			first:  "deploy hotfix",
			second: "deploy the hotfix now please",
			expect: false,
		},
		{
			name:   "synonyms are not understood",
			first:  "the login service is unreliable",
			second: "authentication service is flaky again",
			expect: false,
		},
		{
			name:   "the same area but a different pull request",
			first:  "reviewing payments PR 402",
			second: "reviewing payments PR 519",
			expect: false,
		},
		{
			name:   "the same pull request",
			first:  "reviewing payments PR 402",
			second: "reviewing payments PR 402 again",
			expect: true,
		},
		{
			name:   "related work on the same thing is treated as the same item",
			first:  "reviewing the deploy script",
			second: "rewriting the deploy script",
			expect: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			assert.Equal(t, test.expect, similarTask(test.first, test.second))
		})
	}
}
