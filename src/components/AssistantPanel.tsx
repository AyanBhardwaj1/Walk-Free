import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Sparkles, Volume2, VolumeX } from "lucide-react";
import type { ChatMessage } from "../lib/assistant-client";

const toolLabels: Record<string, string> = {
  find_places: "Searched the map",
  plan_route: "Planned a route",
  heat_ranking: "Ranked hot and cool places",
  place_heat: "Checked a place's heat",
  set_time: "Moved the time of day",
  build_area: "Built an area",
  propose_design: "Drafted a design change",
  plant_shade_trees: "Planted shade trees",
};
export const toolActivity = (name: string) =>
  toolLabels[name] ?? "Worked on it";

const suggestions = [
  "Where is it hottest at 3 PM?",
  "Find me the shadiest way to the library",
  "When is Speedway coolest today?",
  "Plant a row of oaks along the hottest street",
];

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
}: {
  messages: ChatMessage[];
  status: string | null;
  error: string;
  speakReplies: boolean;
  onSpeakReplies: (on: boolean) => void;
  onSend: (text: string) => void;
  onReset: () => void;
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
  const shown = messages.flatMap((m, i) => {
    if (m.role === "user")
      return [
        <p key={i} className="chat-user">
          {m.content}
        </p>,
      ];
    if (m.role === "assistant" && m.tool_calls?.length)
      return m.tool_calls.map((c) => (
        <p key={c.id} className="chat-tool">
          {toolActivity(c.function.name)}
        </p>
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
      <div className="chat-log" aria-live="polite">
        {shown.length === 0 && (
          <div className="chat-suggestions">
            {suggestions.map((s) => (
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
      {messages.length > 0 && !status && (
        <button className="text-button" onClick={onReset}>
          Start a new conversation
        </button>
      )}
      <p className="fine">
        Answers use this area's map, the weather shown, and modeled shade. Heat
        numbers are estimates, not measurements.
      </p>
    </section>
  );
}
