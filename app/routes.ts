import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("pages/Home.tsx"),
  route("login", "pages/Login.tsx"),
  route("lobby", "pages/Lobby.tsx"),
  route("discussion", "pages/Discussion.tsx"),
  route("results", "pages/Results.tsx"),
  route("controller", "pages/Controller.tsx"),
] satisfies RouteConfig;
