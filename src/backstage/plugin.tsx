import React from "react";
import { CircleDollarSign } from "lucide-react";
import {
  createFrontendPlugin,
  createRouteRef,
  PageBlueprint,
} from "@backstage/frontend-plugin-api";

export const costellationRouteRef = createRouteRef();

const costellationPage = PageBlueprint.make({
  params: {
    path: "/",
    title: "Costellation",
    icon: <CircleDollarSign />,
    routeRef: costellationRouteRef,
    noHeader: true,
    loader: () =>
      import("../CostellationPage").then(({ CostellationPage }) => (
        <CostellationPage />
      )),
  },
});

export const costellationPlugin = createFrontendPlugin({
  pluginId: "costellation",
  extensions: [costellationPage],
  routes: { root: costellationRouteRef },
});
