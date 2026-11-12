/**
 * Jest global setup for MSW.
 *
 * The template starts MSW only when USE_MOCK_API=true and otherwise lets unit
 * tests call a real Umbraco. Here it always starts and refuses any request
 * without a handler, so a unit test can never reach a real site. The live
 * checks against the local test sites have their own configuration.
 */

import { setupMswServer } from "@umbraco-cms/mcp-server-sdk/testing";
import { server } from "./server.js";

setupMswServer(server, undefined, { onUnhandledRequest: "error" });
