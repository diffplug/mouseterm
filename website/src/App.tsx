import type { RouteRecord } from "vite-react-ssg";

export const routes: RouteRecord[] = [
  {
    path: "/",
    lazy: () => import("./pages/Home"),
  },
  {
    path: "/playground",
    lazy: () => import("./pages/Playground"),
  },
  {
    path: "/dependencies",
    lazy: () => import("./pages/Dependencies"),
  },
];
