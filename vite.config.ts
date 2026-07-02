import { defineConfig, loadEnv, type Connect, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Serve a local sheet-music library over the dev/preview server.
 *
 * With SHEETS_DIR set (shell env or .env.local) to a directory, exposes:
 *   GET /api/sheets            → JSON array of *.music.json paths (relative,
 *                                recursive, sorted)
 *   GET /api/sheets/<relpath>  → the file's content
 * Without SHEETS_DIR the endpoints 404 and the app hides the library UI.
 */
function sheetsLibrary(dir: string | undefined): Plugin {
  const root = dir ? path.resolve(dir) : null;

  async function listSheets(base: string): Promise<string[]> {
    const out: string[] = [];
    async function walk(d: string): Promise<void> {
      let entries;
      try {
        entries = await fs.readdir(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.name.startsWith(".")) continue;
        const abs = path.join(d, e.name);
        if (e.isDirectory()) await walk(abs);
        else if (e.name.endsWith(".music.json")) out.push(path.relative(base, abs));
      }
    }
    await walk(base);
    return out.sort((a, b) => a.localeCompare(b));
  }

  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const url = (req.url ?? "").split("?")[0];
    if (!root || !url.startsWith("/api/sheets")) return next();
    void (async () => {
      if (url === "/api/sheets" || url === "/api/sheets/") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(await listSheets(root)));
        return;
      }
      const rel = decodeURIComponent(url.slice("/api/sheets/".length));
      const abs = path.resolve(root, rel);
      if (!abs.startsWith(root + path.sep) || !abs.endsWith(".music.json")) {
        res.statusCode = 403;
        res.end("forbidden");
        return;
      }
      try {
        const text = await fs.readFile(abs, "utf8");
        res.setHeader("Content-Type", "application/json");
        res.end(text);
      } catch {
        res.statusCode = 404;
        res.end("not found");
      }
    })();
  };

  return {
    name: "sheets-library",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), sheetsLibrary(env.SHEETS_DIR)],
    // Pre-bundle the locally-linked music-json (and its ajv dep), which Vite
    // skips for linked packages by default.
    optimizeDeps: {
      include: ["music-json", "music-roll"],
    },
  };
});
