import { initializeUmbracoFetch } from "@umbraco-cms/mcp-server-sdk";

// Initialise the SDK's fetch client with dummy credentials. MSW intercepts
// every request in unit tests, so they never need to be real; without this the
// client throws "not initialized" before MSW can intercept.
initializeUmbracoFetch({
  baseUrl: "http://localhost:9999",
  clientId: "test-client",
  clientSecret: "test-secret",
});
