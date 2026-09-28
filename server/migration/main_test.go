package migration

import (
	"encoding/json"
	"errors"
	"testing"
	"time"

	"bou.ke/monkey"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"

	"github.com/standup-raven/standup-raven/server/config"
	"github.com/standup-raven/standup-raven/server/logger"
	"github.com/standup-raven/standup-raven/server/otime"
	"github.com/standup-raven/standup-raven/server/standup"
	"github.com/standup-raven/standup-raven/server/util"
)

func baseMock() *plugintest.API {
	mockAPI := &plugintest.API{}
	config.Mattermost = mockAPI

	monkey.Patch(logger.Debug, func(msg string, err error, keyValuePairs ...interface{}) {})
	monkey.Patch(logger.Error, func(msg string, err error, extraData map[string]interface{}) {})

	location, _ := time.LoadLocation("Asia/Kolkata")
	mockConfig := &config.Configuration{
		Location:      location,
		PluginVersion: version3_0_0,
	}

	// mocks for mutex
	mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil)

	config.SetConfig(mockConfig)
	return mockAPI
}

func TearDown() {
	monkey.UnpatchAll()
}

// schemaVersionStore makes KVGet and KVSet work against a map instead of a
// fixed value, so a test can watch the schema version the runner writes and see
// what it leaves behind.
func schemaVersionStore(mockAPI *plugintest.API, initial string) (string, map[string][]byte) {
	key := util.GetKeyHash(databaseSchemaVersion)
	values := make(map[string][]byte)
	if initial != "" {
		encoded, _ := json.Marshal(initial)
		values[key] = encoded
	}

	mockAPI.On("KVGet", mock.Anything).Return(
		func(k string) []byte { return values[k] },
		func(k string) *model.AppError { return nil },
	)
	mockAPI.On("KVSet", mock.Anything, mock.Anything).Return(
		func(k string, value []byte) *model.AppError {
			values[k] = value
			return nil
		},
	)

	return key, values
}

// A start whose stored version differs from the build's walks the whole
// migration list. A migration that only bumps the version would then stamp its
// own, older version on the way past, walking the key back to 2.0.0 and arming
// the guard the next data migration reads: upgradeDatabaseToVersion3_0_0 would
// run again over data that is already at 4.1.1, rewriting every channel's
// recurrence to the default work week and archiving the channels whose
// configuration it cannot validate.
func TestDatabaseMigration_DoesNotRerunAnAppliedDataMigration(t *testing.T) {
	defer TearDown()
	mockAPI := baseMock()
	key, values := schemaVersionStore(mockAPI, version4_1_1)

	// The channel scan is the first thing upgradeDatabaseToVersion3_0_0 does, and
	// failing it fails the run, so the migration cannot go on from here to read
	// the configuration and rewrite every channel.
	channelsScanned := false
	monkey.Patch(standup.GetStandupChannels, func() (map[string]string, error) {
		channelsScanned = true
		return nil, errors.New("the 3.0.0 data migration scanned the channels again")
	})

	conf := config.GetConfig()
	conf.PluginVersion = version4_2_0
	config.SetConfig(conf)

	assert.Nil(t, DatabaseMigration())
	assert.False(t, channelsScanned, "the 3.0.0 data migration ran over data already at 4.1.1")

	var stored string
	assert.Nil(t, json.Unmarshal(values[key], &stored))
	assert.Equal(t, version4_2_0, stored)
}

// The other half of skipping applied migrations: an installation behind the
// build still goes through every migration it has not been through. 1.5.0 is
// the oldest version the 4.2.0 entry lets in, so the channel migration is the
// first one it has to run.
func TestDatabaseMigration_RunsTheMigrationsAnInstallationIsBehindOn(t *testing.T) {
	defer TearDown()
	mockAPI := baseMock()
	key, values := schemaVersionStore(mockAPI, version1_5_0)

	monkey.Patch(generateRRuleStringByWorkWeek, func() (string, error) {
		return "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR", nil
	})
	mockAPI.On("LogInfo", mock.Anything).Return()

	channelsScanned := false
	monkey.Patch(standup.GetStandupChannels, func() (map[string]string, error) {
		channelsScanned = true
		return map[string]string{}, nil
	})

	conf := config.GetConfig()
	conf.PluginVersion = version4_2_0
	config.SetConfig(conf)

	assert.Nil(t, DatabaseMigration())
	assert.True(t, channelsScanned, "the 3.0.0 data migration did not run for an installation at 1.5.0")

	var stored string
	assert.Nil(t, json.Unmarshal(values[key], &stored))
	assert.Equal(t, version4_2_0, stored)
}

func TestDatebaseMigration_getCurrentSchemaVersion_Error(t *testing.T) {
	defer TearDown()
	baseMock()
	monkey.Patch(getCurrentSchemaVersion, func() (string, error) {
		return "", errors.New("")
	})

	err := DatabaseMigration()
	assert.NotNil(t, err)
}

func TestDatabaseMigration_KVGet_error(t *testing.T) {
	defer TearDown()
	mockAPI := baseMock()
	mockAPI.On("KVGet", "mS93mHcYcKvlwjnt1DvUXsRwcIuoOO+mKsCRNZl/Ht4=", mock.Anything).Return(nil, model.NewAppError("", "", nil, "", 0))
	err := DatabaseMigration()
	assert.NotNil(t, err)
}

func TestDatabaseMigration_EnsureSchemaVersion_error(t *testing.T) {
	defer TearDown()
	mockAPI := baseMock()
	mockAPI.On("KVGet", "mS93mHcYcKvlwjnt1DvUXsRwcIuoOO+mKsCRNZl/Ht4=", mock.Anything).Return(nil, model.NewAppError("", "", nil, "", 0))
	err := DatabaseMigration()
	assert.NotNil(t, err)
}

func TestDatabaseMigration_KVSet_error(t *testing.T) {
	defer TearDown()
	mockAPI := baseMock()
	mockAPI.On("KVGet", "mS93mHcYcKvlwjnt1DvUXsRwcIuoOO+mKsCRNZl/Ht4=", mock.Anything).Return(nil, nil)
	mockAPI.On("KVSet", mock.Anything, mock.Anything).Return(model.NewAppError("", "", nil, "", 0))
	err := DatabaseMigration()
	assert.NotNil(t, err)
}

func TestDatabaseMigration_JsonMarshal_Error(t *testing.T) {
	defer TearDown()
	mockAPI := baseMock()
	mockAPI.On("KVGet", "mS93mHcYcKvlwjnt1DvUXsRwcIuoOO+mKsCRNZl/Ht4=", mock.Anything).Return(nil, nil)
	monkey.Patch(json.Marshal, func(v interface{}) ([]byte, error) {
		return nil, errors.New("")
	})
	err := DatabaseMigration()
	assert.NotNil(t, err)
}

func TestDatabaseMigration_JsonUnmarshal_Error(t *testing.T) {
	defer TearDown()
	mockAPI := baseMock()
	mockAPI.On("KVGet", "mS93mHcYcKvlwjnt1DvUXsRwcIuoOO+mKsCRNZl/Ht4=", mock.Anything).Return([]byte("1.4.0"), nil)
	mockAPI.On("KVSet", mock.Anything, mock.Anything).Return(nil)
	monkey.Patch(json.Unmarshal, func(data []byte, v interface{}) error {
		return errors.New("")
	})
	err := DatabaseMigration()
	assert.NotNil(t, err)
}

func TestDatabaseMigration_GetStandupChannels_Error(t *testing.T) {
	defer TearDown()
	mockAPI := baseMock()
	mockAPI.On("KVGet", "mS93mHcYcKvlwjnt1DvUXsRwcIuoOO+mKsCRNZl/Ht4=", mock.Anything).Return([]byte("1.4.0"), nil)
	mockAPI.On("KVSet", mock.Anything, mock.Anything).Return(nil)

	monkey.Patch(getCurrentSchemaVersion, func() (string, error) {
		return "1.4.0", nil
	})
	monkey.Patch(standup.GetStandupChannels, func() (map[string]string, error) {
		return nil, errors.New("")
	})
	err := DatabaseMigration()
	assert.NotNil(t, err)
}

func TestDatabaseMigration_GetStandupConfig_Error(t *testing.T) {
	defer TearDown()
	mockAPI := baseMock()
	mockAPI.On("KVGet", "mS93mHcYcKvlwjnt1DvUXsRwcIuoOO+mKsCRNZl/Ht4=", mock.Anything).Return([]byte("1.4.0"), nil)
	mockAPI.On("KVSet", mock.Anything, mock.Anything).Return(nil)

	monkey.Patch(getCurrentSchemaVersion, func() (string, error) {
		return "1.4.0", nil
	})
	monkey.Patch(standup.GetStandupChannels, func() (map[string]string, error) {
		return map[string]string{
			"channel_1": "channel_1",
		}, nil
	})
	monkey.Patch(standup.GetStandupConfig, func(channelID string) (*standup.Config, error) {
		return nil, errors.New("")
	})
	err := DatabaseMigration()
	assert.NotNil(t, err)
}

func TestDatabaseMigration_GetStandupConfig_Nil(t *testing.T) {
	defer TearDown()
	mockAPI := baseMock()
	mockAPI.On("KVSet", mock.Anything, mock.Anything).Return(nil)

	conf := config.GetConfig()
	conf.PluginVersion = version1_5_0
	config.SetConfig(conf)

	monkey.Patch(getCurrentSchemaVersion, func() (string, error) {
		return "1.4.0", nil
	})
	monkey.Patch(standup.GetStandupChannels, func() (map[string]string, error) {
		return map[string]string{
			"channel_1": "channel_1",
		}, nil
	})
	monkey.Patch(standup.GetStandupConfig, func(channelID string) (*standup.Config, error) {
		return nil, nil
	})
	err := DatabaseMigration()
	assert.Nil(t, err)
}

func TestDatabaseMigration_SaveStandupConfig_Error(t *testing.T) {
	defer TearDown()
	baseMock()

	monkey.Patch(getCurrentSchemaVersion, func() (string, error) {
		return "1.4.0", nil
	})
	monkey.Patch(standup.GetStandupChannels, func() (map[string]string, error) {
		return map[string]string{
			"channel_1": "channel_1",
		}, nil
	})
	monkey.Patch(standup.GetStandupConfig, func(channelID string) (*standup.Config, error) {
		windowOpenTime := otime.OTime{
			Time: otime.Now("Asia/Kolkata").Add(-1 * time.Hour),
		}

		windowCloseTime := otime.OTime{
			Time: otime.Now("Asia/Kolkata").Add(1 * time.Minute),
		}

		return &standup.Config{
			ChannelID:       "channel_2",
			WindowOpenTime:  windowOpenTime,
			WindowCloseTime: windowCloseTime,
			Enabled:         true,
			Members:         []string{"user_id_1", "user_id_2"},
			ReportFormat:    config.ReportFormatUserAggregated,
			Sections:        []string{"section 1", "section 2"},
			Timezone:        "Asia/Kolkata",
		}, nil
	})

	monkey.Patch(standup.SaveStandupConfig, func(standupConfig *standup.Config) (*standup.Config, error) {
		return nil, errors.New("")
	})

	err := DatabaseMigration()
	assert.NotNil(t, err)
}

func TestDatabaseMigration_(t *testing.T) {
	mockAPI := baseMock()
	mockAPI.On("KVGet", "mS93mHcYcKvlwjnt1DvUXsRwcIuoOO+mKsCRNZl/Ht4=", mock.Anything).Return([]byte("1.4.0"), nil)
	mockAPI.On("KVSet", mock.Anything, mock.Anything).Return(nil)

	conf := config.GetConfig()
	conf.PluginVersion = version1_5_0
	config.SetConfig(conf)

	monkey.Patch(getCurrentSchemaVersion, func() (string, error) {
		return "1.4.0", nil
	})
	monkey.Patch(standup.GetStandupChannels, func() (map[string]string, error) {
		return map[string]string{
			"channel_1": "channel_1",
		}, nil
	})
	monkey.Patch(standup.GetStandupConfig, func(channelID string) (*standup.Config, error) {
		return nil, nil
	})
	err := DatabaseMigration()
	assert.Nil(t, err)
}

func TestDatabaseMigration_updateSchemaVersion_Error(t *testing.T) {
	defer TearDown()
	baseMock()

	monkey.Patch(getCurrentSchemaVersion, func() (string, error) {
		return "1.4.0", nil
	})
	monkey.Patch(standup.GetStandupChannels, func() (map[string]string, error) {
		return map[string]string{
			"channel_1": "channel_1",
		}, nil
	})
	monkey.Patch(standup.GetStandupConfig, func(channelID string) (*standup.Config, error) {
		return nil, nil
	})
	monkey.Patch(json.Marshal, func(v interface{}) ([]byte, error) {
		return nil, errors.New("")
	})
	err := DatabaseMigration()
	assert.NotNil(t, err)
}

func TestDatabaseMigration_updateSchemaVersion_KVSet_Error(t *testing.T) {
	defer TearDown()
	mockAPI := baseMock()
	mockAPI.On("KVSet", mock.Anything, mock.Anything).Return(model.NewAppError("", "", nil, "", 0))

	monkey.Patch(getCurrentSchemaVersion, func() (string, error) {
		return "1.4.0", nil
	})
	monkey.Patch(standup.GetStandupChannels, func() (map[string]string, error) {
		return map[string]string{
			"channel_1": "channel_1",
		}, nil
	})
	monkey.Patch(standup.GetStandupConfig, func(channelID string) (*standup.Config, error) {
		return nil, nil
	})
	err := DatabaseMigration()
	assert.NotNil(t, err)
}

func TestDatabaseMigration_getSChemaVersion_Error(t *testing.T) {
	defer TearDown()
	baseMock()

	monkey.Patch(getCurrentSchemaVersion, func() (string, error) {
		return "", errors.New("")
	})

	conf := config.GetConfig()
	conf.PluginVersion = version1_5_0
	config.SetConfig(conf)

	err := DatabaseMigration()
	assert.NotNil(t, err)
}
