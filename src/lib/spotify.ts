import qs from "querystring";

type Token = {
  accessToken: string;
  accessTokenExpires: number; // epoch ms
  refreshToken: string;
};

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

export async function refreshSpotifyAccessToken(token: Token) {
  try {
    const basic = Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
    ).toString("base64");

    const res = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: qs.stringify({
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });

    const refreshed = await res.json();

    if (!res.ok) {
      throw new Error(
        `Failed to refresh Spotify token: ${res.status} ${JSON.stringify(
          refreshed
        )}`
      );
    }

    const expiresInSec = refreshed.expires_in as number; // usually 3600

    return {
      ...token,
      accessToken: refreshed.access_token as string,
      accessTokenExpires: Date.now() + expiresInSec * 1000,
      refreshToken: (refreshed.refresh_token as string) ?? token.refreshToken,
    } satisfies Token;
  } catch (e) {
    console.error("Error refreshing Spotify access token", e);
    return {
      ...token,
      // Mark the token invalid; NextAuth will force a new login.
      accessTokenExpires: 0,
    } satisfies Token;
  }
}

export const SPOTIFY_SCOPES = [
  "user-read-email",
  "user-library-read",
  // add more scopes if needed
].join(" ");
