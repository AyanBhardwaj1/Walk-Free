import { lazy, Suspense, useEffect, useState } from "react";
import LandingPage, { Brand } from "./components/LandingPage";
import AuthPage from "./components/AuthPage";
import { accountRequest, type Account } from "./lib/account";
import "./public.css";
import { friendlyError } from "./lib/errors";

const Workspace = lazy(() => import("./App"));

function PrivacyPage() {
  return (
    <div className="public-site">
      <header className="public-header">
        <Brand />
        <div className="public-header-actions">
          <a href="/">Back to home</a>
        </div>
      </header>
      <main className="privacy-content">
        <span className="landing-eyebrow">
          PRIVACY & DATA · DEVELOPMENT PREVIEW
        </span>
        <h1>
          Your walks.
          <br />
          <em>Your choices.</em>
        </h1>
        <p>
          Walk-Free is an evolving project. This page describes the current
          implementation.
        </p>
        <h2>Your account</h2>
        <p>
          Your name, email, password credentials, and sessions are handled by
          Neon’s managed authentication service. Passwords are hashed by that
          service. Walk-Free uses HTTP-only session cookies to keep you signed
          in; it does not store your password in your browser.
        </p>
        <h2>Your location and maps</h2>
        <p>
          Location access is optional and starts only when you choose a location
          feature. GPS fixes are used in your browser for navigation and are not
          saved as a walking history on our server. Map and weather requests
          send the selected area’s coordinates to the relevant data providers:
          OpenStreetMap (Overpass) for map data, Open-Meteo and the National
          Weather Service for weather, and OpenFreeMap for map tiles. If our
          server can’t reach a provider, your browser may contact it directly.
        </p>
        <h2>Projects on this device</h2>
        <p>
          Scenes are saved in this browser, separately for each account. They do
          not yet sync across devices. Signing out does not delete these local
          scenes; clearing this site’s browser data removes them. Export your
          project before clearing browser data. Browser storage is not
          encrypted, so use a trusted device.
        </p>
        <h2>The assistant</h2>
        <p>
          When you ask the assistant something, your question, a short
          description of the area, time and weather, and the results of the map
          tools it uses are sent from our server to the AI provider (currently
          OpenAI). It does not receive your email, password or GPS history. We
          count how many assistant requests each account makes per day to keep
          usage fair; we don’t store your questions.
        </p>
        <h2>Hosting and service data</h2>
        <p>
          Hosting and authentication providers may retain operational
          information such as request logs, IP addresses, and account records
          under their own policies. Walk-Free has no advertising or analytics
          trackers added to the application.
        </p>
        <h2>Account management</h2>
        <p>
          You can sign out or reset your password from the login page.
          Self-service account deletion is not implemented yet. Account deletion
          and a support contact need to be completed before a general public
          launch.
        </p>
      </main>
    </div>
  );
}

const GUEST: Account = {
  id: "guest",
  name: "Guest",
  email: "",
  emailVerified: false,
};

export default function Website() {
  const [user, setUser] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const workspace = path === "/app";
  useEffect(() => {
    let active = true;
    const refresh = () =>
      accountRequest("/session")
        .then((result) => {
          if (!active) return;
          setUser(result.user || null);
          setError("");
          setLoading(false);
        })
        .catch(() => {
          if (active) {
            setError(
              "Couldn’t check your session. Please refresh to try again.",
            );
            setLoading(false);
          }
        });
    void refresh();
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(() => {
      if (workspace && document.visibilityState === "visible") void refresh();
    }, 300000);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, []);

  async function signOut() {
    try {
      await accountRequest("/sign-out", {});
      setUser(null);
      window.location.assign("/login");
    } catch (e) {
      setError(friendlyError(e, "Could not sign out. Please try again."));
    }
  }
  const signedIn = (account: Account) => {
    setUser(account);
    window.location.assign("/app");
  };
  if (path === "/privacy") return <PrivacyPage />;
  if (path === "/") return <LandingPage signedIn={Boolean(user)} />;
  // Guest demo: the map without an account; signed-in people get their own.
  if (path === "/demo" && loading)
    return (
      <div className="public-site public-loading" role="status">
        Opening the demo…
      </div>
    );
  if (path === "/demo" && !user)
    return (
      <Suspense
        fallback={
          <div className="public-site public-loading">Loading the map…</div>
        }
      >
        <Workspace
          account={GUEST}
          guest
          onSignOut={async () => window.location.assign("/signup")}
        />
      </Suspense>
    );
  if (path === "/demo" && user) {
    window.location.replace(`/app${window.location.search}`);
    return null;
  }
  if (workspace && loading)
    return (
      <div className="public-site public-loading" role="status">
        Opening your workspace…
      </div>
    );
  if (workspace && user)
    return (
      <>
        <div className="session-error" role="status">
          {error}
        </div>
        <Suspense
          fallback={
            <div className="public-site public-loading">Loading the map…</div>
          }
        >
          <Workspace key={user.id} account={user} onSignOut={signOut} />
        </Suspense>
      </>
    );
  if (workspace && error)
    return (
      <div className="public-site public-loading">
        <div>
          <p role="alert">{error}</p>
          <a className="landing-button" href="/app">
            Try again
          </a>
        </div>
      </div>
    );
  if (
    [
      "/login",
      "/signup",
      "/forgot-password",
      "/reset-password",
      "/app",
    ].includes(path)
  ) {
    return (
      <AuthPage
        mode={
          workspace
            ? "login"
            : (path.slice(1) as
                "login" | "signup" | "forgot-password" | "reset-password")
        }
        onSignedIn={signedIn}
      />
    );
  }
  return (
    <div className="public-site public-loading">
      <div>
        <h2>This path doesn’t go anywhere.</h2>
        <a className="landing-button" href="/">
          Back to home
        </a>
      </div>
    </div>
  );
}
