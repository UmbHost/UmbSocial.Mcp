/**
 * Loads the `.env` file named by `UMBSOCIAL_ENV_FILE`, and no other (see
 * config/env-file.ts).
 *
 * Imported first in index.ts: ESM evaluates imported modules before the
 * importing module's body, so the values are in place before anything reads
 * them.
 */
import { loadEnvFile } from "./config/env-file.js";

loadEnvFile();
