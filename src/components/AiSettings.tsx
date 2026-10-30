import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, KeyRound, LoaderCircle } from "lucide-react";
import Select from "./Select";
import {
  AI_PROVIDERS,
  providerFromKey,
  type AiProvider,
  type OwnAiKey,
} from "../lib/ai-key";

export interface KeyCheck {
  model: string;
  latencyMs: number;
}

/** Lets a person use their own AI provider key instead of the shared one. */
export default function AiSettings({
  value,
  onChange,
  onTest,
  suggest = false,
}: {
  value: OwnAiKey | null;
  onChange: (value: OwnAiKey | null) => void;
  /** Makes one tiny call with the key; rejects with a readable reason. */
  onTest: (value: OwnAiKey) => Promise<KeyCheck>;
  /** Open the form because the shared assistant can't answer right now. */
  suggest?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [provider, setProvider] = useState<AiProvider>(
    value?.provider ?? "openai",
  );
  const [model, setModel] = useState(
    value?.model ?? AI_PROVIDERS.find((p) => p.value === "openai")!.model,
  );
  const [key, setKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<
    { ok: true; text: string } | { ok: false; text: string } | null
  >(null);
  const [note, setNote] = useState("");
  const keyInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (suggest && !value) setEditing(true);
  }, [suggest, value]);
  const info = (p: AiProvider) => AI_PROVIDERS.find((x) => x.value === p)!;
  const candidate = (): OwnAiKey | null => {
    const k = key.trim() || value?.key;
    return k && model.trim() ? { provider, model: model.trim(), key: k } : null;
  };

  async function test(next: OwnAiKey, save: boolean) {
    setTesting(true);
    setResult(null);
    try {
      const check = await onTest(next);
      const seconds = (check.latencyMs / 1000).toFixed(1);
      setResult({
        ok: true,
        text: `Key works with ${check.model} (answered in ${seconds} s).`,
      });
      if (save) {
        onChange(next);
        setKey("");
        setEditing(false);
      }
    } catch (error) {
      setResult({
        ok: false,
        text:
          error instanceof Error
            ? error.message
            : "The key couldn't be checked. Try again.",
      });
      keyInput.current?.focus();
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className={`ai-settings ${suggest && !value ? "suggested" : ""}`}>
      <div className="ai-settings-status">
        <KeyRound size={15} aria-hidden />
        <span>
          {value
            ? `Using your ${info(value.provider).label} key · ${value.model}`
            : "Using Walk-Free's shared assistant (daily limit)"}
        </span>
        {!editing && value && (
          <button
            className="text-button"
            disabled={testing}
            onClick={() => test(value, false)}
          >
            {testing ? "Testing…" : "Test"}
          </button>
        )}
        {!editing && (
          <button className="text-button" onClick={() => setEditing(true)}>
            {value ? "Change" : "Use my own key"}
          </button>
        )}
      </div>
      {suggest && !value && (
        <p className="ai-settings-hint">
          Paste a key from any provider below to keep using the assistant. It
          takes about a minute.
        </p>
      )}
      {editing && (
        <form
          className="ai-settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            const next = candidate();
            if (next && !testing) void test(next, true);
          }}
        >
          {/* Not a <label>: a label would reopen the menu on every pick. */}
          <div className="field">
            <span className="field-label">PROVIDER</span>
            <Select
              label="AI provider"
              value={provider}
              options={AI_PROVIDERS.map((p) => ({
                value: p.value,
                label: p.label,
                detail: p.model,
              }))}
              onChange={(next) => {
                setProvider(next);
                setModel(info(next).model);
                setNote("");
                setResult(null);
              }}
            />
          </div>
          <label>
            MODEL
            <input
              className="text-field"
              name="ai-model"
              value={model}
              maxLength={120}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                setModel(e.target.value);
                setResult(null);
              }}
            />
          </label>
          <label>
            API KEY
            <input
              ref={keyInput}
              className="text-field"
              name="ai-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={
                value ? "Leave blank to keep your saved key" : "Paste your key…"
              }
              value={key}
              aria-invalid={result?.ok === false}
              aria-describedby="ai-key-result"
              onChange={(e) => {
                const next = e.target.value;
                setKey(next);
                setResult(null);
                // Keys carry their provider's prefix; pick it for the person.
                const guess = providerFromKey(next.trim());
                if (guess && guess !== provider) {
                  setProvider(guess);
                  setModel(info(guess).model);
                  setNote(`Looks like a ${info(guess).label} key, so that provider is selected.`);
                }
              }}
            />
          </label>
          {note && <p className="fine">{note}</p>}
          <a
            className="ai-key-link"
            href={info(provider).keysUrl}
            target="_blank"
            rel="noreferrer"
          >
            Get a {info(provider).label} key
            <ExternalLink size={12} aria-hidden />
          </a>
          <p
            id="ai-key-result"
            className={`ai-key-result ${result ? (result.ok ? "ok" : "bad") : ""}`}
            aria-live="polite"
          >
            {testing ? (
              <>
                <LoaderCircle size={14} className="spin" aria-hidden />
                Checking your key with {info(provider).label}…
              </>
            ) : result ? (
              <>
                {result.ok && <CheckCircle2 size={14} aria-hidden />}
                {result.text}
              </>
            ) : null}
          </p>
          <p className="fine">
            Your key stays in this browser. It is sent securely with each
            assistant request, used only for that request, and never saved on
            Walk-Free's servers. Usage is billed by your provider.
          </p>
          <div className="ai-settings-actions">
            <button
              className="primary"
              type="submit"
              disabled={testing || !candidate()}
            >
              {testing ? "Testing…" : "Test and save"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setEditing(false);
                setResult(null);
                setNote("");
              }}
            >
              Cancel
            </button>
          </div>
          {result?.ok === false && candidate() && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                onChange(candidate());
                setKey("");
                setEditing(false);
                setResult(null);
              }}
            >
              Save without a working test
            </button>
          )}
          {value && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                onChange(null);
                setEditing(false);
                setResult(null);
              }}
            >
              Remove my key
            </button>
          )}
        </form>
      )}
      {!editing && result && (
        <p
          className={`ai-key-result ${result.ok ? "ok" : "bad"}`}
          aria-live="polite"
        >
          {result.ok && <CheckCircle2 size={14} aria-hidden />}
          {result.text}
        </p>
      )}
    </div>
  );
}
