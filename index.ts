// serve-file.ts
import { statSync } from "fs";
import path from "path";

interface ClientInfo {
  ip: string;
  ua: string;
  count: number;
}

const args = process.argv.slice(2);

if (args.length < 1) {
  console.error("Usage: bun run serve-file [-p port] /path/to/file");
  process.exit(1);
}

// --- CLI parsing ---
let port = 8000;
let filePath = "";

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "-p" || arg === "--port") {
    const val = args[i + 1];
    if (!val || isNaN(Number(val))) {
      console.error("❌ Invalid port number.");
      process.exit(1);
    }
    port = Number(val);
    i++;
  } else {
    filePath = arg || "";
  }
}

if (!filePath) {
  console.error(
    "❌ Missing file path.\nUsage: bunx bundrop [-p port] /path/to/file"
  );
  process.exit(1);
}

const fileName = path.basename(filePath);
let fileSize: number;

try {
  fileSize = statSync(filePath).size;
} catch (err) {
  console.error(`❌ Can't read file: ${err}`);
  process.exit(1);
}

// --- Basic in-memory connection log ---
const clientMap = new Map<string, ClientInfo>();

function logRequest(ip: string, ua: string) {
  const key = `${ip}::${ua}`;
  const existing = clientMap.get(key);
  const info: ClientInfo = existing
    ? { ...existing, count: existing.count + 1 }
    : { ip, ua, count: 1 };

  clientMap.set(key, info);

  const shortUA = ua.slice(0, 60).replace(/\s+/g, " ");
  console.log(
    `[${new Date().toISOString()}] ${ip} (${shortUA}) → connection #${
      info.count
    }`
  );
}

// --- Server ---
const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    const ip = server.requestIP(req)?.toString() || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";

    logRequest(ip, ua);

    if (url.pathname === `/${fileName}`) {
      const file = Bun.file(filePath);
      return new Response(file, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Content-Length": fileSize.toString(),
        },
      });
    }

    return new Response(`Use: /${fileName}\n`, { status: 404 });
  },
});

console.log(`📡 Serving ${fileName} on http://localhost:${port}/${fileName}`);
console.log("🪵 Logging connections with IP & User-Agent info…");
