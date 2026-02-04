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

const args = process.argv.slice(2);
const shouldInstall = args.includes("install");
const yesFlag = args.includes("--yes") || args.includes("-y");
const skipJson = args.includes("--no-json");
const portIndex = args.findIndex((arg) => arg === "--port");
const portArg = portIndex !== -1 ? args[portIndex + 1] : null;

const printHelp = () => {
  console.log("opencode-pixel-office installer\n");
  console.log("Usage:");
  console.log("  opencode-pixel-office install [--yes] [--port <number>]");
  console.log("\nOptions:");
  console.log("  --port <number> Configure the server port (default: 5100)");
  console.log("  --no-json       Skip updating opencode.json");
  console.log("  --yes, -y       Overwrite without prompting");
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

const run = async () => {
  if (!shouldInstall) {
    printHelp();
    process.exit(0);
  }

  const rootSource = path.resolve(__dirname, "..");
  const pluginSource = path.join(rootSource, "plugin", PLUGIN_NAME);

  if (!fs.existsSync(pluginSource)) {
    console.error(`Plugin file not found: ${pluginSource}`);
    process.exit(1);
  }

  // 1. Install Plugin Script
  fs.mkdirSync(DEFAULT_PLUGIN_DIR, { recursive: true });
  const targetPluginPath = path.join(DEFAULT_PLUGIN_DIR, PLUGIN_NAME);

  if (fs.existsSync(targetPluginPath) && !yesFlag) {
    const answer = await prompt(`Overwrite existing ${PLUGIN_NAME}? (y/N): `);
    if (answer !== "y" && answer !== "yes") {
      console.log("Aborted.");
      process.exit(0);
    }
  }
  fs.copyFileSync(pluginSource, targetPluginPath);
  console.log(`✓ Installed plugin to ${targetPluginPath}`);

  // 2. Install Standalone App (Server + Client)
  console.log(`Installing standalone app to ${DEFAULT_APP_DIR}...`);
  if (fs.existsSync(DEFAULT_APP_DIR)) {
    // rudimentary clean? probably safer to just overwrite
  } else {
    fs.mkdirSync(DEFAULT_APP_DIR, { recursive: true });
  }

  // Copy server
  console.log("  - Copying server...");
  copyRecursiveSync(path.join(rootSource, "server"), path.join(DEFAULT_APP_DIR, "server"));

  // Copy client/dist
  console.log("  - Copying client assets...");
  const clientDist = path.join(rootSource, "client", "dist");
  if (fs.existsSync(clientDist)) {
    copyRecursiveSync(clientDist, path.join(DEFAULT_APP_DIR, "client", "dist"));
  } else {
    console.warn("  ! Warning: client/dist not found. Did you run 'npm run build:client'?");
  }

  // Copy package.json
  console.log("  - Copying package.json...");
  fs.copyFileSync(path.join(rootSource, "package.json"), path.join(DEFAULT_APP_DIR, "package.json"));

  // Save Port Config if specified
  if (portArg) {
    const port = parseInt(portArg, 10);
    if (!isNaN(port)) {
      const configData = { port };
      fs.writeFileSync(PIXEL_OFFICE_CONFIG_PATH, JSON.stringify(configData, null, 2), "utf8");
      console.log(`  - Saved port configuration: ${port}`);
    } else {
      console.warn("  ! Invalid port number provided. Using default.");
    }
  } else if (!fs.existsSync(PIXEL_OFFICE_CONFIG_PATH)) {
    // Ensure a default config exists or verify if we need one? 
    // For now, let's leave it minimal. The plugin defaults to 5100.
  }

  // npm install
  console.log("  - Installing production dependencies...");
  try {
    execSync("npm install --omit=dev --no-package-lock", {
      cwd: DEFAULT_APP_DIR,
      stdio: "inherit"
    });
  } catch (e) {
    console.error("  ! Failed to install dependencies:", e.message);
  }

  console.log(`✓ Standalone app installed to ${DEFAULT_APP_DIR}`);

  await updateConfig();
  console.log("\nSuccess! Restart OpenCode to launch Pixel Office.");
};

run().catch((error) => {
  console.error("Installer failed:", error);
  process.exit(1);
});

const updateConfig = async () => {
  if (skipJson) {
    return;
  }
  if (!fs.existsSync(DEFAULT_CONFIG_PATH)) {
    return;
  }
  try {
    const raw = fs.readFileSync(DEFAULT_CONFIG_PATH, "utf8");
    const data = JSON.parse(raw);
    const list = Array.isArray(data.plugin) ? data.plugin : [];
    if (!list.includes(PLUGIN_ID)) {
      data.plugin = [...list, PLUGIN_ID];
      fs.writeFileSync(DEFAULT_CONFIG_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
      console.log(`✓ Added ${PLUGIN_ID} to opencode.json`);
    }
  } catch (error) {
    console.warn(`Failed to update ${DEFAULT_CONFIG_PATH}:`, error);
  }
};
