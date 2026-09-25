package main

import (
	"errors"
	"os"
	"testing"

	"bou.ke/monkey"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/stretchr/testify/assert"

	"github.com/standup-raven/standup-raven/server/config"
)

func TearDown() {
	monkey.UnpatchAll()
}

// PluginVersion is only set by the release ldflags. Slicing it blindly used to
// panic on any other build, so both shapes are covered here.
func TestSetInjectedVars_EmptyPluginVersion(t *testing.T) {
	previousVersion := PluginVersion
	PluginVersion = ""
	defer func() { PluginVersion = previousVersion }()

	p := &Plugin{}
	configuration := &config.Configuration{}

	assert.NotPanics(t, func() {
		p.setInjectedVars(configuration)
	})
	assert.Equal(t, "", configuration.PluginVersion)
}

func TestSetInjectedVars_StripsVersionPrefix(t *testing.T) {
	previousVersion := PluginVersion
	PluginVersion = "v4.0.0"
	defer func() { PluginVersion = previousVersion }()

	p := &Plugin{}
	configuration := &config.Configuration{}

	p.setInjectedVars(configuration)
	assert.Equal(t, "4.0.0", configuration.PluginVersion)
}

func TestSetUpBot(t *testing.T) {
	defer TearDown()
	bot := &model.Bot{
		Username:    config.BotUsername,
		DisplayName: config.BotDisplayName,
		Description: "Bot for Standup Raven.",
	}
	p := &Plugin{}
	api := &plugintest.API{}
	api.On("EnsureBotUser", bot).Return("botID", nil)
	api.On("GetBundlePath").Return("tmp/", nil)
	monkey.Patch(os.ReadFile, func(filename string) ([]byte, error) {
		return []byte{}, nil
	})
	api.On("SetProfileImage", "botID", []byte{}).Return(nil)
	p.SetAPI(api)
	_, err := p.setUpBot()
	assert.Nil(t, err, "no error should have been produced")
}

func TestSetUpBot_EnsureBot_Error(t *testing.T) {
	defer TearDown()
	bot := &model.Bot{
		Username:    config.BotUsername,
		DisplayName: config.BotDisplayName,
		Description: "Bot for Standup Raven.",
	}
	p := &Plugin{}
	api := &plugintest.API{}
	api.On("EnsureBotUser", bot).Return("", errors.New(""))
	p.SetAPI(api)

	_, err := p.setUpBot()
	assert.NotNil(t, err)
}

func TestSetUpBot_GetBundlePath_Error(t *testing.T) {
	defer TearDown()
	bot := &model.Bot{
		Username:    config.BotUsername,
		DisplayName: config.BotDisplayName,
		Description: "Bot for Standup Raven.",
	}
	p := &Plugin{}
	api := &plugintest.API{}
	api.On("EnsureBotUser", bot).Return("botID", nil)
	api.On("GetBundlePath").Return("", errors.New(""))
	p.SetAPI(api)
	_, err := p.setUpBot()
	assert.NotNil(t, err)
}

func TestSetUpBot_Readfile_Error(t *testing.T) {
	defer TearDown()
	bot := &model.Bot{
		Username:    config.BotUsername,
		DisplayName: config.BotDisplayName,
		Description: "Bot for Standup Raven.",
	}
	p := &Plugin{}
	api := &plugintest.API{}
	api.On("EnsureBotUser", bot).Return("botID", nil)
	api.On("GetBundlePath").Return("tmp/", nil)
	p.SetAPI(api)
	monkey.Patch(os.ReadFile, func(filename string) ([]byte, error) {
		return nil, errors.New("")
	})
	_, err := p.setUpBot()
	assert.NotNil(t, err)
}

func TestSetUpBot_SetProfileImage_Error(t *testing.T) {
	defer TearDown()
	bot := &model.Bot{
		Username:    config.BotUsername,
		DisplayName: config.BotDisplayName,
		Description: "Bot for Standup Raven.",
	}
	p := &Plugin{}
	api := &plugintest.API{}
	api.On("EnsureBotUser", bot).Return("botID", nil)
	api.On("GetBundlePath").Return("tmp/", nil)
	monkey.Patch(os.ReadFile, func(filename string) ([]byte, error) {
		return []byte{}, nil
	})
	api.On("SetProfileImage", "botID", []byte{}).Return(&model.AppError{})
	p.SetAPI(api)
	_, err := p.setUpBot()
	assert.NotNil(t, err)
}
