import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Sparkles, Volume2, VolumeX } from "lucide-react";
import type { ChatMessage } from "../lib/assistant-client";
import type { OwnAiKey } from "../lib/ai-key";
import AiSettings, { type KeyCheck } from "./AiSettings";

const toolLabels: Record<string, string> = {
  find_places: "Searched the map",
  plan_route: "Planned a route",
  heat_ranking: "Ranked hot and cool places",
  place_heat: "Checked a place's heat",
  set_time: "Moved the time of day",
  build_area: "Built an area",
  generate_city: "Generated a city",
  propose_design: "Drafted a design change",
  plant_shade_trees: "Planted shade trees",
  plan_tree_planting: "Found where trees help most",
  cool_refuges: "Mapped cool refuges",
};
export const toolActivity = (name: string) =>
  toolLabels[name] ?? "Worked on it";

/** A model id in words: "muse-spark-1.3" -> "Meta's Muse Spark". */
export function modelLabel(id: string) {
  if (/muse[-_ ]?spark/i.test(id)) return "Meta's Muse Spark";
  if (/muse[-_ ]?wonder/i.test(id)) return "Meta's Muse Wonder";
  if (/llama/i.test(id)) return `Meta's ${id}`;
  return id;
}

/** A tool's arguments or result, short enough to read under the answer. */
export function traceText(raw: string, limit = 600) {
  let text = raw;
  try {
    text = JSON.stringify(JSON.parse(raw), null, 1);
  } catch {
    // Not JSON: show it as sent.
  }
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/**
 * Questions to start with, named for this map when we know its hottest
 * street and a landmark, so they work in any campus or invented city.
 */
export function suggestionsFor(hints?: { street?: string; place?: string }) {
  return [
    "Where is it hottest at 3 PM?",
    hints?.place
      ? `Find me the shadiest way to ${hints.place}`
      : "Find me the shadiest way across this map",
    hints?.street
      ? `When is ${hints.street} coolest today?`
      : "When is the coolest time to walk today?",
    "Where should we plant trees to help the most walkers?",
    "Where can I cool down near here, and what's too far from shade?",
    "¿Cuál es la ruta con más sombra ahora mismo?",
  ];
}

type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: (e: {
    results: ArrayLike<ArrayLike<{ transcript: string }>>;
  }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
};
function speechRecognition(): (new () => Recognition) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    (new () => Recognition) | null;
}

export default function AssistantPanel({
  messages,
  status,
  error,
  speakReplies,
  onSpeakReplies,
  onSend,
  onReset,
  ownKey,
  onOwnKey,
  onTestKey,
  hints,
  guest = false,
  model,
  deep = false,
  onDeep,
}: {
  /** Ask Muse Wonder, Meta's reasoning model: slower, for harder questions. */
  deep?: boolean;
  onDeep?: (on: boolean) => void;
  /** The model that answered last, e.g. "muse-spark-1.3". */
  model?: string;
  /** No account: a few shared questions a day, and no key settings. */
  guest?: boolean;
  /** This map's hottest street and a landmark, for the suggestions. */
  hints?: { street?: string; place?: string };
  messages: ChatMessage[];
  status: string | null;
  error: string;
  speakReplies: boolean;
  onSpeakReplies: (on: boolean) => void;
  onSend: (text: string) => void;
  onReset: () => void;
  ownKey: OwnAiKey | null;
  onOwnKey: (value: OwnAiKey | null) => void;
  onTestKey: (value: OwnAiKey) => Promise<KeyCheck>;
}) {
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const Speech = speechRecognition();
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, status]);
  useEffect(() => () => recognition.current?.stop(), []);
  function send(text = draft) {
    const clean = text.trim();
    if (!clean || status) return;
    onSend(clean);
    setDraft("");
  }
  function listen() {
    if (!Speech) return;
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const r = new Speech();
    r.lang = "en-US";
    r.interimResults = false;
    r.onresult = (e) => {
      const heard = e.results[0]?.[0]?.transcript ?? "";
      if (heard) send(heard);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognition.current = r;
    setListening(true);
    r.start();
  }
  const results = new Map<string, string>();
  for (const m of messages)
    if (m.role === "tool") results.set(m.tool_call_id, m.content);
  const shown = messages.flatMap((m, i) => {
    if (m.role === "user")
      return [
        <p key={i} className="chat-user">
          {m.content}
        </p>,
      ];
    if (m.role === "assistant" && m.tool_calls?.length)
      // Each step the model took, openable to show the call and its result.
      return m.tool_calls.map((c) => (
        <details key={c.id} className="chat-tool">
          <summary>{toolActivity(c.function.name)}</summary>
          <div className="chat-trace">
            <code>
              {c.function.name}({traceText(c.function.arguments, 300)})
            </code>
            {results.has(c.id) && (
              <pre>{traceText(results.get(c.id) ?? "")}</pre>
            )}
          </div>
        </details>
      ));
    if (m.role === "assistant" && m.content)
      return [
        <p key={i} className="chat-reply">
          {m.content}
        </p>,
      ];
    return [];
  });
  return (
    <section className="assistant-panel">
      <div className="section-title">
        <Sparkles size={17} /> Ask Walk-Free
        <button
          className="icon-button"
          aria-label={
            speakReplies ? "Stop reading replies aloud" : "Read replies aloud"
          }
          aria-pressed={speakReplies}
          title={speakReplies ? "Replies are read aloud" : "Replies are silent"}
          onClick={() => onSpeakReplies(!speakReplies)}
        >
          {speakReplies ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
      </div>
      <p className="intro-small">
        Plan a cooler walk, find out where and when it gets hot, or sketch a
        greener street — in plain words or by voice.
      </p>
      <div
        className="chat-log"
        aria-live="polite"
        aria-label="Conversation"
        role="log"
        // Scrollable, so keyboard users can reach and scroll it.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
      >
        {shown.length === 0 && (
          <div className="chat-suggestions">
            {suggestionsFor(hints).map((s) => (
              <button key={s} onClick={() => send(s)} disabled={!!status}>
                {s}
              </button>
            ))}
          </div>
        )}
        {shown}
        {status && (
          <p className="chat-status">
            <span className="spinner small" /> {status}
          </p>
        )}
        {error && (
          <p className="chat-error" role="alert">
            {error}
            {guest ? (
              <>
                {" "}
                <a href="/signup">Create a free account</a> to keep asking.
              </>
            ) : (
              !ownKey && " You can also add your own AI key below."
            )}
          </p>
        )}
        <div ref={end} />
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          aria-label="Ask the assistant"
          placeholder={
            listening ? "Listening…" : "Ask about routes, heat or design…"
          }
          value={draft}
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!!status}
        />
        {Speech && (
          <button
            type="button"
            className={listening ? "listening" : ""}
            aria-label={listening ? "Stop listening" : "Ask by voice"}
            aria-pressed={listening}
            onClick={listen}
            disabled={!!status}
          >
            {listening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
        )}
        <button
          type="submit"
          aria-label="Send"
          disabled={!draft.trim() || !!status}
        >
          <Send size={16} />
        </button>
      </form>
      {onDeep && (
        <label
          className="check deep-think"
          title="Muse Wonder reasons through harder questions, like planning a whole day of walks. It is slower and counts as two questions."
        >
          <input
            type="checkbox"
            checked={deep}
            onChange={(e) => onDeep(e.target.checked)}
            disabled={!!status}
          />
          Think deeper with Meta&apos;s Muse Wonder (slower)
        </label>
      )}
      {messages.length > 0 && !status && (
        <button className="text-button" onClick={onReset}>
          Start a new conversation
        </button>
      )}
      {guest ? (
        <p className="fine guest-note">
          You're trying the shared assistant as a guest, with a few questions a
          day. <a href="/signup">Create a free account</a> for more.
        </p>
      ) : (
        <AiSettings
          value={ownKey}
          onChange={onOwnKey}
          onTest={onTestKey}
          // The shared assistant is unset, paused or out of quota: offer a key.
          suggest={/isn't configured|usage (database|limits)|limit|AI settings|site owner/i.test(
            error,
          )}
        />
      )}
      {model && messages.length > 0 && (
        <p className="fine model-credit">
          <Sparkles size={11} aria-hidden /> Answered by {modelLabel(model)}.
          Open a step above to see the tool it called and what came back.
        </p>
      )}
      <p className="fine">
        Answers use this area's map, the weather shown, and modeled shade. Heat
        numbers are estimates, not measurements.
      </p>
    </section>
  );
}
