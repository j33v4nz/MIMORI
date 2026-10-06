import { execSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

async function main() {
  const envLocalPath = path.resolve(".env.local");
  const envExamplePath = path.resolve(".env.example");

  if (!fs.existsSync(envLocalPath)) {
    console.log("Copying .env.example to .env.local...");
    fs.copyFileSync(envExamplePath, envLocalPath);
  }

  console.log("Starting local Supabase stack...");
  try {
    execSync("npx --yes supabase@2.119.0 start", { stdio: "inherit" });
  } catch (error) {
    console.error("\nError: Failed to start Supabase. Please ensure your Docker daemon is running and try again.");
    process.exit(1);
  }

  console.log("\nApplying pending local migrations (preserving existing data)...");
  try {
    execSync("npx --yes supabase@2.119.0 migration up --local", { stdio: "inherit" });
    const config = fs.readFileSync(path.resolve("supabase/config.toml"), "utf-8");
    const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
    if (!projectId) throw new Error("Missing Supabase project_id");
    for (const seed of ["000_dev_org.sql", "001_rules.sql"]) {
      execFileSync("docker", ["exec", "-i", `supabase_db_${projectId}`,
        "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
        input: fs.readFileSync(path.resolve("supabase/seed", seed), "utf-8"),
        stdio: ["pipe", "inherit", "inherit"]
      });
    }
  } catch (error) {
    console.error("\nError: Failed to apply local migrations or seeds.", error.message);
    process.exit(1);
  }

  console.log("\nFetching local Supabase keys...");
  let statusOutput = "";
  try {
    statusOutput = execSync("npx --yes supabase@2.119.0 status -o env", { encoding: "utf-8" });
  } catch (error) {
    console.error("\nError: Failed to read Supabase status.");
    process.exit(1);
  }

  const keys = {};
  const lines = statusOutput.split("\n");
  for (const line of lines) {
    const match = line.match(/^([A-Z_]+)="?([^"\r\n]+)"?/);
    if (match) {
      keys[match[1]] = match[2];
    }
  }

  const apiUrl = keys["API_URL"];
  const anonKey = keys["ANON_KEY"];
  const serviceRoleKey = keys["SERVICE_ROLE_KEY"];

  if (!apiUrl || !anonKey || !serviceRoleKey) {
    console.error("\nError: Could not extract all required Supabase credentials from status output.");
    process.exit(1);
  }

  let envContent = fs.readFileSync(envLocalPath, "utf-8");

  // Helper to securely update or add an environment key
  const updateEnvKey = (content, key, value) => {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(content)) {
      return content.replace(regex, `${key}=${value}`);
    }
    return content.trim() + `\n${key}=${value}\n`;
  };

  envContent = updateEnvKey(envContent, "NEXT_PUBLIC_SUPABASE_URL", apiUrl);
  envContent = updateEnvKey(envContent, "NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey);
  envContent = updateEnvKey(envContent, "SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey);

  fs.writeFileSync(envLocalPath, envContent, "utf-8");

  console.log("\n========================================================");
  console.log("SUCCESS: Local Supabase environment configured in .env.local!");
  console.log("========================================================");
  console.log("You are ready to run:");
  console.log("  npm run dev      # Start the dashboard");
  console.log("  Open http://localhost:3000 and sign up (local confirmation: http://127.0.0.1:54324).");
  console.log("  Create a unique key in API Keys, then export MIMORI_DEV_API_KEY=your_key.");
  console.log("  npm run demo     # Send sample telemetry & view Behavior Diff");
  console.log("  Existing ingestion keys are preserved; setup does not generate a demo key.");
  console.log("========================================================\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
