#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLUGIN_NAME = "pixel-office.js";
const PLUGIN_ID = "opencode-pixel-office@latest";
const DEFAULT_TARGET_DIR = path.join(os.homedir(), ".opencode", "plugins");
const DEFAULT_CONFIG_PATH = path.join(os.homedir(), ".config", "opencode", "opencode.json");

const args = process.argv.slice(2);
const shouldInstall = args.includes("install");
const yesFlag = args.includes("--yes") || args.includes("-y");
const skipJson = args.includes("--no-json");
const targetIndex = args.findIndex((arg) => arg === "--target");
const configIndex = args.findIndex((arg) => arg === "--config");
const targetDir =
  targetIndex !== -1 && args[targetIndex + 1]
    ? args[targetIndex + 1]
    : DEFAULT_TARGET_DIR;
const configPath =
  configIndex !== -1 && args[configIndex + 1]
    ? args[configIndex + 1]
    : DEFAULT_CONFIG_PATH;

const printHelp = () => {
  console.log("opencode-pixel-office installer\n");
  console.log("Usage:");
  console.log("  opencode-pixel-office install [--target <dir>] [--yes]");
  console.log("\nOptions:");
  console.log("  --target <dir>  Install into a custom plugin directory");
  console.log("  --config <path> Use a custom opencode.json path");
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

const run = async () => {
  if (!shouldInstall) {
    printHelp();
    process.exit(0);
  }

  const sourcePath = path.resolve(__dirname, "..", "plugin", PLUGIN_NAME);
  if (!fs.existsSync(sourcePath)) {
    console.error(`Plugin file not found: ${sourcePath}`);
    process.exit(1);
  }

  fs.mkdirSync(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, PLUGIN_NAME);

  if (fs.existsSync(targetPath) && !yesFlag) {
    const answer = await prompt(`Overwrite existing ${PLUGIN_NAME}? (y/N): `);
    if (answer !== "y" && answer !== "yes") {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  fs.copyFileSync(sourcePath, targetPath);
  console.log(`Installed ${PLUGIN_NAME} to ${targetDir}`);
  await updateConfig();
  console.log("Start OpenCode to auto-launch Pixel Office.");
};

run().catch((error) => {
  console.error("Installer failed:", error);
  process.exit(1);
});
const updateConfig = async () => {
  if (skipJson) {
    return;
  }
  if (!fs.existsSync(configPath)) {
    console.warn(`opencode.json not found at ${configPath}. Skipping JSON update.`);
    return;
  }
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const data = JSON.parse(raw);
    const list = Array.isArray(data.plugin) ? data.plugin : [];
    if (!list.includes(PLUGIN_ID)) {
      data.plugin = [...list, PLUGIN_ID];
      fs.writeFileSync(configPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
      console.log(`Added ${PLUGIN_ID} to ${configPath}`);
    }
  } catch (error) {
    console.warn(`Failed to update ${configPath}:`, error);
  }
};
