import { AgentPanel } from "./components/AgentPanel";
import { ScreenFrame } from "./components/ScreenFrame";
import { SessionPanel } from "./components/SessionPanel";
import { TodoPanel } from "./components/TodoPanel";
import { useOfficeState } from "./useOfficeState";

const App = () => {
  const {
    agents,
    sessions,
    todos,
    interactions,
    connected,
    activeSessionId,
    selectedSessionId,
    selectedAgentId,
    selectedSession,
    selectedAgent,
    appVersion,
    lastTodoSummary,
    bossMessage,
    setSelectedAgentId,
    setSelectedSessionId,
  } = useOfficeState();

  const activeLabel = activeSessionId ? activeSessionId.slice(0, 10) : "N/A";
  const version = appVersion ? `v${appVersion}` : "v0.0.0";
  const todoSummary = lastTodoSummary
    ? `${lastTodoSummary.completed}/${lastTodoSummary.total}`
    : "0/0";
  const bossMessageText = bossMessage?.text || "Awaiting mission updates...";
  const bossStatus = bossMessage?.status ? bossMessage.status.toUpperCase() : "IDLE";

  return (
    <div className="app">
      <header>
        <div className="gamish-card logo-card">
          <div className="flex flex-col">
            <h1 className="text-sm text-primary mb-1 tracking-widest">PIXEL OFFICE</h1>
            <p className="text-[9px] text-muted-foreground">OPENCODE AGENT OPS // {version}</p>
          </div>
        </div>
        <div className={`status-badge ${connected ? "live" : ""}`}>
          <span className="text-[8px] opacity-70 mb-1">SYSTEM STATUS</span>
          <span className="font-bold">{connected ? "ONLINE" : "OFFLINE"}</span>
        </div>
      </header>

      <main>
        <ScreenFrame
          bossMessageText={bossMessageText}
          bossStatus={bossStatus}
          agents={agents}
          interactions={interactions}
          sessions={sessions}
          activeSessionId={activeSessionId}
          lastTodoSummary={lastTodoSummary}
          selectedAgentId={selectedAgentId}
          onSelectAgent={setSelectedAgentId}
        />

        <aside className="sidebar-stack">
          <SessionPanel
            sessions={sessions}
            activeLabel={activeLabel}
            version={version}
            todoSummary={todoSummary}
            selectedSessionId={selectedSessionId}
            selectedSession={selectedSession}
            onSelectSession={setSelectedSessionId}
          />
          <TodoPanel todos={todos} />
          <AgentPanel selectedAgent={selectedAgent} />
        </aside>
      </main>
    </div>
  );
};

export default App;
