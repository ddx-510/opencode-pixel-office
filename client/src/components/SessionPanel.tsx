import type { SessionInfo } from "../useOfficeState";

type SessionPanelProps = {
  sessions: SessionInfo[];
  activeLabel: string;
  version: string;
  todoSummary: string;
  selectedSessionId: string | null;
  selectedSession: SessionInfo | null;
  onSelectSession: (id: string | null) => void;
};

const SessionPanel = ({
  sessions,
  activeLabel,
  version,
  todoSummary,
  selectedSessionId,
  selectedSession,
  onSelectSession,
}: SessionPanelProps) => {
  const displaySessions = [...sessions]
    .filter((session) => session.id)
    .sort((a, b) => {
      if (a.id === selectedSessionId) return -1;
      if (b.id === selectedSessionId) return 1;
      const timeDiff = (b.updatedAt || 0) - (a.updatedAt || 0);
      if (timeDiff !== 0) return timeDiff;
      const aLabel = a.title || a.slug || a.id;
      const bLabel = b.title || b.slug || b.id;
      return aLabel.localeCompare(bLabel);
    });

  return (
    <div className="data-panel">
      <div className="gamish-panel-title">
        <span>MISSION LOG</span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4 text-[10px] text-muted-foreground">
        <div className="flex flex-col">
          <span className="text-[8px] uppercase tracking-wider text-slate-500">Active Session</span>
          <span className="text-secondary-foreground font-bold">{activeLabel}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[8px] uppercase tracking-wider text-slate-500">System Ver</span>
          <span className="text-secondary-foreground">{version}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[8px] uppercase tracking-wider text-slate-500">Objectives</span>
          <span className="text-secondary-foreground">{todoSummary}</span>
        </div>
      </div>

      <div className="mb-4">
        <div className="text-[8px] uppercase tracking-wider text-slate-500 mb-2">Available Sessions</div>
        <div className="flex flex-col max-h-[220px] overflow-y-auto pr-1 space-y-1">
          {displaySessions.length === 0 ? (
            <span className="text-muted-foreground text-[9px] italic">No active signals...</span>
          ) : (
            displaySessions.map((session) => (
              <button
                key={session.id}
                type="button"
                className={`session-item ${session.id === selectedSessionId ? "active" : ""}`}
                onClick={() => onSelectSession(session.id)}
              >
                <span className="truncate">{session.title || session.slug || session.id.slice(0, 8)}</span>
                {session.id === selectedSessionId && <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="pt-4 border-t border-slate-700">
        <div className="text-[8px] uppercase tracking-wider text-slate-500 mb-2">Session Intel</div>
        {selectedSession ? (
          <div className="space-y-1.5">
            <div className="flex flex-col">
              <span className="text-[8px] text-slate-500">Identifier</span>
              <span className="text-[9px] text-slate-300 break-all">{selectedSession.title || selectedSession.slug || "-"}</span>
            </div>
            {selectedSession.status && (
              <div className="flex justify-between items-center">
                <span className="text-[8px] text-slate-500">Status</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 inline-block">
                  {selectedSession.status}
                </span>
              </div>
            )}
            {selectedSession.version && (
              <div className="flex justify-between">
                <span className="text-[8px] text-slate-500">Core Ver</span>
                <span className="text-[9px] text-slate-400">{selectedSession.version}</span>
              </div>
            )}
            {selectedSession.directory && (
              <div className="flex flex-col mt-1">
                <span className="text-[8px] text-slate-500">Path</span>
                <span className="text-[8px] font-mono text-slate-500 truncate">{selectedSession.directory}</span>
              </div>
            )}
          </div>
        ) : (
          <span className="text-[9px] text-slate-600 italic">No session selected</span>
        )}
      </div>
    </div>
  );
};

export { SessionPanel };
