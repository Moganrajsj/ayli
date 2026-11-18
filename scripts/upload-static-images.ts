/**
 * scripts/upload-static-images.ts
 *
 * One-shot script to upload the static marketing images in `public/images/`
 * to Cloudinary. Run once to populate the CDN; images in the DB are handled
 * automatically at upload time via uploads.ts.
 *
 * Usage:
 *   npx tsx scripts/upload-static-images.ts
 *
 * The script prints the mapping of local path → Cloudinary secure_url so you
 * can update hardcoded `/images/…` references in page.tsx / hero-slider.tsx.
 *
 * FREE PLAN NOTE: Each unique image is uploaded once and costs zero
 * transformations on upload. Transformations are only billed on delivery.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

// Load env
const envPath = path.join(process.cwd(), ".env.local");
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
function getEnv(key: string): string {
  const match = envContent.match(new RegExp(`^${key}=["']?([^"'\r\n]+)["']?`, "m"));
  return match?.[1]?.trim() ?? process.env[key] ?? "";
}

const CLOUD_NAME = getEnv("CLOUDINARY_CLOUD_NAME");
const API_KEY = getEnv("CLOUDINARY_API_KEY");
const API_SECRET = getEnv("CLOUDINARY_API_SECRET");

if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
  console.error("❌  CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET must be set in .env.local");
  process.exit(1);
}

function sha1(str: string): string {
  return crypto.createHash("sha1").update(str).digest("hex");
}

async function uploadFile(filePath: string, folder: string): Promise<{ local: string; url: string; publicId: string }> {
  const timestamp = Math.round(Date.now() / 1000);
  const publicId = path.basename(filePath, path.extname(filePath));

  // Cloudinary signature: params must be sorted alphabetically, then append secret
  const signParams: Record<string, string> = {
    folder,
    overwrite: "true",
    public_id: publicId,
    timestamp: String(timestamp),
  };
  const paramsToSign = Object.keys(signParams)
    .sort()
    .map((k) => `${k}=${signParams[k]}`)
    .join("&");
  const signature = sha1(paramsToSign + API_SECRET);

  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const mimeType = fileName.endsWith(".png") ? "image/png"
    : fileName.endsWith(".jpg") || fileName.endsWith(".jpeg") ? "image/jpeg"
    : fileName.endsWith(".webp") ? "image/webp"
    : "application/octet-stream";

  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer], { type: mimeType }), fileName);
  formData.append("api_key", API_KEY);
  formData.append("timestamp", String(timestamp));
  formData.append("signature", signature);
  formData.append("folder", folder);
  // Use the filename (without ext) as the public_id for clean URLs
  formData.append("public_id", publicId);
  // Overwrite if previously uploaded so re-runs are idempotent
  formData.append("overwrite", "true");

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Upload failed for ${filePath}: ${err}`);
  }

  const data = await res.json() as { secure_url: string; public_id: string };
  return { local: filePath, url: data.secure_url, publicId: data.public_id };
}

async function main() {
  const imagesDir = path.join(process.cwd(), "public", "images");
  const extensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

  // Collect all image files recursively
  const files: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (extensions.has(path.extname(entry.name).toLowerCase())) files.push(fullPath);
    }
  }
  walk(imagesDir);

  console.log(`\n📦  Found ${files.length} static images to upload to Cloudinary\n`);

  const mapping: Array<{ local: string; url: string }> = [];

  for (const filePath of files) {
    // Mirror the directory structure under a "static" folder in Cloudinary
    const relDir = path.relative(path.join(process.cwd(), "public"), path.dirname(filePath));
    const folder = `ayli/${relDir.replace(/\\/g, "/")}`;

    process.stdout.write(`  ↑ ${path.relative(process.cwd(), filePath)} … `);
    try {
      const result = await uploadFile(filePath, folder);
      mapping.push({ local: `/${relDir}/${path.basename(filePath)}`, url: result.url });
      console.log(`✓  ${result.url}`);
    } catch (err) {
      console.error(`✗  ${(err as Error).message}`);
    }
  }

  console.log("\n\n━━━  URL MAPPING  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("Copy these Cloudinary URLs into your hero-slider.tsx and page.tsx:\n");
  for (const { local, url } of mapping) {
    console.log(`  "${local}"\n  → "${url}"\n`);
  }

  // Also write a JSON mapping file so it's easy to reference
  const outputPath = path.join(process.cwd(), "scripts", "cloudinary-static-map.json");
  fs.writeFileSync(outputPath, JSON.stringify(mapping, null, 2));
  console.log(`\n📄  Full mapping saved to: ${outputPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
