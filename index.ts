import { statSync, readFileSync } from "fs";
import path from "path";
import { createInterface } from "readline";
import qrcode from "qrcode";

// ANSI color codes
const GREEN = "\x1b[32m";
const DKGRAY = "\x1b[90m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

function showHelp() {
  console.log(`
Usage: bunx bundrop [-p port] [--debug] [--tunnel] /path/to/file

Options:
  -p, --port <number>  Port to serve the file on (default: 8000)
  -d, --debug          Enable debug logging
  -t, --tunnel         Automatically enable CloudFlare tunnel
  -h, --help           Show this help message

Examples:
  bunx bundrop ./document.pdf
  bunx bundrop -p 3000 ./image.jpg
  bunx bundrop --debug ./video.mp4
  bunx bundrop --tunnel ./file.zip
`);
}

interface ClientInfo {
  ip: string;
  ua: string;
  count: number;
}

const args = process.argv.slice(2);

if (args.length < 1) {
  console.log("");
  console.error("Usage: bunx bundrop [-p port] [--debug] /path/to/file");
  console.error("Run 'bunx bundrop --help' for more information.");
  console.log("");
  process.exit(1);
}

// --- CLI parsing ---
let port = 8000;
let filePath = "";
let debug = false;
let autoTunnel = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "-h" || arg === "--help") {
    showHelp();
    process.exit(0);
  } else if (arg === "-p" || arg === "--port") {
    const val = args[i + 1];
    if (!val || isNaN(Number(val))) {
      console.error("Invalid port number.");
      process.exit(1);
    }
    port = Number(val);
    i++;
  } else if (arg === "-d" || arg === "--debug") {
    debug = true;
  } else if (arg === "-t" || arg === "--tunnel") {
    autoTunnel = true;
  } else if (arg === "-v" || arg === "---version") {
    try {
      const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
      console.log(packageJson.version);
    } catch {
      console.log("unknown");
    }
    process.exit(0);
  } else {
    filePath = arg || "";
  }
}

if (!filePath) {
  console.error(
    "Missing file path.\nUsage: bunx bundrop [-p port] [--debug] [--tunnel] /path/to/file"
  );
  process.exit(1);
}

// Filename hacks for convenience
if (filePath === "help") {
  showHelp();
  process.exit(0);
}

if (filePath === "version") {
  try {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    console.log(packageJson.version);
  } catch {
    console.log("unknown");
  }
  process.exit(0);
}

const fileName = path.basename(filePath);
const urlPath = Math.random().toString(36).substring(2, 7);
let fileSize: number;

try {
  fileSize = statSync(filePath).size;
} catch (err) {
  console.error(`Can't read file: ${err}`);
  process.exit(1);
}

// --- CloudFlare Tunnel onboarding ---
async function askCloudFlareTunnel(): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.setPrompt(
    "Do you want to set up a CloudFlare Tunnel URL to your file? (y/n): "
  );
  rl.prompt();
  const answer: string = await new Promise((resolve) =>
    rl.once("line", resolve)
  );
  rl.close();
  return answer.toLowerCase().startsWith("y");
}

async function checkCloudFlaredInstalled(debug: boolean): Promise<boolean> {
  if (debug) console.log("DEBUG: Checking if cloudflared is installed...");
  try {
    const proc = Bun.spawn(["cloudflared", "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    const isInstalled = proc.exitCode === 0;
    if (debug)
      console.log(
        `DEBUG: cloudflared check result: ${
          isInstalled ? "installed" : "not installed"
        }`
      );
    return isInstalled;
  } catch (error) {
    if (debug) console.log("DEBUG: cloudflared check error:", error);
    return false;
  }
}

function showInstallationInstructions() {
  const platform = process.platform;

  console.log("Please install the cloudflared CLI first.");

  if (platform === "darwin") {
    console.log("On macOS:");
    console.log("brew install cloudflared");
  } else if (platform === "win32") {
    console.log("On Windows:");
    console.log("winget install --id Cloudflare.cloudflared");
  } else {
    console.log(
      "On Linux, follow the installation instructions in the link below."
    );
  }

  console.log(
    "Go here for full installation instructions: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  );
}

async function runCloudFlaredTunnel(
  port: number,
  debug: boolean
): Promise<string | null> {
  if (debug)
    console.log(`DEBUG: Starting cloudflared tunnel for port ${port}...`);
  try {
    const proc = Bun.spawn(
      ["cloudflared", "tunnel", "--url", `http://localhost:${port}`],
      {
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    if (debug)
      console.log("DEBUG: cloudflared process spawned, waiting for URL...");

    return new Promise((resolve) => {
      let output = "";
      let urlFound = false;

      // Read from stdout
      const reader = proc.stdout.getReader();
      const readStdout = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = new TextDecoder().decode(value);
            output += chunk;

            if (debug) console.log("DEBUG: stdout chunk:", chunk);

            // Look for the tunnel URL in the output
            const urlMatch = output.match(
              /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/
            );
            if (urlMatch && !urlFound) {
              urlFound = true;
              if (debug) console.log(`DEBUG: Found tunnel URL: ${urlMatch[0]}`);
              resolve(urlMatch[0]);
              return;
            }
          }
        } catch (error) {
          if (debug) console.log("DEBUG: stdout read error:", error);
        }
      };

      // Read from stderr
      const stderrReader = proc.stderr.getReader();
      const readStderr = async () => {
        try {
          while (true) {
            const { done, value } = await stderrReader.read();
            if (done) break;

            const chunk = new TextDecoder().decode(value);
            output += chunk;

            if (debug) console.log("DEBUG: stderr chunk:", chunk);

            // Look for the tunnel URL in the output
            const urlMatch = output.match(
              /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/
            );
            if (urlMatch && !urlFound) {
              urlFound = true;
              if (debug) console.log(`DEBUG: Found tunnel URL: ${urlMatch[0]}`);
              resolve(urlMatch[0]);
              return;
            }
          }
        } catch (error) {
          if (debug) console.log("DEBUG: stderr read error:", error);
        }
      };

      // Start reading from both streams
      readStdout();
      readStderr();

      // Set a timeout to avoid hanging forever
      setTimeout(() => {
        if (!urlFound) {
          console.error("Timeout waiting for CloudFlare tunnel URL");
          if (debug) console.log("DEBUG: Full output so far:", output);
          proc.kill();
          resolve(null);
        }
      }, 30000); // 30 second timeout

      // Handle process exit
      proc.exited.then((exitCode) => {
        if (!urlFound) {
          if (debug)
            console.log(`DEBUG: cloudflared exited with code: ${exitCode}`);
          console.error("CloudFlare tunnel process exited unexpectedly");
          if (debug) console.log("DEBUG: Full output:", output);
          resolve(null);
        }
      });
    });
  } catch (error) {
    console.error("Failed to start CloudFlare tunnel");
    if (debug) console.log("DEBUG: Error:", error);
    return null;
  }
}

async function setupCloudFlareTunnel(
  port: number,
  fileName: string,
  urlPath: string,
  debug: boolean,
  autoTunnel: boolean
) {
  let wantsTunnel = autoTunnel;

  if (!autoTunnel) wantsTunnel = await askCloudFlareTunnel();

  if (!wantsTunnel) {
    console.log(
      `\n${DKGRAY}To make this file accessible outside your network, set up a port forward pointing ${CYAN}${port}${RESET}${DKGRAY} to your machine's IP address.${RESET}\n`
    );
    return;
  }

  const isInstalled = await checkCloudFlaredInstalled(debug);
  if (!isInstalled) {
    showInstallationInstructions();
    process.exit(1);
  }

  console.log("Starting CloudFlare tunnel...");
  const tunnelUrl = await runCloudFlaredTunnel(port, debug);

  if (tunnelUrl) {
    console.log(`
${GREEN}Your file is now accessible at:\n\n${CYAN}${tunnelUrl}/${urlPath}${RESET}

${DKGRAY}Share this URL or scan the QR code to let them download your file!${RESET}
`);

    qrcode.toString(
      tunnelUrl,
      { type: "terminal", small: true },
      (err, url) => {
        if (err) console.error(err);
        console.log(url);
      }
    );
  }
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
    `[${new Date().toISOString()}] ${ip.toString()} (${shortUA}) → connection #${
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

    // Download route for actual file
    if (url.pathname === `/download/${urlPath}`) {
      const file = Bun.file(filePath);
      return new Response(file, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Content-Length": fileSize.toString(),
        },
      });
    }

    // Main page with download interface
    if (url.pathname === `/${urlPath}`) {
      const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Download ${fileName}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .container {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            text-align: center;
            max-width: 500px;
            width: 100%;
        }
        
        .file-icon {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            border-radius: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 30px;
            font-size: 32px;
            color: white;
        }
        
        .file-name {
            font-size: 24px;
            font-weight: 600;
            color: #2d3748;
            margin-bottom: 10px;
            word-break: break-all;
        }
        
        .file-size {
            color: #718096;
            font-size: 16px;
            margin-bottom: 30px;
        }
        
        .download-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 16px 32px;
            border-radius: 12px;
            font-size: 18px;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            transition: transform 0.2s, box-shadow 0.2s;
            margin-bottom: 30px;
        }
        
        .download-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 25px rgba(102, 126, 234, 0.3);
        }
        
        .footer {
            color: #a0aec0;
            font-size: 14px;
            margin-top: 20px;
        }
        
        .footer a {
            color: #667eea;
            text-decoration: none;
            font-weight: 500;
        }
        
        .footer a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="file-icon">📁</div>
        <div class="file-name">${fileName}</div>
        <div class="file-size">${fileSizeMB} MB</div>
        <a href="/download/${urlPath}" class="download-btn">Download File</a>
        <div class="footer">
            Powered by <a href="https://github.com/jamonholmgren/bundrop" target="_blank">bundrop</a>
        </div>
    </div>
</body>
</html>`;

      return new Response(html, {
        headers: {
          "Content-Type": "text/html",
        },
      });
    }

    return new Response(
      "Hi there! Looks like you landed on the main page.\nTo get your file, just make sure to use the special link we gave you.\n",
      { status: 404 }
    );
  },
});

console.log(
  `\n${GREEN}Serving ${fileName} on ${CYAN}http://localhost:${port}/${urlPath}${RESET}\n`
);

// Start CloudFlare tunnel onboarding
setupCloudFlareTunnel(port, fileName, urlPath, debug, autoTunnel).catch(
  console.error
);
