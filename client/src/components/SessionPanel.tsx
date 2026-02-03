import type { SessionInfo } from "../useOfficeState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    <Card className="border-[3px] bg-[#d4dee1] text-[#24343a] border-[#4a5f66] shadow-[0_4px_0_#4a5f66]">
      <CardHeader className="pb-2">
        <CardTitle className="text-[9px] uppercase tracking-[0.18em] text-[#24343a]">Session</CardTitle>
      </CardHeader>
      <CardContent className="text-[10px] space-y-4">
        <div className="space-y-1">
          <span className="block text-[#4c6068] text-[9px]">Active: {activeLabel}</span>
          <span className="block text-[#4c6068] text-[9px]">Version: {version}</span>
          <span className="block text-[#4c6068] text-[9px]">Todos: {todoSummary}</span>
        </div>

        <div>
          <div className="text-[8px] uppercase tracking-[0.12em] text-[#24343a] mb-1.5">Sessions</div>
          <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
            {displaySessions.length === 0 ? (
              <span className="text-[#4c6068] text-[9px]">No sessions</span>
            ) : (
              displaySessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className={`text-left p-2.5 rounded-xl border-[3px] text-[9px] min-h-[36px] transition-colors
                    ${session.id === selectedSessionId
                      ? "bg-[#7ac7a2] border-[#2e5c46] text-[#1a3427]"
                      : "bg-[#c6d6db] border-[#6c848d] text-[#22343a] hover:bg-[#bcced4]"
                    }`}
                  onClick={() => onSelectSession(session.id)}
                >
                  {session.title || session.slug || session.id.slice(0, 8)}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-[8px] uppercase tracking-[0.12em] text-[#24343a] mb-1.5">Context</div>
          <span className="block text-[#4c6068] text-[9px]">Title: {selectedSession?.title || selectedSession?.slug || "-"}</span>
          {selectedSession?.status && (
            <span className="block text-[#4c6068] text-[9px]">Status: {selectedSession.status}</span>
          )}
          {selectedSession?.version && (
            <span className="block text-[#4c6068] text-[9px]">Version: {selectedSession.version}</span>
          )}
          {selectedSession?.directory && (
            <span className="block text-[#4c6068] text-[9px]">Dir: {selectedSession.directory}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export { SessionPanel };
