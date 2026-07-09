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
