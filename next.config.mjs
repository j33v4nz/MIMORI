/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.MIMORI_DIST_DIR || ".next",
  output: "standalone",
  reactStrictMode: true,
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "*.local",
    ...(process.env.MIMORI_DEV_ALLOWED_ORIGINS || "")
      .split(",")
      .map((hostname) => hostname.trim())
      .filter(Boolean)
  ],
  turbopack: {
    root: process.cwd()
  },
  async redirects() {
    return [
      {
        source: "/overview",
        destination: "/",
        permanent: true
      }
    ];
  },
  async headers() {
    const isProd = process.env.NODE_ENV === "production";

    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY"
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff"
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin"
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()"
          },
          ...(isProd
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload"
                }
              ]
            : []),
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https://images.unsplash.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              isProd
                ? "connect-src 'self' https://*.supabase.co"
                : "connect-src 'self' http: https: ws: wss:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'"
            ].join("; ")
          }
        ]
      }
    ];
  }
};

export default nextConfig;
