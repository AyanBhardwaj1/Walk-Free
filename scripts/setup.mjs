import { constants, copyFileSync, chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";

if (Number(process.versions.node.split(".")[0]) < 24) {
  console.error("Walk-Free requires Node.js 24 or newer. Install Node 24, then rerun npm run setup.");
  process.exit(1);
}

const envPath = fileURLToPath(new URL("../.env", import.meta.url));
const examplePath = fileURLToPath(new URL("../.env.example", import.meta.url));
try {
  copyFileSync(examplePath, envPath, constants.COPYFILE_EXCL);
  if (process.platform !== "win32") chmodSync(envPath, 0o600);
  console.log("Created private .env configuration. Set WALK_FREE_OPENAI_API_KEY there to enable the assistant.");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log("Kept your existing .env unchanged.");
}
console.log("After installation, run npm run dev and open http://localhost:5173.");
