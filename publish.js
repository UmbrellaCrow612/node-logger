const { execSync } = require("child_process");

function run(cmd) {
  console.log(`\n🟦 Running: ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

try {
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
