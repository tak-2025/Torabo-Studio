import fs from "fs/promises";
import path from "path";
import url from "url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.resolve(__filename, "../..");

const dataFilePath = path.resolve(__dirname, "src", "data", "release-data.json");

// Offline-safe fallback so DownloadPage.tsx (uses .assets / .tag_name) never breaks.
const FALLBACK = { tag_name: "unknown", assets: [] };

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function generateReleaseData() {
  try {
    const response = await fetch(
      "https://api.github.com/repos/zmkfirmware/zmk-studio/releases/latest",
      {
        headers: process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {},
        // Fail fast when offline instead of hanging ~10s and aborting startup.
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    await fs.mkdir(path.dirname(dataFilePath), { recursive: true });
    await fs.writeFile(dataFilePath, JSON.stringify(data));
    console.log("Release data generated successfully!");
  } catch (error) {
    // Network/GitHub failure must NOT block the app from starting. Keep the
    // cached file if present, otherwise write a minimal fallback. Never exit(1).
    console.warn(
      "Release data fetch skipped (offline or GitHub unreachable):",
      error?.message || error,
    );
    if (await fileExists(dataFilePath)) {
      console.log("Kept existing src/data/release-data.json (offline-safe).");
    } else {
      await fs.mkdir(path.dirname(dataFilePath), { recursive: true });
      await fs.writeFile(dataFilePath, JSON.stringify(FALLBACK));
      console.log("Wrote fallback src/data/release-data.json (offline).");
    }
  }
}

generateReleaseData();
