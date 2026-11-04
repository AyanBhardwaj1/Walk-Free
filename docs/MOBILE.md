# iOS and Android

## Fastest: install the website on your iPhone

Open https://walk-free.vercel.app in Safari, tap **Share**, then **Add to Home Screen**. Walk-Free opens full screen with its own icon, keeps you signed in, and works offline for campuses you've visited. Location, spoken directions and the camera (for the SAM 3.1 photo check) work while the app is open. Locked-screen GPS needs the native app below.

## Native app on your own iPhone (Xcode)

Capacitor 8 projects are in `ios/` and `android/`. The app opens the hosted site (`server.url` in `capacitor.config.ts`), so sign-in cookies and the API share one origin and accounts work. Set `WALK_FREE_NATIVE_URL` to point it at another deployment, or to an empty string to bundle the web build instead (that mode needs `VITE_API_BASE_URL` and cross-origin account support, which is not set up).

1. Install Xcode from the Mac App Store and open it once. Sign in with your Apple ID under **Xcode → Settings → Accounts**. A free Apple ID works for your own phone; apps signed this way expire after 7 days and must be reinstalled from Xcode.
2. On the iPhone, turn on **Settings → Privacy & Security → Developer Mode** (it appears after the phone is first connected to Xcode) and restart.
3. In this folder run `npm run setup` (first time only), then `npm run build` and `npx cap sync ios`.
4. Run `npx cap open ios`. In Xcode select the **App** target → **Signing & Capabilities**, tick **Automatically manage signing**, choose your team, and change the bundle identifier to something unique (e.g. `com.yourname.walkfree`).
5. Plug in the iPhone, pick it as the run destination at the top of Xcode and press **Run** (▶). The first time, trust the developer on the phone under **Settings → General → VPN & Device Management**.

For Android, install Android Studio, then run `npx cap sync android` and `npx cap open android`, and press **Run** with a phone connected in USB-debugging mode.

## What's declared

The iOS project declares location (when in use and always, for an active walk), camera and photo library usage descriptions, and location/audio background modes. Android declares location, foreground location service and notification permissions. The free community background-geolocation and text-to-speech plugins are installed. GPS starts only when the user starts a mapped walk and ends when the walk ends. The adapter requests notification permission on Android before starting background GPS. Capacitor's legacy bridge is enabled as the plugin documents for persistent Android location updates.

## Device tests still to run

Grant and deny permissions; navigate with the screen locked for more than five minutes; verify off-route recalculation and spoken road guidance; stop the trip and confirm tracking/notifications stop; test lost GPS, stale fixes, network loss, app suspension, low-power mode, and reentry from background. Current filtering excludes location fixes older than one minute or less accurate than 100 m. Arrival detection uses the destination graph node, so it needs real-device tuning. Background app termination/recovery is not implemented. Distribution through the App Store needs a paid Apple Developer account.
