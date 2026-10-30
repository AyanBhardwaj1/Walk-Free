import { useState, type FormEvent } from "react";
import { ArrowUpRight, Eye, EyeOff, Trees } from "lucide-react";
import { accountRequest, AccountError, type Account } from "../lib/account";
import { Brand } from "./LandingPage";
import { friendlyError } from "../lib/errors";

export default function AuthPage({
  mode,
  onSignedIn,
}: {
  mode: "login" | "signup" | "forgot-password" | "reset-password";
  onSignedIn: (user: Account) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [done, setDone] = useState(false);
  const isNew = mode === "signup";
  const reset = mode === "reset-password";
  const forgot = mode === "forgot-password";
  const title = verifying
    ? "Check your inbox."
    : reset
      ? "A fresh start."
      : forgot
        ? "Forgot your password?"
        : isNew
          ? "Make room for discovery."
          : "Welcome back.";
  const description = verifying
    ? `Enter the verification code sent to ${email}.`
    : reset
      ? "Choose a new password for your Walk-Free account."
      : forgot
        ? "Enter your email and we’ll send a password reset link."
        : isNew
          ? "Create your account and take a closer look at the world around you."
          : "Log in to your walking and design workspace.";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      if (verifying) {
        await accountRequest("/email-otp/verify-email", { email, otp: code });
      } else if (forgot) {
        await accountRequest("/request-password-reset", { email });
        setDone(true);
        setMessage(
          "If an account exists for this email, you’ll receive a reset link. Check your spam folder too.",
        );
        return;
      } else if (reset) {
        const token = new URLSearchParams(window.location.search).get("token");
        if (!token)
          throw new Error(
            "This reset link is missing or invalid. Request a new link.",
          );
        if (password !== confirm)
          throw new Error("Your passwords don’t match.");
        await accountRequest("/reset-password", {
          token,
          newPassword: password,
        });
        setPassword("");
        setConfirm("");
        window.history.replaceState({}, "", "/reset-password");
        setDone(true);
        setMessage(
          "Password updated. You can now log in with your new password.",
        );
        return;
      } else {
        if (isNew && password !== confirm)
          throw new Error("Your passwords don’t match.");
        await accountRequest(isNew ? "/sign-up/email" : "/sign-in/email", {
          email,
          password,
          ...(isNew ? { name } : {}),
        });
      }
      const session = await accountRequest("/session");
      if (session.user) {
        setPassword("");
        onSignedIn(session.user);
      } else if (isNew || verifying) {
        setVerifying(true);
        setMessage("Check your inbox for your verification code.");
      } else
        throw new Error("Login did not create a session. Please try again.");
    } catch (e) {
      if (e instanceof AccountError && e.code === "EMAIL_NOT_VERIFIED") {
        setVerifying(true);
        setMessage(
          "Verify your email to continue. Enter your code or request a new one.",
        );
        return;
      }
      setError(true);
      setMessage(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError(false);
    try {
      await accountRequest("/email-otp/send-verification-otp", {
        email,
        type: "email-verification",
      });
      setMessage("A new code has been requested. Check your inbox.");
    } catch (e) {
      setError(true);
      setMessage(friendlyError(e, "Could not send a new code."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="public-site">
      <header className="public-header">
        <Brand />
        <div className="public-header-actions">
          <a href="/">Back to home</a>
        </div>
      </header>
      <main className="auth-main">
        <section className="auth-story">
          <Trees size={50} strokeWidth={1} />
          <span className="landing-eyebrow">
            A LITTLE MORE SHADE. A LITTLE MORE WONDER.
          </span>
          <h1>
            Good things
            <br />
            are <em>on the way.</em>
          </h1>
          <p>
            Your city is more than a way to get somewhere. Make time to see it.
          </p>
        </section>
        <section className="auth-panel">
          <span className="landing-eyebrow">YOUR WALK-FREE ACCOUNT</span>
          <h2>{title}</h2>
          <p>{description}</p>
          <form className="auth-form" onSubmit={submit}>
            {!done && (
              <>
                {verifying ? (
                  <label>
                    Verification code
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      name="code"
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      required
                      minLength={6}
                      maxLength={6}
                      pattern="[0-9]{6}"
                    />
                  </label>
                ) : (
                  <>
                    {isNew && (
                      <label>
                        Your name
                        <input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          name="name"
                          autoComplete="name"
                          maxLength={80}
                          required
                        />
                      </label>
                    )}
                    {!reset && (
                      <label>
                        Email address
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          name="email"
                          autoComplete="email"
                          spellCheck={false}
                          autoCapitalize="none"
                          maxLength={254}
                          required
                        />
                      </label>
                    )}
                    {!forgot && (
                      <label>
                        {reset ? "New password" : "Password"}
                        <span className="password-field">
                          <input
                            aria-label={reset ? "New password" : "Password"}
                            name="password"
                            type={show ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete={
                              isNew || reset
                                ? "new-password"
                                : "current-password"
                            }
                            minLength={isNew || reset ? 12 : 1}
                            maxLength={128}
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShow(!show)}
                            aria-label={
                              show ? "Hide password" : "Show password"
                            }
                          >
                            {show ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </span>
                        {(isNew || reset) && (
                          <small>
                            Use at least 12 characters. A few unrelated words
                            work well.
                          </small>
                        )}
                      </label>
                    )}
                    {(isNew || reset) && (
                      <label>
                        Confirm password
                        <input
                          type={show ? "text" : "password"}
                          value={confirm}
                          onChange={(e) => setConfirm(e.target.value)}
                          name="confirm-password"
                          autoComplete="new-password"
                          required
                          maxLength={128}
                        />
                      </label>
                    )}
                    {mode === "login" && (
                      <a href="/forgot-password">Forgot password?</a>
                    )}
                  </>
                )}
                <button
                  className="landing-button"
                  type="submit"
                  disabled={busy}
                >
                  {busy
                    ? "Please wait…"
                    : verifying
                      ? "Verify email"
                      : reset
                        ? "Update password"
                        : forgot
                          ? "Send reset link"
                          : isNew
                            ? "Create account"
                            : "Log in"}
                  {!busy && <ArrowUpRight size={18} />}
                </button>
                {verifying && (
                  <button
                    type="button"
                    className="text-link"
                    disabled={busy}
                    onClick={resend}
                  >
                    Send a new code
                  </button>
                )}
              </>
            )}
            {message && (
              <p
                className={`form-message ${error ? "form-error" : ""}`}
                role={error ? "alert" : "status"}
              >
                {message}
              </p>
            )}
          </form>
          <p className="auth-switch">
            {isNew ? (
              <>
                Already have an account? <a href="/login">Log in</a>
              </>
            ) : mode === "login" ? (
              <>
                New here? <a href="/signup">Create an account</a>
              </>
            ) : (
              <a href="/login">Back to login</a>
            )}
          </p>
          {reset && error && (
            <p>
              <a href="/forgot-password">Request a new reset link</a>
            </p>
          )}
          <p className="auth-switch">
            Your map projects currently stay on this device.{" "}
            <a href="/privacy">How we use your data</a>
          </p>
        </section>
      </main>
    </div>
  );
}
