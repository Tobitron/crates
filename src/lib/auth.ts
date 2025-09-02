import type { NextAuthOptions } from "next-auth";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import SpotifyProvider from "next-auth/providers/spotify";
import { refreshSpotifyAccessToken, SPOTIFY_SCOPES } from "@/lib/spotify";

export const authOptions: NextAuthOptions = {
  providers: [
    SpotifyProvider({
      clientId: process.env.SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: SPOTIFY_SCOPES,
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, user }) {
      // Initial sign in
      if (account && user) {
        const t: JWT & {
          accessToken?: string;
          refreshToken?: string;
          accessTokenExpires?: number;
          user?: Session["user"];
        } = {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: Date.now() + (account.expires_in as number) * 1000,
          user,
        };
        return t;
      }

      // Return previous token if the access token has not expired yet
      if (token.accessToken && token.accessTokenExpires && Date.now() < (token.accessTokenExpires as number)) {
        return token;
      }

      // Access token has expired, try to update it
      const refreshed = await refreshSpotifyAccessToken({
        accessToken: token.accessToken as string,
        accessTokenExpires: token.accessTokenExpires as number,
        refreshToken: token.refreshToken as string,
      });

      const t: JWT & {
        accessToken?: string;
        refreshToken?: string;
        accessTokenExpires?: number;
      } = {
        ...token,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        accessTokenExpires: refreshed.accessTokenExpires,
      };
      return t;
    },
    async session({ session, token }) {
      const s = {
        ...session,
        accessToken: (token as JWT & { accessToken?: string }).accessToken,
        user: (token as JWT & { user?: Session["user"] }).user || session.user,
      } as Session & { accessToken?: string };
      return s;
    },
  },
  pages: {
    signIn: "/", // use home as entry
  },
  secret: process.env.NEXTAUTH_SECRET,
};
