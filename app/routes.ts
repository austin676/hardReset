import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("pages/Home.tsx"),
  route("login", "pages/Login.tsx"),
  route("lobby", "pages/Lobby.tsx"),
  route("playing", "pages/Playing.tsx"),
  route("discussion", "pages/Discussion.tsx"),
  route("results", "pages/Results.tsx"),
  route("controller", "pages/Controller.tsx"),
  route("game", "routes/game.tsx"),
] satisfies RouteConfig;
