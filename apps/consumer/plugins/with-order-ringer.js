// Makes a shop phone ring like an incoming call for a new order, even when the app is closed.
//
// Puts plugins/order-ringer/OrderRingService.kt in the app and registers it as the Firebase messaging
// service in place of expo-notifications' own, which it extends: every other push behaves exactly as
// before. The service needs Firebase Messaging on the app's compile path, at the version
// expo-notifications uses.
const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');

const EXPO_SERVICE = 'expo.modules.notifications.service.ExpoFirebaseMessagingService';
const MESSAGING_EVENT = 'com.google.firebase.MESSAGING_EVENT';

function firebaseMessagingVersion(projectRoot) {
  const gradle = fs.readFileSync(
    path.join(path.dirname(require.resolve('expo-notifications/package.json', { paths: [projectRoot] })), 'android/build.gradle'),
    'utf8',
  );
  const match = gradle.match(/com\.google\.firebase:firebase-messaging:([\d.]+)/);
  if (!match) throw new Error('with-order-ringer: could not find the firebase-messaging version in expo-notifications; update the plugin.');
  return match[1];
}

const withRingerSource = (config) =>
  withDangerousMod(config, [
    'android',
    (cfg) => {
      const pkg = cfg.android?.package;
      if (!pkg) throw new Error('with-order-ringer: android.package is not set.');
      const source = fs
        .readFileSync(path.join(__dirname, 'order-ringer', 'OrderRingService.kt'), 'utf8')
        .replace('__PACKAGE__', pkg);
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/java', ...pkg.split('.'));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'OrderRingService.kt'), source);
      return cfg;
    },
  ]);

const withRingerManifest = (config) =>
  withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    manifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    const services = (app.service ??= []).filter(
      (s) => s.$['android:name'] !== EXPO_SERVICE && s.$['android:name'] !== '.OrderRingService',
    );
    services.push(
      // Two services for one Firebase event would leave it to chance which one runs.
      { $: { 'android:name': EXPO_SERVICE, 'tools:node': 'remove' } },
      {
        $: { 'android:name': '.OrderRingService', 'android:exported': 'false' },
        'intent-filter': [{ action: [{ $: { 'android:name': MESSAGING_EVENT } }] }],
      },
    );
    app.service = services;
    return cfg;
  });

const withRingerDependencies = (config) =>
  withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (gradle.includes('order ringer')) return cfg;
    const version = firebaseMessagingVersion(cfg.modRequest.projectRoot);
    if (!/\ndependencies \{/.test(gradle)) {
      throw new Error('with-order-ringer: could not find the dependencies block in android/app/build.gradle; update the plugin.');
    }
    gradle = gradle.replace(
      /\ndependencies \{/,
      `\ndependencies {
    // The order ringer (plugins/with-order-ringer.js) extends expo-notifications' Firebase service.
    implementation project(':expo-notifications')
    implementation 'com.google.firebase:firebase-messaging:${version}'`,
    );
    cfg.modResults.contents = gradle;
    return cfg;
  });

module.exports = function withOrderRinger(config) {
  return withRingerDependencies(withRingerManifest(withRingerSource(config)));
};
