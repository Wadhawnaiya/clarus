/** Product identity for Clarus (extension / agent side). */

export const PRODUCT_NAME = "Clarus";

/** Env var preferred for the client workspace root. */
export const HOME_ENV = "CLARUS_HOME";

/** Legacy env var from Accountant24 — still read when CLARUS_HOME is unset. */
export const LEGACY_HOME_ENV = "ACCOUNTANT24_HOME";

/** Default workspace directory name under the user home when no env is set. */
export const DEFAULT_WORKSPACE_DIR_NAME = "Clarus";

/** Bundled extension filename under desktop resources. */
export const EXTENSION_BUNDLE_NAME = "clarus-extension.js";

/** Git commit message used for the first scaffold commit. */
export const SCAFFOLD_COMMIT_MESSAGE = "Initial Clarus setup";
