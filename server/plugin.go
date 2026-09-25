package main

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	// Embed the timezone database so the plugin does not depend on the host
	// shipping /usr/share/zoneinfo.
	_ "time/tzdata"

	"github.com/getsentry/sentry-go"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
	"github.com/mattermost/mattermost/server/public/pluginapi/cluster"

	"github.com/standup-raven/standup-raven/server/logger"
	"github.com/standup-raven/standup-raven/server/migration"
	"github.com/standup-raven/standup-raven/server/otime"
	"github.com/standup-raven/standup-raven/server/standup/notification"

	"github.com/standup-raven/standup-raven/server/command"
	"github.com/standup-raven/standup-raven/server/config"
	"github.com/standup-raven/standup-raven/server/controller"
	"github.com/standup-raven/standup-raven/server/util"
)

// ldflag variables

var PluginVersion string
var SentryServerDSN string
var SentryWebappDSN string
var EncodedPluginIcon string

type Plugin struct {
	plugin.MattermostPlugin
	handler http.Handler
	job     *cluster.Job
}

func (p *Plugin) OnActivate() error {
	config.Mattermost = p.API
	otime.OnInvalidTimezone = func(timezone string, err error) {
		logger.Error("Couldn't load timezone "+timezone, err, nil)
	}

	if err := p.OnConfigurationChange(); err != nil {
		return err
	}

	if err := migration.DatabaseMigration(); err != nil {
		return err
	}

	if err := p.setupStaticFileServer(); err != nil {
		return err
	}

	if err := p.RegisterCommands(); err != nil {
		return err
	}

	if err := p.Run(); err != nil {
		return err
	}

	return nil
}

func (p *Plugin) setUpBot() (string, error) {
	botID, err := p.API.EnsureBotUser(&model.Bot{
		Username:    config.BotUsername,
		DisplayName: config.BotDisplayName,
		Description: "Bot for Standup Raven.",
	})
	if err != nil {
		return "", err
	}

	bundlePath, err := p.API.GetBundlePath()
	if err != nil {
		return "", err
	}

	// The path is the server-provided bundle path plus a constant filename, so
	// there is no attacker-controlled input here.
	profileImage, err := os.ReadFile(filepath.Join(bundlePath, "webapp/static/logo.png")) //nolint:gosec // path is not user controlled
	if err != nil {
		return "", err
	}

	appErr := p.API.SetProfileImage(botID, profileImage)
	if appErr != nil {
		return "", appErr
	}

	return botID, nil
}

func (p *Plugin) setupStaticFileServer() error {
	exe, err := os.Executable()
	if err != nil {
		logger.Error("Couldn't find plugin executable path", err, nil)
		return err
	}
	p.handler = http.FileServer(http.Dir(filepath.Dir(exe) + config.ServerExeToStaticDirRootPath))
	return nil
}

func (p *Plugin) OnConfigurationChange() error {
	if config.Mattermost != nil {
		var configuration config.Configuration

		botID, err := p.setUpBot()
		if err != nil {
			return err
		}
		configuration.BotUserID = botID

		if err := config.Mattermost.LoadPluginConfiguration(&configuration); err != nil {
			logger.Error("Error occurred during loading plugin configuration from Mattermost", err, nil)
			return err
		}

		p.setInjectedVars(&configuration)

		if err := configuration.ProcessConfiguration(); err != nil {
			config.Mattermost.LogError(err.Error())
			return err
		}
		config.SetConfig(&configuration)

		if err := p.initSentry(); err != nil {
			config.Mattermost.LogError(err.Error())
		}
	}
	return nil
}

func (p *Plugin) setInjectedVars(configuration *config.Configuration) {
	// PluginVersion is injected at build time as "vX.Y.Z". It is empty in builds
	// that skip the release ldflags, so strip the prefix only when it is there
	// instead of panicking on an out of range slice.
	configuration.PluginVersion = strings.TrimPrefix(PluginVersion, "v")
	configuration.SentryWebappDSN = SentryWebappDSN
	configuration.SentryServerDSN = SentryServerDSN
}

func (p *Plugin) RegisterCommands() error {
	if err := config.Mattermost.RegisterCommand(&model.Command{
		Trigger:              config.CommandPrefix,
		AutoComplete:         true,
		Username:             config.BotUsername,
		AutocompleteData:     command.Master().AutocompleteData,
		AutocompleteIconData: EncodedPluginIcon,
	}); err != nil {
		logger.Error("couldn't register command", err, map[string]interface{}{"command": command.Master().AutocompleteData.Trigger})
		return err
	}

	return nil
}

func (p *Plugin) ExecuteCommand(c *plugin.Context, args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	// cant use strings.split as it includes empty string if deliminator
	// is the last character in input string
	split, argErr := util.SplitArgs(args.Command)
	if argErr != nil {
		return &model.CommandResponse{
			Type: model.CommandResponseTypeEphemeral,
			Text: argErr.Error(),
		}, nil
	}

	function := split[0]
	var params []string

	if len(split) > 1 {
		params = split[1:]
	}

	if function != "/"+command.Master().AutocompleteData.Trigger {
		return nil, &model.AppError{Message: "Unknown command: [" + function + "] encountered"}
	}

	context := p.prepareContext(args)
	if response, err := command.Master().Validate(params, context); response != nil {
		return response, err
	}

	// todo add error logs here
	return command.Master().Execute(params, context)
}

func (p *Plugin) prepareContext(args *model.CommandArgs) command.Context {
	return command.Context{
		CommandArgs: args,
		Props:       make(map[string]interface{}),
	}
}

func (p *Plugin) ServeHTTP(c *plugin.Context, w http.ResponseWriter, r *http.Request) {
	d := util.DumpRequest(r)
	endpoint := controller.GetEndpoint(r)

	if endpoint == nil {
		p.handler.ServeHTTP(w, r)
		return
	}

	requestToUse := r
	// running endpoint middlewares
	for _, middleware := range endpoint.Middlewares {
		var appErr *model.AppError

		requestToUse, appErr = middleware(w, requestToUse)
		if appErr != nil {
			http.Error(w, appErr.DetailedError, appErr.StatusCode)
			return
		}
	}

	if err := endpoint.Execute(w, requestToUse); err != nil {
		logger.Error("Error occurred processing "+requestToUse.URL.String(), err, map[string]interface{}{"request": d})
		sentry.WithScope(func(scope *sentry.Scope) {
			sentry.CaptureException(err)
		})
	}
}

// runScheduledReport runs one notification/report cycle. A panic here used to
// kill the plugin process, leaving the server proxying requests to a dead
// plugin, so it is contained to a single cycle instead.
func (p *Plugin) runScheduledReport() {
	defer func() {
		if r := recover(); r != nil {
			err := fmt.Errorf("recovered from panic in standup scheduler: %v", r)
			logger.Error(err.Error(), err, nil)
		}
	}()

	if err := notification.SendNotificationsAndReports(); err != nil {
		logger.Error("Failed to send notification/report. Error: "+err.Error(), err, nil)
	}
}

func (p *Plugin) Run() error {
	if p.job != nil {
		if err := p.job.Close(); err != nil {
			return err
		}
	}

	job, err := cluster.Schedule(
		config.Mattermost,
		"StandupRavenReportScheduler",
		cluster.MakeWaitForInterval(config.RunnerInterval),
		p.runScheduledReport,
	)

	if err != nil {
		p.API.LogError(fmt.Sprintf("Unable to schedule job for standup reports. Error: {%s}", err.Error()))
		return err
	}

	p.job = job
	return nil
}

func (p *Plugin) initSentry() error {
	conf := config.GetConfig()

	if !conf.EnableErrorReporting {
		return nil
	}

	err := sentry.Init(sentry.ClientOptions{
		Dsn: conf.SentryServerDSN,
	})

	if err != nil {
		return err
	}

	sentry.ConfigureScope(func(scope *sentry.Scope) {
		scope.SetTag("pluginComponent", "server")
	})

	return err
}

func main() {
	plugin.ClientMain(&Plugin{})
}
