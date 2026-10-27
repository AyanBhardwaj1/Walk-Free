# iOS and Android

Capacitor 8 projects are in `ios/` and `android/`. The free community background-geolocation and text-to-speech plugins are installed. GPS starts only when the user starts a mapped walk and ends when the walk ends. Browser builds use foreground Geolocation and Web Speech; a browser cannot provide reliable locked-screen GPS.

1. Deploy the API to your own HTTPS host, for example your Vercel project.
2. Set the nonsecret `VITE_API_BASE_URL` to that HTTPS origin for the mobile build.
3. Run `npm run build` and `npx cap sync`.
4. On macOS with Xcode, open `npx cap open ios`; configure your signing team and test on an iPhone.
5. With Android Studio and its SDK installed, open `npx cap open android`; build and test on an Android phone.

The iOS project declares location usage descriptions and location/audio background modes. Android declares location, foreground location service and notification permissions. The adapter requests notification permission on Android before starting background GPS. Capacitor's legacy bridge is enabled as the plugin documents for persistent Android location updates. Verify the OS's actual permission state; source configuration alone does not establish background behavior.

Required device tests: grant and deny permissions; navigate with the screen locked for more than five minutes; verify off-route recalculation and spoken road guidance; stop the trip and confirm tracking/notifications stop; test lost GPS, stale fixes, network loss, app suspension, low-power mode, and reentry from background. Current filtering excludes location fixes older than one minute or less accurate than 100 m. Arrival detection uses the destination graph node, so it needs real-device tuning. Background app termination/recovery is not implemented.

Native project generation succeeded in this workspace. Native compilation, signing, app-store distribution, and these device checks have not run. iOS compilation requires macOS/Xcode; Android compilation requires a configured Android SDK. Distribution requirements and any store fees are separate from the free application dependencies.
