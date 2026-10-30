// Signs local release builds (`./gradlew bundleRelease`) with the Google Play upload key when this
// machine has ~/.campuscart-keys/upload.properties (storeFile, storePassword, keyAlias, keyPassword;
// storeFile relative to that folder). The key and its passwords never enter the repo. Without the
// file, release builds keep the debug key as before, and EAS builds sign with their own credentials.
const { withAppBuildGradle } = require('expo/config-plugins');

const LOAD_KEY = `
// Play upload key for local release builds, if this machine has one (plugins/with-upload-signing.js).
def campuscartUploadFile = new File(System.getProperty('user.home'), '.campuscart-keys/upload.properties')
def campuscartUpload = new Properties()
if (campuscartUploadFile.exists()) {
    campuscartUploadFile.withInputStream { campuscartUpload.load(it) }
}
`;

const RELEASE_CONFIG = `
        if (campuscartUploadFile.exists()) {
            release {
                storeFile new File(campuscartUploadFile.parentFile, campuscartUpload['storeFile'])
                storePassword campuscartUpload['storePassword']
                keyAlias campuscartUpload['keyAlias']
                keyPassword campuscartUpload['keyPassword']
            }
        }`;

function replaceOnce(contents, pattern, replacement, what) {
  if (!pattern.test(contents)) {
    throw new Error(`with-upload-signing: could not find ${what} in android/app/build.gradle; update the plugin.`);
  }
  return contents.replace(pattern, replacement);
}

module.exports = function withUploadSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (gradle.includes('campuscartUploadFile')) return cfg;
    gradle = replaceOnce(gradle, /\nandroid \{/, `${LOAD_KEY}\nandroid {`, 'the android block');
    gradle = replaceOnce(gradle, /signingConfigs \{/, `signingConfigs {${RELEASE_CONFIG}`, 'signingConfigs');
    gradle = replaceOnce(
      gradle,
      /(release \{[^}]*?)signingConfig signingConfigs\.debug/,
      '$1signingConfig campuscartUploadFile.exists() ? signingConfigs.release : signingConfigs.debug',
      'the release build type',
    );
    cfg.modResults.contents = gradle;
    return cfg;
  });
};
