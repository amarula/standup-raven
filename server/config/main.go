package config

import (
	"encoding/json"
	"strings"
	"sync/atomic"
	"time"

	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/standup-raven/standup-raven/server/otime"
)

const (
	PluginName                   = "standup-raven"
	CommandPrefix                = "standup"
	ServerExeToStaticDirRootPath = "/../webapp/static"

	URLPluginBase = "/plugins/" + PluginName
	URLStaticBase = URLPluginBase

	// PathOpenStandup is the endpoint the standup prompt's button posts to. It is
	// declared here because both the controller that serves it and the
	// notification that links to it need the same value.
	PathOpenStandup = "/open-standup"

	HeaderMattermostUserID = "Mattermost-User-Id"

	ReportFormatUserAggregated = "user_aggregated"
	ReportFormatTypeAggregated = "type_aggregated"

	CacheKeyPrefixNotificationStatus = "notif_status"
	CacheKeyPrefixTeamStandupConfig  = "standup_config_"

	CacheKeyAllStandupChannels = "all_standup_channels"

	WindowCloseNotificationDurationPercentage = 0.8 // 80%

	UserIconURL  = "/api/v4/users/%s/image"
	UserIconSize = "=20x20"

	// Ensure two full cycles can run in a under a minute
	// to handle the special case of 23:59 window close time.
	// If first cycle starts at 23:58:59, second at 23:59:xx1,
	// third will probably run at 00:00:xx2 causing no automated standup reports as
	// the date changed between 23:59 and 00:00:xx2.
	RunnerInterval = 25 * time.Second

	BotUsername     = "raven"
	BotDisplayName  = "Raven"
	OverrideIconURL = URLStaticBase + "/logo.png"
)

var (
	config        atomic.Pointer[Configuration]
	Mattermost    plugin.API
	ReportFormats = []string{ReportFormatUserAggregated, ReportFormatTypeAggregated}
)

type Configuration struct {
	// derived attributes
	Location        *time.Location `json:"location"`
	BotUserID       string         `json:"botUserId"`
	SentryServerDSN string         `json:"sentryServerDSN"`
	SentryWebappDSN string         `json:"sentryWebappDSN"`

	TimeZone                string `json:"timeZone"`
	PluginVersion           string `json:"plugin_version"`
	PermissionSchemaEnabled bool   `json:"permissionSchemaEnabled"`
	EnableErrorReporting    bool   `json:"enableErrorReporting"`
	RespectOutOfOffice      bool   `json:"respectOutOfOffice"`
}

func GetConfig() *Configuration {
	return config.Load()
}

func SetConfig(c *Configuration) {
	config.Store(c)
}

func (c *Configuration) ProcessConfiguration() error {
	location, err := time.LoadLocation(c.TimeZone)
	if err != nil {
		Mattermost.LogError("Couldn't load location in time " + err.Error())
		return err
	}

	c.SentryServerDSN = strings.TrimSpace(c.SentryServerDSN)
	c.SentryWebappDSN = strings.TrimSpace(c.SentryWebappDSN)

	// Error reporting is opt-in. Builds without a Sentry DSN baked in at build
	// time previously failed activation outright, because the settings schema
	// defaults enableErrorReporting to true.
	if c.EnableErrorReporting && (len(c.SentryServerDSN) == 0 || len(c.SentryWebappDSN) == 0) {
		Mattermost.LogWarn("Error reporting is enabled but no Sentry DSN is configured, disabling error reporting")
		c.EnableErrorReporting = false
	}

	c.Location = location
	otime.DefaultLocation = location
	return nil
}

func (c *Configuration) ToJSON() []byte {
	data, _ := json.Marshal(c)
	return data
}

func (c *Configuration) Clone() *Configuration {
	var clone Configuration
	_ = json.Unmarshal(c.ToJSON(), &clone)
	return &clone
}

func (c *Configuration) Sanitize() *Configuration {
	clone := c.Clone()
	clone.BotUserID = ""
	clone.Location = nil
	clone.SentryServerDSN = ""
	return clone
}
