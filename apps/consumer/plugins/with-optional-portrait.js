// Keeps the app installable on tablets and other devices that Play counts as landscape-only.
//
// The app is portrait-only (app.json "orientation"), so Android implies the feature
// android.hardware.screen.portrait as required, and Play warns that this limits the devices that can
// install it. Declaring the feature as not required removes that limit; the app still opens in
// portrait.
const { withAndroidManifest } = require('expo/config-plugins');

const FEATURE = 'android.hardware.screen.portrait';

module.exports = function withOptionalPortrait(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const features = (manifest['uses-feature'] ?? []).filter((f) => f.$['android:name'] !== FEATURE);
    features.push({ $: { 'android:name': FEATURE, 'android:required': 'false', 'tools:replace': 'android:required' } });
    manifest['uses-feature'] = features;
    return cfg;
  });
};
