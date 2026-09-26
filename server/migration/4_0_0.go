package migration

// Version 4.x changed no stored data: the standup configuration, user standups
// and the schema version key all have the shape they had in 3.x. The migrations
// exist so that the upgrade table has a destination to name, which is what lets
// an installation on any older version move to 4.x at all.
//
// TODO: Add test cases later
func upgradeDatabaseToVersion4_0_0(fromVersion string) error {
	return updateSchemaVersion(version4_0_0)
}

func upgradeDatabaseToVersion4_1_0(fromVersion string) error {
	return updateSchemaVersion(version4_1_0)
}

// 4.1.1 fixes the upgrade table only; the data has the same shape either way.
func upgradeDatabaseToVersion4_1_1(fromVersion string) error {
	return updateSchemaVersion(version4_1_1)
}

// 4.2.0 rebuilt the web app's controls; the stored configuration, standups and
// schema version key are untouched.
func upgradeDatabaseToVersion4_2_0(fromVersion string) error {
	return updateSchemaVersion(version4_2_0)
}

// 4.2.1 fixes the web app's error boundary; nothing stored changes shape.
func upgradeDatabaseToVersion4_2_1(fromVersion string) error {
	return updateSchemaVersion(version4_2_1)
}

// 4.2.2 fixes the tab panels in the web app; nothing stored changes shape.
func upgradeDatabaseToVersion4_2_2(fromVersion string) error {
	return updateSchemaVersion(version4_2_2)
}
