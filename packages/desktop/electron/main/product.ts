/** Product identity for Clarus (Electron main process). */

export const PRODUCT_NAME = "Clarus";

/** Env var preferred for the client workspace root. */
export const HOME_ENV = "CLARUS_HOME";

/** Legacy env var from Accountant24 — still read when CLARUS_HOME is unset. */
export const LEGACY_HOME_ENV = "ACCOUNTANT24_HOME";

/** Default workspace directory name under the user home when no env is set. */
export const DEFAULT_WORKSPACE_DIR_NAME = "Clarus";

/** Bundled extension filename under app resources. */
export const EXTENSION_BUNDLE_NAME = "clarus-extension.js";

/** electron-builder appId (domain placeholder until legal identity is final). */
export const APP_ID = "com.clarus.desktop";

/**
 * Aptabase app key (embedded client id, not a secret). Empty = do not initialize
 * or emit network analytics. Pilot default is empty so Clarus does not send
 * events to the upstream Accountant24 project; set a firm-owned key when ready.
 */
export const APTABASE_APP_KEY = "";

export function isAnalyticsConfigured(): boolean {
  return APTABASE_APP_KEY.length > 0;
}

/**
 * Silent auto-update. Keep false for unsigned pilot builds and until firm
 * GitHub Releases are the intentional feed. electron-builder `publish` owner/repo
 * must match the firm channel before enabling.
 */
export const AUTO_UPDATE_ENABLED = false;

/** GitHub owner for release publish / updater feed (must match electron-builder.yml). */
export const UPDATE_FEED_GITHUB_OWNER = "Wadhawnaiya";

/** GitHub repo for release publish / updater feed (must match electron-builder.yml). */
export const UPDATE_FEED_GITHUB_REPO = "clarus";
