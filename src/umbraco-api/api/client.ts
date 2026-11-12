/**
 * The UmbSocial API client.
 *
 * `customInstance` is Orval's mutator: every generated call goes through the
 * SDK's `UmbracoManagementClient`, which authenticates with the API user's
 * client credentials (`initializeUmbracoFetch` in `index.ts`) and fetches a new
 * token when the last one has expired. This is the template's client without
 * its eval-only mock store.
 *
 * Unit tests reach it through MSW (`src/mocks/`).
 */

import { UmbracoManagementClient, type UmbracoManagementClientOptions } from "@umbraco-cms/mcp-server-sdk";
import { getUmbSocialAPI } from "./generated/umbSocialApi.js";

export { CAPTURE_RAW_HTTP_RESPONSE } from "@umbraco-cms/mcp-server-sdk";

type RequestConfig = Parameters<typeof UmbracoManagementClient>[0];

export const customInstance = <T>(config: RequestConfig, options?: UmbracoManagementClientOptions): Promise<T> =>
  UmbracoManagementClient<T>(config, options);

export default customInstance;

let api: ReturnType<typeof getUmbSocialAPI> | null = null;

/**
 * The generated client: one function per operation, named after the C# action
 * (`listPosts`, `createPost`, `getEdition`, ...). Pass `CAPTURE_RAW_HTTP_RESPONSE`
 * as the last argument when using the SDK's API helpers.
 */
export function getSocialApi(): ReturnType<typeof getUmbSocialAPI> {
  api ??= getUmbSocialAPI();
  return api;
}
