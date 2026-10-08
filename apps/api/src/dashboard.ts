import type { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export async function registerDashboard(
  app: FastifyInstance,
  root = fileURLToPath(new URL("../../web/dist/", import.meta.url)),
) {
  await access(path.join(root, "index.html"));
  await app.register(fastifyStatic, {
    root,
    prefix: "/",
    setHeaders: (response, filename) => {
      const asset = filename.startsWith(path.join(root, "assets") + path.sep);
      response.header(
        "Cache-Control",
        asset ? "public, max-age=31536000, immutable" : "no-cache",
      );
    },
  });
  app.setNotFoundHandler((request, reply) => {
    const pathname = request.url.split("?")[0]!;
    if (
      !["GET", "HEAD"].includes(request.method) ||
      /^\/(v1|health|ready|docs)(\/|$)/.test(pathname) ||
      path.extname(pathname) ||
      !request.headers.accept?.includes("text/html")
    ) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.sendFile("index.html");
  });
}
