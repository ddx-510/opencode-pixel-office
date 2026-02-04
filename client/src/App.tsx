import { useState } from "react";
import QRCode from "react-qr-code";
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
    networkIp,
    setSelectedAgentId,
    setSelectedSessionId,
  } = useOfficeState();

  const [showQr, setShowQr] = useState(false);

  const activeLabel = activeSessionId ? activeSessionId.slice(0, 10) : "N/A";
  const version = appVersion ? `v${appVersion}` : "v1.0.0";
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
          {networkIp && connected && (
            <div className="relative mt-2 border-t border-white/20 pt-1 flex flex-col items-center">
              <button
                onClick={() => setShowQr(!showQr)}
                className="text-[8px] font-normal opacity-80 hover:opacity-100 hover:text-accent cursor-pointer underline decoration-dotted"
                title="Click to scan QR code"
              >
                http://{networkIp}:5100
              </button>

              {showQr && (
                <div className="absolute top-8 right-0 bg-white p-2 border-2 border-foreground shadow-[4px_4px_0_rgba(0,0,0,0.2)] z-50">
                  <div style={{ height: "auto", margin: "0 auto", maxWidth: 128, width: "100%" }}>
                    <QRCode
                      size={256}
                      style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                      value={`http://${networkIp}:5100`}
                      viewBox={`0 0 256 256`}
                    />
                  </div>
                  <div className="text-[8px] text-center mt-1 text-foreground font-bold">SCAN ME</div>
                </div>
              )}
            </div>
          )}
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
