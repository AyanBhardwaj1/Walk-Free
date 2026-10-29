import { useState } from "react";
import { KeyRound } from "lucide-react";
import Select from "./Select";
import { AI_PROVIDERS, type AiProvider, type OwnAiKey } from "../lib/ai-key";

/** Lets a person use their own AI provider key instead of the shared one. */
export default function AiSettings({
  value,
  onChange,
}: {
  value: OwnAiKey | null;
  onChange: (value: OwnAiKey | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [provider, setProvider] = useState<AiProvider>(
    value?.provider ?? "openai",
  );
  const [model, setModel] = useState(
    value?.model ?? AI_PROVIDERS.find((p) => p.value === "openai")!.model,
  );
  const [key, setKey] = useState("");
  const name = (p: AiProvider) =>
    AI_PROVIDERS.find((x) => x.value === p)?.label ?? p;
  return (
    <div className="ai-settings">
      <div className="ai-settings-status">
        <KeyRound size={15} aria-hidden />
        <span>
          {value
            ? `Using your ${name(value.provider)} key · ${value.model}`
            : "Using Walk-Free's shared assistant (daily limit)"}
        </span>
        {!editing && (
          <button className="text-button" onClick={() => setEditing(true)}>
            {value ? "Change" : "Use my own key"}
          </button>
        )}
      </div>
      {editing && (
        <form
          className="ai-settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!key.trim() && !value) return;
            onChange({
              provider,
              model: model.trim(),
              key: key.trim() || value!.key,
            });
            setKey("");
            setEditing(false);
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
                setModel(AI_PROVIDERS.find((p) => p.value === next)!.model);
              }}
            />
          </div>
          <label>
            MODEL
            <input
              className="text-field"
              value={model}
              maxLength={120}
              spellCheck={false}
              onChange={(e) => setModel(e.target.value)}
            />
          </label>
          <label>
            API KEY
            <input
              className="text-field"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={
                value ? "Leave blank to keep your saved key" : "Paste your key"
              }
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          <p className="fine">
            Your key stays in this browser. It is sent securely with each
            assistant request, used only for that request, and never saved on
            Walk-Free's servers. Usage is billed by your provider.
          </p>
          <div className="ai-settings-actions">
            <button
              className="primary"
              type="submit"
              disabled={!model.trim() || (!key.trim() && !value)}
            >
              Save key
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
          {value && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                onChange(null);
                setEditing(false);
              }}
            >
              Remove my key
            </button>
          )}
        </form>
      )}
    </div>
  );
}
