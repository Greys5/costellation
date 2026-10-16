import { ConfigReader } from "@backstage/config";
import { createApp } from "@backstage/frontend-defaults";
import {
  coreExtensionData,
  createExtension,
  createExtensionInput,
  createFrontendModule,
} from "@backstage/frontend-plugin-api";
import { costellationPlugin } from "./plugin";

// Preserve Costellation's navigation while Backstage owns the app and plugin tree.
const layout = createExtension({
  name: "layout",
  attachTo: { id: "app/root", input: "children" },
  inputs: {
    nav: createExtensionInput([coreExtensionData.reactElement], {
      singleton: true,
    }),
    content: createExtensionInput([coreExtensionData.reactElement], {
      singleton: true,
    }),
  },
  output: [coreExtensionData.reactElement],
  factory: ({ inputs }) => [
    coreExtensionData.reactElement(
      inputs.content.get(coreExtensionData.reactElement),
    ),
  ],
});

const costellationLayout = createFrontendModule({
  pluginId: "app",
  extensions: [layout],
});

export function createCostellationApp(baseUrl: string) {
  return createApp({
    features: [costellationPlugin, costellationLayout],
    advanced: {
      configLoader: async () => ({
        config: new ConfigReader({
          app: {
            title: "Costellation",
            baseUrl,
            // Local AWS SSO remains the pilot's access boundary.
            extensions: [{ "sign-in-page:app": false }],
          },
          backend: { baseUrl },
        }),
      }),
    },
  });
}
