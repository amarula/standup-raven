package migration

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
)

// A release has to be named in the upgrade table, or DatabaseMigration refuses
// to run and the plugin never starts after an upgrade. The 4.x versions were
// bumped in plugin.json without an entry here and did exactly that: an
// installation on 3.3.2 got "Cannot upgrade Standup Raven from version 3.3.2 to
// 4.1.0" and a plugin that would not activate.
func Test_CurrentPluginVersionIsInTheUpgradeTable(t *testing.T) {
	manifest, err := os.ReadFile("../../plugin.json")
	if err != nil {
		t.Fatalf("couldn't read plugin.json: %s", err)
	}

	var parsed struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(manifest, &parsed); err != nil {
		t.Fatalf("couldn't parse plugin.json: %s", err)
	}

	if !assert.NotEmpty(t, parsed.Version, "plugin.json has no version") {
		return
	}

	assert.Contains(t, upgradeCompatibility, parsed.Version,
		"plugin.json is at %s, which the upgrade table does not name: add it there and to the migrations list",
		parsed.Version)

	assert.NotEmpty(t, upgradeCompatibility[parsed.Version],
		"the upgrade table names no version that %s can upgrade from, so no installation could install it",
		parsed.Version)

	// The lists are cumulative: every version the table still names can come
	// straight to the current one, so an installation left behind on the oldest
	// supported release is never stranded.
	assert.True(t, isUpgradeCompatible(version1_5_0, parsed.Version),
		"an installation on %s cannot upgrade to %s", version1_5_0, parsed.Version)
}
