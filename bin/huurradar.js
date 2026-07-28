#!/usr/bin/env node
"use strict";

// Thin launcher so `npx huurradar` works from any directory. Config and the
// SQLite database are resolved against the current working directory, not the
// install location.

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
HuurRadar - Dutch rental finder, watcher and auto-applier

Usage:
  npx huurradar              Start the dashboard and the scrape schedule
  npx huurradar init         Write a .env template into the current directory
  npx huurradar --help       This message

Configuration is read from .env in the current directory. Start with:

  npx huurradar init
  # edit .env
  npx huurradar

The dashboard binds to 127.0.0.1:3000 by default. On first start it prints a
generated admin password unless HUURRADAR_SEED_PASSWORD is set.
`);
  process.exit(0);
}

if (args[0] === "init") {
  const target = path.join(process.cwd(), ".env");
  if (fs.existsSync(target)) {
    console.error(".env already exists here. Refusing to overwrite it.");
    process.exit(1);
  }
  fs.copyFileSync(path.join(__dirname, "..", ".env.example"), target);
  console.log("Wrote .env — open it and fill in your settings, then run: npx huurradar");
  process.exit(0);
}

require("../index.js");
