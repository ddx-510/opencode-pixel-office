import type { Agent } from "../useOfficeState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type AgentPanelProps = {
  selectedAgent: Agent | null;
};

const AgentPanel = ({ selectedAgent }: AgentPanelProps) => (
  <Card className="border-[3px] bg-[#d4dee1] text-[#24343a] border-[#4a5f66] shadow-[0_4px_0_#4a5f66]">
    <CardHeader className="pb-2">
      <CardTitle className="text-[9px] uppercase tracking-[0.18em] text-[#24343a]">Agent</CardTitle>
    </CardHeader>
    <CardContent className="text-[10px] space-y-4">
      {selectedAgent ? (
        <>
          <div className="flex flex-col items-start gap-1.5 mb-2">
            <Badge className="!m-0 bg-[#7ac7a2] border-[#2e5c46] text-[#1a3427] px-2.5 py-1 text-[8px] tracking-[0.08em] uppercase border-[3px] shadow-[0_3px_0_#2e5c46]">
              {selectedAgent.alias || selectedAgent.name || "Agent"}
            </Badge>
            <Badge className="!m-0 bg-[#c3a4da] border-[#5c3a77] text-[#2f1f40] px-2.5 py-1 text-[8px] tracking-[0.08em] uppercase border-[3px] shadow-[0_3px_0_#5c3a77]">
              {selectedAgent.model || "unknown"}
            </Badge>
          </div>
          <div className="space-y-1">
            <span className="block text-[#4c6068] text-[9px]">Status: {selectedAgent.status}</span>
            {selectedAgent.provider && (
              <span className="block text-[#4c6068] text-[9px]">Provider: {selectedAgent.provider}</span>
            )}
            {selectedAgent.lastMessageSnippet && (
              <span className="block text-[#4c6068] text-[9px]">Last: {selectedAgent.lastMessageSnippet.slice(0, 42)}</span>
            )}
            <span className="block text-[#4c6068] text-[9px]">Session: {selectedAgent.sessionId || selectedAgent.id}</span>
          </div>
        </>
      ) : (
        <p className="text-[9px] text-[#4c6068]">Select an agent</p>
      )}
    </CardContent>
  </Card>
);

export { AgentPanel };
