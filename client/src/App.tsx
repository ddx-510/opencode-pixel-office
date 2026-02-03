import { AgentPanel } from "./components/AgentPanel";
import { ScreenFrame } from "./components/ScreenFrame";
import { SessionPanel } from "./components/SessionPanel";
import { TodoPanel } from "./components/TodoPanel";
import { useOfficeState } from "./useOfficeState";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

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

  const activeLabel = activeSessionId ? activeSessionId.slice(0, 10) : "none";
  const version = appVersion ? `v${appVersion}` : "unknown";
  const todoSummary = lastTodoSummary
    ? `${lastTodoSummary.completed}/${lastTodoSummary.total}`
    : "0/0";
  const bossMessageText = bossMessage?.text || "Awaiting updates...";
  const bossStatus = bossMessage?.status
    ? bossMessage.status.toUpperCase()
    : "";

  return (
    <div className="mx-auto max-w-[1440px] p-7 pb-16">
      <header className="mb-6 grid grid-cols-[1fr_auto] gap-5 items-stretch">
        <Card className="p-[18px_22px] border-[3px] bg-[#d8e1e4] text-[#24343a] border-[#4a5f66] shadow-[0_4px_0_#4a5f66]">
          <h1 className="text-[12px] text-[#24343a] m-0 mb-2 tracking-[0.18em] uppercase">OpenCode Pixel Office</h1>
          <p className="text-[9px] m-0 text-[#4c6068]">Live agent activity from OpenCode events</p>
        </Card>
        <Badge
          className={`!m-0 self-center px-4 py-2 text-[8px] tracking-[0.18em] uppercase border-[3px] ${connected ? "bg-[#7ac7a2] text-[#1a3427] border-[#2e5c46] shadow-[0_3px_0_#2e5c46]" : "bg-[#c3a4da] text-[#2f1f40] border-[#5c3a77] shadow-[0_3px_0_#5c3a77]"}`}
        >
          {connected ? "Live" : "Disconnected"}
        </Badge>
      </header>
      <main className="grid grid-cols-[minmax(0,1fr)_320px] gap-7 items-start max-[900px]:grid-cols-1">
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
        <aside className="flex flex-col gap-[18px]">
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
