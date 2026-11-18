"use client";

/**
 * Next.js custom image loader for Cloudinary.
 *
 * This file is referenced by `next.config.ts → images.loaderFile`.
 * It is called by `next/image` for every image with a Cloudinary src URL.
 *
 * For LOCAL images (starting with `/`) and Vercel Blob URLs, we return the
 * original src unchanged — Next.js built-in optimisation handles those.
 *
 * Free-plan note: each unique (src × width) pair is ONE transformation.
 * Cloudinary caches the result indefinitely, so the monthly quota of
 * 1,000 transformations is consumed only on cache misses (first request
 * per unique image × width combination).
 */

interface LoaderParams {
  src: string;
  width: number;
  quality?: number;
}

export default function cloudinaryLoader({ src, width, quality }: LoaderParams): string {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

  // Pass-through: local static files and Vercel Blob URLs
  if (!cloudName || !src.startsWith("https://res.cloudinary.com/")) {
    return src;
  }

  // Extract public ID from an existing Cloudinary URL so we can rebuild it
  // with our preferred transformation string.
  const uploadSegment = "/image/upload/";
  const uploadIdx = src.indexOf(uploadSegment);
  if (uploadIdx === -1) return src;

  const afterUpload = src.slice(uploadIdx + uploadSegment.length);
  const parts = afterUpload.split("/");

  const publicIdParts: string[] = [];
  let versionPrefix = "";

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (i === 0 && /^v\d+$/.test(p)) {
      versionPrefix = p + "/";
      continue;
    }
    // Skip existing transformation segments (contain commas or c_/f_/q_/w_/h_)
    if (p.includes(",") || /^[a-z]_/.test(p)) continue;
    publicIdParts.push(p);
  }

  const publicId = publicIdParts.join("/");
  if (!publicId) return src;

  // Build a compact, free-plan-friendly transformation string.
  // - f_auto  → Cloudinary picks WebP / AVIF / JPEG automatically per browser
  // - q_auto  → smart quality (looks great, tiny file size)
  // - w_<n>   → resize to the requested width (height auto-scales)
  // - c_limit → never upscale; keeps bandwidth low on small viewports
  const q = quality ?? 75;
  const transforms = `f_auto,q_${q},w_${width},c_limit`;

  return `https://res.cloudinary.com/${cloudName}/image/upload/${transforms}/${versionPrefix}${publicId}`;
}
