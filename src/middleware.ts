export { default } from "next-auth/middleware";

// Only protect routes that require Spotify auth.
// Leave the homepage and DB-backed read endpoints open for local testing.
export const config = {
  matcher: [
    "/api/albums",
    "/api/save-albums",
    // add app routes to protect when you’re ready, e.g. "/albums"
  ],
};
