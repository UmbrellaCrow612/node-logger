import { execSync } from "child_process";
import fs from "fs";
import path from "path";

function run(cmd) {
  console.log(`\n🟦 Running: ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

function deleteFolderIfExists(folderPath) {
  if (fs.existsSync(folderPath)) {
    console.log(`\n🗑️  Deleting existing ${folderPath} folder...`);
    fs.rmSync(folderPath, { recursive: true, force: true });
    console.log(`✅ Deleted ${folderPath}`);
  }
}

try {
  // Delete dist folder if it exists from previous build
  deleteFolderIfExists("./dist");

  // Compile TypeScript
  run("npx tsc");

  // Log in to npm
  run("npm login");

  // Publish to npm
  run("npm publish");

  console.log("\n✅ Publish complete!");
} catch (err) {
  console.error("\n❌ Error during publish process:");
  console.error(err.message);
  process.exit(1);
}
