#!/usr/bin/env node
// Generates the plugin manifest for one platform's bundle.
//
// Two things happen here rather than in the repository's plugin.json:
//   * the time zone list is injected into the settings schema, because it is a
//     generated 40 KB list that has no business being committed, and
//   * the server section is narrowed to the single executable that the tarball
//     being built actually contains.
//
// usage: generate-manifest.js <manifest> <timezones> <out> <platform>

const fs = require('fs');

const args = process.argv.slice(2);
if (args.length !== 4) {
    console.error('usage: generate-manifest.js <manifest> <timezones> <out> <platform>');
    process.exit(1);
}

const [manifestPath, timezonesPath, outPath, platform] = args;

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const timezones = JSON.parse(fs.readFileSync(timezonesPath, 'utf8'));

const executable = (manifest.server || {}).executables ? manifest.server.executables[platform] : undefined;
if (!executable) {
    console.error(`${manifestPath} has no "server.executables" entry for platform ${platform}`);
    process.exit(1);
}

const timeZoneSetting = manifest.settings_schema.settings.find((setting) => setting.key === 'timeZone');
if (!timeZoneSetting) {
    console.error(`${manifestPath} has no "timeZone" setting to fill in`);
    process.exit(1);
}
timeZoneSetting.options = timezones;

manifest.server = {executables: {[platform]: executable}};

fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outPath} for ${platform} (${executable})`);
