import { Component, type ReactNode } from "react";

/**
 * Shows a calm recovery screen instead of a blank page if rendering fails,
 * for example on an unsupported graphics driver.
 */
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[walk-free] render error", error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash-screen" role="alert">
        <h1>Something went wrong on this page.</h1>
        <p>
          Your saved scene is safe on this device. Reloading usually fixes this;
          if it keeps happening, try another browser or turn on hardware
          acceleration so the 3D map can draw.
        </p>
        <button className="primary" onClick={() => window.location.reload()}>
          Reload Walk-Free
        </button>
      </div>
    );
  }
}
