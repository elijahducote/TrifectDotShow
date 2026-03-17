// Multi-use
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { print } from "./lib/utility.js";

// Hono Server
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { logger } from "hono/logger"; // Middleware
import { wrapper } from "./lib/wrapper.js";

// Initialization
const app = new Hono(),
cwd = dirname(fileURLToPath(import.meta.url)),
reservedPaths = [
  "cdn",
  "web",
  "src",
  "assets"  // Add assets to reserved paths
];

// Definitions
function isReserved (path,routes) {
  for (let i = routes.length;i;--i) {
    if (path.startsWith(`/${routes[i - 1]}`)) return false;
  }
  return true;
}

function getPageName(path) {
  // Extract the page name from path, e.g. "/about" -> "about", "/" -> "home"
  const cleaned = path.replace(/^\/+|\/+$/g, '');
  return cleaned || 'home';
}

// ============================================
// MIME Types for streaming media
// ============================================
const MIME_TYPES = {
  // Video streaming manifests
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.mpd': 'application/dash+xml',
  
  // Video segments
  '.ts': 'video/mp2t',
  '.m4s': 'video/iso.segment',
  '.mp4': 'video/mp4',
  
  // Thumbnails
  '.vtt': 'text/vtt',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  
  // Web assets
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml'
};

function getMimeType(path) {
  const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

// ============================================
// Streaming CORS and Cache Headers Middleware
// ============================================
app.use('/assets/*', async (c, next) => {
  // Set CORS headers for streaming (required for HLS.js and dash.js)
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Range, Content-Type');
  c.header('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  
  // Handle preflight requests
  if (c.req.method === 'OPTIONS') {
    return c.text('', 204);
  }
  
  await next();
  
  // Set appropriate cache headers based on file type
  const path = c.req.path;
  
  if (path.endsWith('.m3u8') || path.endsWith('.mpd')) {
    // Manifests: short cache for live, longer for VOD
    c.header('Cache-Control', 'public, max-age=2');
  } else if (path.endsWith('.ts') || path.endsWith('.m4s')) {
    // Segments: cache longer since they're immutable
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (path.endsWith('.vtt')) {
    // VTT thumbnails: cache moderately
    c.header('Cache-Control', 'public, max-age=3600');
  } else if (path.endsWith('.jpg') || path.endsWith('.png') || path.endsWith('.webp')) {
    // Sprite sheets and images: cache long
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
  }
  
  // Enable range requests for video segments
  c.header('Accept-Ranges', 'bytes');
});

// ============================================
// Assets Route (HLS, DASH, Thumbnails)
// ============================================
app.get(
  "/assets/*",
  serveStatic({
    root: "./assets",
    rewriteRequestPath: (path) => path.replace(/^\/assets\/(\/?.+)?$/, "/$1"),
    mimes: MIME_TYPES
  })
);

// Alternative: If your assets are directly in ./nav/assets/
// This serves:
//   /assets/hls/master.m3u8      -> ./nav/assets/hls/master.m3u8
//   /assets/hls/thumbnails.vtt   -> ./nav/assets/hls/thumbnails.vtt
//   /assets/hls/thumbnails/sprite.jpg -> ./nav/assets/hls/thumbnails/sprite.jpg
//   /assets/dash/manifest.mpd    -> ./nav/assets/dash/manifest.mpd

// ============================================
// CDN Route (existing)
// ============================================
app.get(
  "/cdn/*",
  serveStatic({
    root: "./nav",
    rewriteRequestPath: (path) => path.replace(/^\/cdn\/([^\/]+)\/(.+)$/, "/$1/media/$2"),
    mimes: MIME_TYPES
  })
);

// ============================================
// Web Route (existing)
// ============================================
app.get(
  "/web/*",
  serveStatic({
    root: "./nav",
    rewriteRequestPath: (path) => path.replace(/^\/web\/(\/?.+)?$/, "/$1"),
    mimes: MIME_TYPES
  })
);

// ============================================
// Source Route (existing)
// ============================================
app.get(
  "/src/*",
  serveStatic({
    root: "./dploy",
    rewriteRequestPath: (path) => path.replace(/^\/src\/(\/?.+)?$/, "/$1"),
    mimes: MIME_TYPES
  })
);

// ============================================
// Serve static files for non-reserved paths
// ============================================
app.use("*", async (c, next) => {
  if (isReserved(c.req.path, reservedPaths)) {
    const pageName = getPageName(c.req.path);
    const cmd = Bun.spawn(["bun", "build.js", pageName],
    {
      env: {
      ...process.env,
      PATH: `${process.env.PATH}:/root/.bun/bin/`
    },
      stdin: "inherit",
      stdout: "inherit"
    });
    await cmd.exited;
    return await serveStatic({ 
      root: "./nav/",
      index: "index.html",
      mimes: MIME_TYPES
    })(c, next);
  }
  await next();
});

export default { 
  port: 3000, 
  fetch: app.fetch, 
} 
print(`Running on http://127.0.0.1:3000`);