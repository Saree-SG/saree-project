// Build-time version identity, injected by vite.config.ts `define`.
// APP_VERSION  — semver of the newest entry in src/data/releaseNotes.ts
//                (e.g. "1.1.0"); advances whenever a release note is added.
//                NOT package.json.
// APP_BUILD    — git commit short hash (changes every deploy)
// APP_VERSION_LABEL — display string, e.g. "v1.1.0 (a1b2c3d)"
export const APP_VERSION = __APP_VERSION__
export const APP_BUILD = __APP_BUILD__
export const APP_VERSION_LABEL = __APP_VERSION_LABEL__
