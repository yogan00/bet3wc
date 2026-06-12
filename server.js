const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const qs = require("querystring");

const PORT = 5000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

async function handleApi(req, res, pathname, query) {
  const parts = pathname.replace(/^\/api\//, "").split("/");
  let handlerPath;

  if (parts[0] === "admin" && parts[1]) {
    handlerPath = path.join(__dirname, "api", "admin", parts[1] + ".js");
  } else if (parts[0]) {
    handlerPath = path.join(__dirname, "api", parts[0] + ".js");
  }

  if (!handlerPath || !fs.existsSync(handlerPath)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "API route not found" }));
    return;
  }

  const projectRoot = __dirname + path.sep;
  Object.keys(require.cache).forEach((key) => {
    if (key.startsWith(projectRoot) && !key.includes("node_modules")) {
      delete require.cache[key];
    }
  });
  const handler = require(handlerPath);

  req.query = query || {};

  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", async () => {
    if (chunks.length) {
      try {
        req.body = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        req.body = {};
      }
    }

    const sent = { headers: {}, status: 200, body: null };
    const mockRes = {
      status(code) { sent.status = code; return mockRes; },
      setHeader(k, v) { sent.headers[k] = v; return mockRes; },
      json(data) {
        sent.body = JSON.stringify(data);
        sent.headers["Content-Type"] = "application/json";
        flush();
      },
      send(data) {
        sent.body = data;
        flush();
      },
      end(data) {
        sent.body = data || "";
        flush();
      },
    };

    function flush() {
      res.writeHead(sent.status, sent.headers);
      res.end(sent.body);
    }

    try {
      const fn = typeof handler === "function" ? handler : handler.default;
      await fn(req, mockRes);
    } catch (err) {
      console.error("API error:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    }
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url);
  const pathname = parsed.pathname;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname.startsWith("/api/")) {
    const query = parsed.query ? qs.parse(parsed.query) : {};
    await handleApi(req, res, pathname, query);
    return;
  }

  let filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);

  if (!fs.existsSync(filePath)) {
    filePath = path.join(PUBLIC_DIR, "index.html");
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || "text/plain";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
