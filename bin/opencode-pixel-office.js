#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import readline from "node:readline";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLUGIN_NAME = "pixel-office.js";
const PLUGIN_ID = "opencode-pixel-office@latest";
const DEFAULT_PLUGIN_DIR = path.join(os.homedir(), ".opencode", "plugins");
const DEFAULT_APP_DIR = path.join(os.homedir(), ".opencode", "pixel-office");
const DEFAULT_CONFIG_PATH = path.join(os.homedir(), ".config", "opencode", "opencode.json");
const PIXEL_OFFICE_CONFIG_PATH = path.join(DEFAULT_APP_DIR, "config.json");
const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const CLAUDE_HOOK_DIR = path.join(CLAUDE_DIR, "hooks");
const CLAUDE_HOOK_FILE = path.join(CLAUDE_HOOK_DIR, "opencode-pixel-office-hook.js");
const CLAUDE_SETTINGS_PATH = path.join(CLAUDE_DIR, "settings.json");

const args = process.argv.slice(2);
const command = args[0];
const shouldInstall = command === "install";
const shouldUninstall = command === "uninstall";
const shouldStart = command === "start";
const shouldStop = command === "stop";
const shouldStatus = command === "status";
const shouldVersion = args.includes("--version") || args.includes("-v");
const yesFlag = args.includes("--yes") || args.includes("-y");
const portIndex = args.findIndex((arg) => arg === "--port");
const portArg = portIndex !== -1 ? args[portIndex + 1] : null;

const getVersion = () => {
  try {
    const pkgPath = path.resolve(__dirname, "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
};

const printHelp = () => {
  console.log(`opencode-pixel-office v${getVersion()}\n`);
  console.log("A pixel-art office visualization for AI coding assistants.");
  console.log("Works with both OpenCode and Claude Code simultaneously.\n");
  console.log("Usage:");
  console.log("  opencode-pixel-office install [options]    Install for both OpenCode & Claude");
  console.log("  opencode-pixel-office start [options]      Start the server");
  console.log("  opencode-pixel-office stop                 Stop the server");
  console.log("  opencode-pixel-office status               Show installation status");
  console.log("  opencode-pixel-office uninstall            Uninstall completely");
  console.log("\nOptions:");
  console.log("  --port <number> Set server port (default: 5100)");
  console.log("  --yes, -y       Skip confirmation prompts");
  console.log("  --version, -v   Show version number");
  console.log("\nExamples:");
  console.log("  opencode-pixel-office install      # Install for OpenCode + Claude Code");
  console.log("  opencode-pixel-office start        # Start server & open browser");
  console.log("  opencode-pixel-office status       # Check what's installed");
};

const loadConfig = () => {
  try {
    if (fs.existsSync(PIXEL_OFFICE_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(PIXEL_OFFICE_CONFIG_PATH, "utf8"));
    }
  } catch {}
  return {};
};

const saveConfig = (config) => {
  fs.mkdirSync(DEFAULT_APP_DIR, { recursive: true });
  fs.writeFileSync(PIXEL_OFFICE_CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
};

const prompt = async (question) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
};

const copyRecursiveSync = (src, dest) => {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else if (exists) {
    fs.copyFileSync(src, dest);
  }
};

const stopServer = (port) => {
  try {
    const pidOutput = execSync(`lsof -t -i :${port} 2>/dev/null`).toString().trim();
    if (pidOutput) {
      const pids = pidOutput.split("\n").map((p) => parseInt(p, 10)).filter((p) => !isNaN(p) && p > 0);
      for (const pid of pids) {
        try {
          process.kill(pid);
          console.log(`✓ Stopped server (PID: ${pid})`);
        } catch {}
      }
      return pids.length > 0;
    }
  } catch {}
  return false;
};

// Check if opencode plugin is installed
const isOpencodeInstalled = () => {
  const pluginPath = path.join(DEFAULT_PLUGIN_DIR, PLUGIN_NAME);
  return fs.existsSync(pluginPath);
};

// Check if claude-code hooks are installed
const isClaudeCodeInstalled = () => {
  return fs.existsSync(CLAUDE_HOOK_FILE);
};

// Check if app is installed
const isAppInstalled = () => {
  return fs.existsSync(path.join(DEFAULT_APP_DIR, "server", "index.ts"));
};

// Install opencode plugin
const installOpencodePlugin = () => {
  const rootSource = path.resolve(__dirname, "..");
  const pluginSource = path.join(rootSource, "plugin", PLUGIN_NAME);

  if (!fs.existsSync(pluginSource)) {
    console.error(`  ! Plugin file not found: ${pluginSource}`);
    return false;
  }

  fs.mkdirSync(DEFAULT_PLUGIN_DIR, { recursive: true });
  const targetPluginPath = path.join(DEFAULT_PLUGIN_DIR, PLUGIN_NAME);
  fs.copyFileSync(pluginSource, targetPluginPath);
  console.log(`  ✓ OpenCode plugin installed`);
  return true;
};

// Remove opencode plugin
const removeOpencodePlugin = () => {
  const pluginPath = path.join(DEFAULT_PLUGIN_DIR, PLUGIN_NAME);
  if (fs.existsSync(pluginPath)) {
    fs.unlinkSync(pluginPath);
    console.log(`✓ Removed OpenCode plugin`);
    return true;
  }
  return false;
};

// Install claude-code hooks
const installClaudeCodeHooks = () => {
  fs.mkdirSync(CLAUDE_HOOK_DIR, { recursive: true });

  const hookSource = path.resolve(__dirname, "claude-code-hook.js");
  if (!fs.existsSync(hookSource)) {
    console.error(`  ! Hook file not found: ${hookSource}`);
    return false;
  }

  fs.copyFileSync(hookSource, CLAUDE_HOOK_FILE);

  const hookCommand = `node ${CLAUDE_HOOK_FILE}`;
  const hooksConfig = {
    SessionStart: [{ matcher: "", hooks: [{ type: "command", command: hookCommand }] }],
    UserPromptSubmit: [{ matcher: "", hooks: [{ type: "command", command: hookCommand }] }],
    PreToolUse: [{ matcher: "", hooks: [{ type: "command", command: hookCommand }] }],
    PostToolUse: [{ matcher: "", hooks: [{ type: "command", command: hookCommand }] }],
    PostToolUseFailure: [{ matcher: "", hooks: [{ type: "command", command: hookCommand }] }],
    PermissionRequest: [{ matcher: "", hooks: [{ type: "command", command: hookCommand }] }],
    Notification: [{ matcher: "", hooks: [{ type: "command", command: hookCommand }] }],
    SubagentStart: [{ matcher: "", hooks: [{ type: "command", command: hookCommand }] }],
    SubagentStop: [{ matcher: "", hooks: [{ type: "command", command: hookCommand }] }],
    Stop: [{ matcher: "", hooks: [{ type: "command", command: hookCommand }] }],
    PreCompact: [{ matcher: "", hooks: [{ type: "command", command: hookCommand }] }],
    SessionEnd: [{ matcher: "", hooks: [{ type: "command", command: hookCommand }] }],
  };

  let settings = { hooks: {} };
  if (fs.existsSync(CLAUDE_SETTINGS_PATH)) {
    try {
      settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, "utf8"));
    } catch {
      settings = { hooks: {} };
    }
  }

  settings.hooks = settings.hooks || {};
  Object.entries(hooksConfig).forEach(([eventName, value]) => {
    settings.hooks[eventName] = value;
  });

  fs.writeFileSync(CLAUDE_SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  console.log(`  ✓ Claude Code hooks installed`);
  return true;
};

// Remove claude-code hooks
const removeClaudeCodeHooks = () => {
  let removed = false;

  if (fs.existsSync(CLAUDE_HOOK_FILE)) {
    fs.unlinkSync(CLAUDE_HOOK_FILE);
    removed = true;
  }

  if (fs.existsSync(CLAUDE_SETTINGS_PATH)) {
    try {
      const settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, "utf8"));
      if (settings.hooks) {
        let modified = false;
        for (const eventName of Object.keys(settings.hooks)) {
          const hooks = settings.hooks[eventName];
          if (Array.isArray(hooks)) {
            const filtered = hooks.filter((h) => {
              if (Array.isArray(h.hooks)) {
                h.hooks = h.hooks.filter((inner) => !inner.command?.includes("opencode-pixel-office-hook"));
                return h.hooks.length > 0;
              }
              return !h.command?.includes("opencode-pixel-office-hook");
            });
            if (filtered.length !== hooks.length) {
              settings.hooks[eventName] = filtered;
              modified = true;
            }
            if (filtered.length === 0) {
              delete settings.hooks[eventName];
            }
          }
        }
        if (Object.keys(settings.hooks).length === 0) {
          delete settings.hooks;
        }
        if (modified) {
          fs.writeFileSync(CLAUDE_SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
        }
      }
    } catch {}
  }

  if (removed) {
    console.log(`✓ Removed Claude Code hooks`);
  }
  return removed;
};

// Install the standalone app (server + client)
const installApp = async (port) => {
  const rootSource = path.resolve(__dirname, "..");

  console.log(`\nInstalling Pixel Office app...`);
  fs.mkdirSync(DEFAULT_APP_DIR, { recursive: true });

  // Copy server
  copyRecursiveSync(path.join(rootSource, "server"), path.join(DEFAULT_APP_DIR, "server"));

  // Copy client/dist
  const clientDist = path.join(rootSource, "client", "dist");
  if (fs.existsSync(clientDist)) {
    copyRecursiveSync(clientDist, path.join(DEFAULT_APP_DIR, "client", "dist"));
  }

  // Copy package.json
  fs.copyFileSync(path.join(rootSource, "package.json"), path.join(DEFAULT_APP_DIR, "package.json"));

  // Save config
  const configData = loadConfig();
  if (port) {
    configData.port = port;
  }
  saveConfig(configData);

  // npm install
  console.log("  Installing dependencies...");
  try {
    execSync("npm install --omit=dev --no-package-lock", {
      cwd: DEFAULT_APP_DIR,
      stdio: "pipe",
    });
    console.log(`  ✓ App installed`);
  } catch (e) {
    console.error("  ! Failed to install dependencies");
  }
};

const run = async () => {
  if (shouldVersion) {
    console.log(`opencode-pixel-office v${getVersion()}`);
    process.exit(0);
  }

  // STATUS
  if (shouldStatus) {
    console.log(`\nPixel Office Status:\n`);
    console.log(`  OpenCode plugin:  ${isOpencodeInstalled() ? "✓ Installed" : "✗ Not installed"}`);
    console.log(`  Claude Code hooks: ${isClaudeCodeInstalled() ? "✓ Installed" : "✗ Not installed"}`);
    console.log(`  App/Server:        ${isAppInstalled() ? "✓ Installed" : "✗ Not installed"}`);

    const config = loadConfig();
    const port = config.port || 5100;

    let serverRunning = false;
    try {
      const pidOutput = execSync(`lsof -t -i :${port} 2>/dev/null`).toString().trim();
      serverRunning = !!pidOutput;
    } catch {}

    console.log(`  Server:            ${serverRunning ? `✓ Running on port ${port}` : "✗ Not running"}`);
    console.log("");
    process.exit(0);
  }

  // INSTALL
  if (shouldInstall) {
    console.log(`\nInstalling Pixel Office...\n`);

    // Install OpenCode plugin
    console.log("OpenCode:");
    installOpencodePlugin();

    // Install Claude Code hooks
    console.log("\nClaude Code:");
    installClaudeCodeHooks();

    // Install app
    const port = portArg ? parseInt(portArg, 10) : null;
    await installApp(port);

    console.log("\n✓ Installation complete!");
    console.log("\nBoth OpenCode and Claude Code are now connected.");
    console.log("Run 'opencode-pixel-office start' to launch the server.");
    process.exit(0);
  }

  // UNINSTALL
  if (shouldUninstall) {
    const config = loadConfig();
    const port = config.port || 5100;

    console.log("\nUninstalling Pixel Office...\n");

    console.log("Stopping server...");
    if (!stopServer(port)) {
      console.log("- Server not running");
    }

    // Remove OpenCode plugin
    if (!removeOpencodePlugin()) {
      console.log("- OpenCode plugin not found");
    }

    // Remove Claude Code hooks
    if (!removeClaudeCodeHooks()) {
      console.log("- Claude Code hooks not found");
    }

    // Remove app directory
    if (fs.existsSync(DEFAULT_APP_DIR)) {
      fs.rmSync(DEFAULT_APP_DIR, { recursive: true, force: true });
      console.log(`✓ Removed app directory`);
    }

    console.log("\n✓ Uninstallation complete.");
    process.exit(0);
  }

  // START
  if (shouldStart) {
    const config = loadConfig();
    const port = portArg ? parseInt(portArg, 10) : config.port || 5100;
    const serverScript = "server/index.ts";

    const rootSource = path.resolve(__dirname, "..");
    const localServerPath = path.join(rootSource, "server", "index.ts");
    const globalServerPath = path.join(DEFAULT_APP_DIR, "server", "index.ts");

    let serverCwd;
    if (fs.existsSync(localServerPath)) {
      serverCwd = rootSource;
    } else if (fs.existsSync(globalServerPath)) {
      serverCwd = DEFAULT_APP_DIR;
    } else {
      console.error("Server not found. Run 'opencode-pixel-office install' first.");
      process.exit(1);
    }

    // Check if already running
    try {
      const pidOutput = execSync(`lsof -t -i :${port} 2>/dev/null`).toString().trim();
      if (pidOutput) {
        console.log(`Pixel Office is already running on port ${port}`);
        const url = `http://localhost:${port}`;
        const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
        try {
          execSync(`${openCmd} ${url}`);
        } catch {}
        console.log(`Opened ${url}`);
        process.exit(0);
      }
    } catch {}

    // Resolve tsx binary
    let tsxBin = null;
    const tsxLocations = [
      path.join(serverCwd, "node_modules", ".bin", "tsx"),
      path.join(__dirname, "..", "node_modules", ".bin", "tsx"),
      path.join(DEFAULT_APP_DIR, "node_modules", ".bin", "tsx"),
    ];
    for (const loc of tsxLocations) {
      if (fs.existsSync(loc)) {
        tsxBin = loc;
        break;
      }
    }
    if (!tsxBin) {
      tsxBin = "tsx";
    }

    const { spawn } = await import("node:child_process");

    const child = spawn(tsxBin, [serverScript], {
      cwd: serverCwd,
      env: { ...process.env, PORT: String(port) },
      detached: true,
      stdio: "ignore",
    });

    child.on("error", (err) => {
      console.error(`Failed to start server: ${err.message}`);
      process.exit(1);
    });

    child.unref();

    console.log(`Pixel Office server started on port ${port} (PID: ${child.pid})`);

    await new Promise((r) => setTimeout(r, 1500));
    const url = `http://localhost:${port}`;
    const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    try {
      execSync(`${openCmd} ${url}`);
    } catch {}
    console.log(`Opened ${url}`);
    process.exit(0);
  }

  // STOP
  if (shouldStop) {
    const config = loadConfig();
    const port = config.port || 5100;
    console.log(`Stopping Pixel Office server on port ${port}...`);
    if (!stopServer(port)) {
      console.log(`- No server found on port ${port}`);
    }
    process.exit(0);
  }

  // DEFAULT: show help
  printHelp();
  process.exit(0);
};

run().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
