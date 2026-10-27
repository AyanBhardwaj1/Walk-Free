import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "app.walkfree.mobile",
  appName: "Walk-Free",
  webDir: "dist",
  android: { useLegacyBridge: true },
  plugins: { SplashScreen: { launchAutoHide: true } },
};
export default config;
