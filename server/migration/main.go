package migration

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/mattermost/mattermost/server/public/pluginapi/cluster"
	"github.com/thoas/go-funk"

	"github.com/standup-raven/standup-raven/server/config"
	"github.com/standup-raven/standup-raven/server/logger"
	"github.com/standup-raven/standup-raven/server/util"
)

var (
	databaseSchemaVersion = "database_schema_version"
	versionNone           = ""
	version1_4_0          = "1.4.0"
	version1_5_0          = "1.5.0"
	version2_0_0          = "2.0.0"
	version3_0_0          = "3.0.0"
	version3_0_1          = "3.0.1"
	version3_0_2          = "3.0.2"
	version3_1_0          = "3.1.0"
	version3_1_1          = "3.1.1"
	version3_2_0          = "3.2.0"
	version3_2_1          = "3.2.1"
	version3_2_2          = "3.2.2"
	version3_3_0          = "3.3.0"
	version3_3_1          = "3.3.1"
	version3_3_2          = "3.3.2"
	version4_0_0          = "4.0.0"
	version4_1_0          = "4.1.0"
	version4_1_1          = "4.1.1"
	version4_2_0          = "4.2.0"
	version4_2_1          = "4.2.1"
	version4_2_2          = "4.2.2"
	version4_2_3          = "4.2.3"
	version4_3_0          = "4.3.0"
	version4_4_0          = "4.4.0"
)

// indicates from what all versions can the plugin
// be upgraded to a specific version.
//
// Key is the destination version.
// Value is an array of compatible source functions.
//
// To upgrade from to a version specified by a key, the user needs
// to be on one of the versions in the corresponding array.
var upgradeCompatibility = map[string][]string{
	versionNone:  {},
	version1_5_0: {version1_4_0},
	version3_0_0: {version2_0_0, version1_5_0},
	version3_0_1: {version3_0_0, version2_0_0, version1_5_0},
	version3_0_2: {version3_0_1, version3_0_0, version2_0_0, version1_5_0},
	version3_1_0: {version3_0_2, version3_0_1, version3_0_0, version2_0_0, version1_5_0},
	version3_1_1: {version3_1_0, version3_0_2, version3_0_1, version3_0_0, version2_0_0, version1_5_0},
	version3_2_0: {version3_1_1, version3_1_0, version3_0_2, version3_0_1, version3_0_0, version2_0_0, version1_5_0},
	version3_2_1: {version3_2_0, version3_1_1, version3_1_0, version3_0_2, version3_0_1, version3_0_0, version2_0_0, version1_5_0},
	version3_2_2: {version3_2_1, version3_2_0, version3_1_1, version3_1_0, version3_0_2, version3_0_1, version3_0_0, version2_0_0, version1_5_0},
	version3_3_0: {version3_2_2, version3_2_1, version3_2_0, version3_1_1, version3_1_0, version3_0_2, version3_0_1, version3_0_0, version2_0_0, version1_5_0},
	version3_3_1: {version3_3_0, version3_2_2, version3_2_1, version3_2_0, version3_1_1, version3_1_0, version3_0_2, version3_0_1, version3_0_0, version2_0_0, version1_5_0},
	version3_3_2: {version3_3_1, version3_3_0, version3_2_2, version3_2_1, version3_2_0, version3_1_1, version3_1_0, version3_0_2, version3_0_1, version3_0_0, version2_0_0, version1_5_0},
	version4_0_0: {version3_3_2, version3_3_1, version3_3_0, version3_2_2, version3_2_1, version3_2_0, version3_1_1, version3_1_0, version3_0_2, version3_0_1, version3_0_0, version2_0_0, version1_5_0},
	version4_1_0: {version4_0_0, version3_3_2, version3_3_1, version3_3_0, version3_2_2, version3_2_1, version3_2_0, version3_1_1, version3_1_0, version3_0_2, version3_0_1, version3_0_0, version2_0_0, version1_5_0},
	version4_1_1: {version4_1_0, version4_0_0, version3_3_2, version3_3_1, version3_3_0, version3_2_2, version3_2_1, version3_2_0, version3_1_1, version3_1_0, version3_0_2, version3_0_1, version3_0_0, version2_0_0, version1_5_0},
	version4_2_0: {version4_4_0, version4_3_0, version4_2_3, version4_2_2, version4_2_1, version4_1_1, version4_1_0, version4_0_0, version3_3_2, version3_3_1, version3_3_0, version3_2_2, version3_2_1, version3_2_0, version3_1_1, version3_1_0, version3_0_2, version3_0_1, version3_0_0, version2_0_0, version1_5_0},
	version4_2_1: {version4_2_0, version4_1_1, version4_1_0, version4_0_0, version3_3_2, version3_3_1, version3_3_0, version3_2_2, version3_2_1, version3_2_0, version3_1_1, version3_1_0, version3_0_2, version3_0_1, version3_0_0, version2_0_0, version1_5_0},
	version4_2_2: {version4_2_1, version4_2_0, version4_1_1, version4_1_0, version4_0_0, version3_3_2, version3_3_1, version3_3_0, version3_2_2, version3_2_1, version3_2_0, version3_1_1, version3_1_0, version3_0_2, version3_0_1, version3_0_0, version2_0_0, version1_5_0},
	version4_2_3: {version4_2_2, version4_2_1, version4_2_0, version4_1_1, version4_1_0, version4_0_0, version3_3_2, version3_3_1, version3_3_0, version3_2_2, version3_2_1, version3_2_0, version3_1_1, version3_1_0, version3_0_2, version3_0_1, version3_0_0, version2_0_0, version1_5_0},
	version4_3_0: {version4_2_3, version4_2_2, version4_2_1, version4_2_0, version4_1_1, version4_1_0, version4_0_0, version3_3_2, version3_3_1, version3_3_0, version3_2_2, version3_2_1, version3_2_0, version3_1_1, version3_1_0, version3_0_2, version3_0_1, version3_0_0, version2_0_0, version1_5_0},
	version4_4_0: {version4_3_0, version4_2_3, version4_2_2, version4_2_1, version4_2_0, version4_1_1, version4_1_0, version4_0_0, version3_3_2, version3_3_1, version3_3_0, version3_2_2, version3_2_1, version3_2_0, version3_1_1, version3_1_0, version3_0_2, version3_0_1, version3_0_0, version2_0_0, version1_5_0},
}

type Migration func(fromVersion string) error

var migrations = []Migration{
	upgradeDatabaseToVersion1_5_0,
	upgradeDatabaseToVersion2_0_0,
	upgradeDatabaseToVersion3_0_0,
	upgradeDatabaseToVersion3_0_1,
	upgradeDatabaseToVersion3_0_2,
	upgradeDatabaseToVersion3_1_0,
	upgradeDatabaseToVersion3_1_1,
	upgradeDatabaseToVersion3_2_0,
	upgradeDatabaseToVersion3_2_1,
	upgradeDatabaseToVersion3_2_2,
	upgradeDatabaseToVersion3_3_0,
	upgradeDatabaseToVersion3_3_1,
	upgradeDatabaseToVersion3_3_2,
	upgradeDatabaseToVersion4_0_0,
	upgradeDatabaseToVersion4_1_0,
	upgradeDatabaseToVersion4_1_1,
	upgradeDatabaseToVersion4_2_0,
	upgradeDatabaseToVersion4_2_1,
	upgradeDatabaseToVersion4_2_2,
	upgradeDatabaseToVersion4_2_3,
	upgradeDatabaseToVersion4_3_0,
	upgradeDatabaseToVersion4_4_0,
}

// DatabaseMigration gets the current database schema version and performs
// all the required data migrations.
func DatabaseMigration() error {
	mutex, err := cluster.NewMutex(config.Mattermost, "standup-raven-migration")
	if err != nil {
		logger.Error("Failed to create mutex for running migrations.", err, nil)
		return err
	}

	mutex.Lock()
	defer mutex.Unlock()

	pluginVersion := config.GetConfig().PluginVersion
	schemaVersion, appErr := getCurrentSchemaVersion()
	if appErr != nil {
		return appErr
	}

	if schemaVersion == pluginVersion {
		// no migration required
		return nil
	}

	if !isUpgradeCompatible(schemaVersion, pluginVersion) {
		msg := fmt.Sprintf(
			"Cannot upgrade Standup Raven from version %s to %s.",
			schemaVersion,
			pluginVersion,
		)

		if canUpgradeFrom := upgradeCompatibility[pluginVersion]; len(canUpgradeFrom) > 0 {
			msg += fmt.Sprintf(" Please upgrade first to one of versions %s", strings.Join(canUpgradeFrom, ", "))
		} else {
			// An empty list means this build is not in the upgrade table at all,
			// which is a packaging mistake rather than something the admin did.
			msg += " This build does not name the versions it can upgrade from; please report it to the plugin's maintainers."
		}

		logger.Error(msg, nil, nil)
		return errors.New(msg)
	}

	for _, migration := range migrations {
		// fetching schema version in loop because each migration
		// will alter it. So we need the current latest schema version
		// to be passed to migration function.
		schemaVersion, err := getCurrentSchemaVersion()
		if err != nil {
			return err
		}

		if err := migration(schemaVersion); err != nil {
			return err
		}
	}

	return nil
}

func getCurrentSchemaVersion() (string, error) {
	key, err := config.Mattermost.KVGet(util.GetKeyHash(databaseSchemaVersion))
	if err != nil {
		logger.Error("Couldn't fetch database schema version from KV store", err, nil)
		return "", err
	}
	if key != nil {
		var version string
		appErr := json.Unmarshal(key, &version)
		if appErr != nil {
			logger.Error("Couldn't marshal database schema version", appErr, nil)
			return "", appErr
		}
		return version, nil
	}
	return versionNone, nil
}

func updateSchemaVersion(version string) error {
	newVersion, marshalErr := json.Marshal(version)
	if marshalErr != nil {
		logger.Error("Couldn't marshal database schema version", marshalErr, nil)
		return marshalErr
	}
	if appErr := config.Mattermost.KVSet(util.GetKeyHash(databaseSchemaVersion), newVersion); appErr != nil {
		logger.Error("Couldn't update database version into KV store", appErr, nil)
		return errors.New(appErr.Error())
	}
	return nil
}

func isUpgradeCompatible(fromVersion, toVersion string) bool {
	return fromVersion == versionNone || funk.Contains(upgradeCompatibility[toVersion], fromVersion)
}
