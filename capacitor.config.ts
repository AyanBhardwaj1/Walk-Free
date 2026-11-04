import type { CapacitorConfig } from "@capacitor/cli";

// The app opens the hosted site, so sign-in cookies and the API share its
// origin. WALK_FREE_NATIVE_URL points it at another deployment; set it empty
// to bundle the web build instead (that needs VITE_API_BASE_URL and a CORS
// setup for accounts, see docs/MOBILE.md).
const hosted =
  process.env.WALK_FREE_NATIVE_URL ?? "https://walk-free.vercel.app";
const config: CapacitorConfig = {
  appId: "app.walkfree.mobile",
  appName: "Walk-Free",
  webDir: "dist",
  android: { useLegacyBridge: true },
  plugins: { SplashScreen: { launchAutoHide: true } },
  ...(hosted
    ? {
        server: {
          url: hosted,
          allowNavigation: [new URL(hosted).host],
        },
      }
    : {}),
};
export default config;
