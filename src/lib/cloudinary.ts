/**
 * Cloudinary image optimization utility — zero-dependency, free-plan compatible.
 *
 * Strategy: build Cloudinary delivery URLs with `f_auto,q_auto` so Cloudinary
 * automatically serves WebP/AVIF at the best quality/size ratio. Width is
 * constrained to the requested size to avoid serving oversized images.
 *
 * Free plan limits (as of 2024):
 *   - 25 GB storage, 25 GB monthly bandwidth, 1,000 transformations/month
 *   - We use `f_auto,q_auto` as a single transformation set so each unique
 *     (publicId × width) pair counts as one transformation, cached thereafter.
 */

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? process.env.CLOUDINARY_CLOUD_NAME ?? "";

const CLOUDINARY_BASE = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload`;

export type CloudinaryFit = "fill" | "scale" | "fit" | "thumb" | "crop";

export interface CloudinaryOptions {
  width?: number;
  height?: number;
  quality?: "auto" | "auto:best" | "auto:good" | "auto:eco" | number;
  format?: "auto" | "webp" | "avif" | "jpg" | "png";
  fit?: CloudinaryFit;
  gravity?: string;
}

/**
 * Returns `true` when the given URL is already a Cloudinary delivery URL.
 */
export function isCloudinaryUrl(url: string): boolean {
  return url.startsWith("https://res.cloudinary.com/");
}

/**
 * Returns `true` when the given URL is a Vercel Blob URL.
 */
export function isVercelBlobUrl(url: string): boolean {
  return url.includes(".public.blob.vercel-storage.com");
}

/**
 * Build an optimized Cloudinary URL from a raw Cloudinary URL or public ID.
 *
 * - If `src` is already a Cloudinary URL the function extracts the public ID
 *   and rebuilds the URL with the requested transformations — so it is safe to
 *   call on any image URL in the database.
 * - If `src` is NOT a Cloudinary URL it is returned unchanged (graceful
 *   fall-through for Vercel Blob URLs or local `/images/…` paths).
 */
export function cloudinaryUrl(
  src: string,
  options: CloudinaryOptions = {}
): string {
  if (!src || !CLOUD_NAME) return src;
  if (!isCloudinaryUrl(src)) return src;

  // Extract the public ID from a full Cloudinary delivery URL.
  // A URL looks like: https://res.cloudinary.com/<cloud>/image/upload/[transforms/]<publicId>
  const uploadSegment = "/image/upload/";
  const uploadIdx = src.indexOf(uploadSegment);
  if (uploadIdx === -1) return src;

  const afterUpload = src.slice(uploadIdx + uploadSegment.length);

  // Strip any existing transformation string (segments that contain commas or
  // known Cloudinary prefixes like `v<digits>`) so we can rebuild cleanly.
  // Public IDs never start with `v` followed by only digits.
  const parts = afterUpload.split("/");
  let publicIdParts: string[] = [];
  let versionPrefix = "";

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (i === 0 && /^v\d+$/.test(p)) {
      // Version segment, e.g. "v1234567890"
      versionPrefix = p + "/";
      continue;
    }
    // Transformation segments contain commas or known single-letter prefixes
    // like w_, h_, f_, q_, c_. Skip them.
    if (p.includes(",") || /^[a-z]_/.test(p)) continue;
    publicIdParts.push(p);
  }

  const publicId = publicIdParts.join("/");
  if (!publicId) return src;

  const transforms = buildTransformString(options);
  return `${CLOUDINARY_BASE}/${transforms}${versionPrefix}${publicId}`;
}

/**
 * Build a transformation string like `f_auto,q_auto,w_800,c_fill,g_center`.
 */
function buildTransformString(options: CloudinaryOptions): string {
  const parts: string[] = [];

  // Format — always auto on free plan (zero extra cost, Cloudinary picks best)
  parts.push(`f_${options.format ?? "auto"}`);
  // Quality — auto is the most bandwidth-efficient choice
  parts.push(`q_${options.quality ?? "auto"}`);

  if (options.fit) parts.push(`c_${options.fit}`);
  if (options.width) parts.push(`w_${options.width}`);
  if (options.height) parts.push(`h_${options.height}`);
  if (options.gravity) parts.push(`g_${options.gravity}`);

  return parts.join(",") + "/";
}

/**
 * Pre-defined responsive widths for `sizes` attributes in Next.js Image.
 * Keep in sync with Tailwind breakpoints used in the site.
 */
export const RESPONSIVE_WIDTHS = {
  /** Product card thumbnail — 2-col mobile, 3-col tablet, 4-col desktop */
  productCard: [320, 480, 640],
  /** Product gallery — full-width mobile, 50% desktop */
  productGallery: [480, 800, 1200],
  /** Hero slider — always full viewport width */
  hero: [640, 1024, 1280, 1920],
  /** Category/mood card — varies by grid */
  categoryCard: [480, 640, 800],
} as const;

/**
 * Upload a file (from a server action) to Cloudinary using the unsigned or
 * signed upload API.  Called from `saveUploadedImage` in uploads.ts.
 *
 * Uses the unsigned upload preset "ayli_products" (create in Cloudinary
 * dashboard → Settings → Upload → Upload presets → Add unsigned preset named
 * "ayli_products"). Unsigned uploads work on the free plan with no extra cost.
 *
 * Returns the secure Cloudinary URL of the uploaded asset.
 */
export async function uploadToCloudinary(file: File): Promise<{ url: string; publicId: string }> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary credentials are not configured.");
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder = "products";

  // Cloudinary signature: ALL extra params must be sorted alphabetically
  // before appending the API secret — missing a param causes "Invalid Signature"
  const signParams: Record<string, string> = {
    folder,
    timestamp: String(timestamp),
  };
  const paramsToSign = Object.keys(signParams)
    .sort()
    .map((k) => `${k}=${signParams[k]}`)
    .join("&");

  // Generate SHA-1 signature using Web Crypto (available in Next.js runtime)
  const signature = await generateSha1Signature(paramsToSign + apiSecret);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", apiKey);
  formData.append("timestamp", String(timestamp));
  formData.append("signature", signature);
  formData.append("folder", folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: "POST", body: formData }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cloudinary upload failed: ${err}`);
  }

  const data = await res.json() as { secure_url: string; public_id: string };
  return { url: data.secure_url, publicId: data.public_id };
}

/** SHA-1 hex string via Web Crypto API (available in both Node.js and Edge) */
async function generateSha1Signature(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
