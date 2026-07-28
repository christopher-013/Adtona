import { cp, copyFile, lstat, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.join(projectRoot, "dist");

const requiredFiles = [
  "index.html",
  "robots.txt",
  "sitemap.xml",
  "version.js",
  "catalogs.json",
  "dynamic-catalog.js",
  "app.js",
  "styles.css",
  "export-styles.js",
  "icon-source.js",
  "photo-store.js",
  "trip-schema.js",
  "beta-tools.js",
  "plan-x-guide-centered-compass-morph-clean-x.svg",
  "adtona-logo.png",
  "adtona-mark.png",
  "manifest.webmanifest",
  "sw.js"
];

const optionalFiles = ["precomputed-catalogs.json"];
const requiredDirectories = ["icons"];

if (path.dirname(outputDirectory) !== projectRoot || path.basename(outputDirectory) !== "dist") {
  throw new Error(`Refusing to clean an unexpected output directory: ${outputDirectory}`);
}

await rm(outputDirectory, {
  recursive: true,
  force: true,
  maxRetries: process.platform === "win32" ? 8 : 2,
  retryDelay: 150
});
await mkdir(outputDirectory, { recursive: true });

for (const relativePath of requiredFiles) {
  const source = path.join(projectRoot, relativePath);
  const metadata = await lstat(source);
  if (!metadata.isFile()) throw new Error(`Required deployment asset is not a file: ${relativePath}`);
  await copyFile(source, path.join(outputDirectory, relativePath));
}

for (const relativePath of optionalFiles) {
  const source = path.join(projectRoot, relativePath);
  try {
    const metadata = await lstat(source);
    if (metadata.isFile()) await copyFile(source, path.join(outputDirectory, relativePath));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

for (const relativePath of requiredDirectories) {
  await cp(path.join(projectRoot, relativePath), path.join(outputDirectory, relativePath), {
    recursive: true,
    force: true,
    errorOnExist: false
  });
}

console.log(`Cloudflare static bundle assembled in ${outputDirectory}.`);
