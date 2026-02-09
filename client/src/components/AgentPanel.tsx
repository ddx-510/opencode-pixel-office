import type { Agent, SessionInfo } from "../useOfficeState";

type AgentPanelProps = {
  selectedAgent: Agent | null;
  sessions: SessionInfo[];
};

const AgentPanel = ({ selectedAgent, sessions }: AgentPanelProps) => {
  // Get repo name from the agent's session
  const agentSession = selectedAgent?.sessionId
    ? sessions.find((s) => s.id === selectedAgent.sessionId)
    : null;
  const repoName = agentSession?.directory?.split("/").pop()
    || agentSession?.title
    || agentSession?.slug
    || "";

  return (
    <div className="data-panel">
      <div className="gamish-panel-title">
        <span>AGENT PROFILE</span>
      </div>

      {selectedAgent ? (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3 items-center">
            <div className="w-10 h-10 bg-slate-900 border-2 border-slate-600 rounded flex items-center justify-center">
              <span className="text-xl">👾</span>
            </div>
            <div className="flex flex-col">
              <span className="text-primary font-bold text-xs uppercase tracking-wider">
                {repoName
                  ? `${selectedAgent.alias || selectedAgent.name || "Agent"} · ${repoName}`
                  : selectedAgent.alias || selectedAgent.name || "Unknown Agent"}
              </span>
              <span className="text-[9px] text-slate-400 uppercase">{selectedAgent.role || "Operative"}</span>
            </div>
          </div>

          <div className="agent-stats">
            <div className="stat-box">
              <span className="stat-label">Model</span>
              <span className="stat-value truncate block">{selectedAgent.model || "N/A"}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Status</span>
              <span className={`stat-value uppercase ${selectedAgent.status === 'working' ? 'text-amber-400' : 'text-slate-400'}`}>
                {selectedAgent.status || "IDLE"}
              </span>
            </div>
            <div className="stat-box col-span-2">
              <span className="stat-label">Provider</span>
              <span className="stat-value">{selectedAgent.provider || "Unknown"}</span>
            </div>
          </div>

          {selectedAgent.sessionId && (
            <div className="border-t border-slate-700 pt-2">
              <span className="stat-label mb-1">Assigned Session</span>
              <div className="text-[9px] font-mono text-emerald-400/80 bg-emerald-950/30 p-1.5 rounded border border-emerald-900/50 truncate">
                {repoName
                  ? `${repoName} · ${selectedAgent.sessionId.slice(0, 6)}`
                  : selectedAgent.sessionId.slice(0, 6)}
              </div>
            </div>
          )}

          {selectedAgent.lastMessageSnippet && (
            <div className="bg-slate-900/50 p-2 rounded border border-slate-700/50">
              <span className="stat-label mb-1 text-slate-500">Last Transmission</span>
              <p className="text-[9px] text-slate-300 italic">"{selectedAgent.lastMessageSnippet.slice(0, 100)}{selectedAgent.lastMessageSnippet.length > 100 ? '...' : ''}"</p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 text-slate-600 gap-2">
          <span className="text-2xl opacity-20">?</span>
          <span className="text-[9px] uppercase">Select an agent</span>
        </div>
      )}
    </div>
  );
};

export { AgentPanel };
