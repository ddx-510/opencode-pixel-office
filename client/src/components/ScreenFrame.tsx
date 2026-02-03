import { PixiScene } from "../PixiScene";
import { BossBox } from "./BossBox";
import type { Agent, Interaction, SessionInfo, TodoSummary } from "../useOfficeState";

type ScreenFrameProps = {
  bossMessageText: string;
  bossStatus: string;
  agents: Agent[];
  interactions: Interaction[];
  sessions: SessionInfo[];
  activeSessionId: string | null;
  lastTodoSummary: TodoSummary | null;
  selectedAgentId: string | null;
  onSelectAgent: (id: string | null) => void;
};

const ScreenFrame = ({
  bossMessageText,
  bossStatus,
  agents,
  interactions,
  sessions,
  activeSessionId,
  lastTodoSummary,
  selectedAgentId,
  onSelectAgent,
}: ScreenFrameProps) => (
  <div className="screen-frame">
    <BossBox message={bossMessageText} status={bossStatus} />
    <div className="screen-bezel">
      <div className="pixi-stage">
        <PixiScene
          agents={agents}
          interactions={interactions}
          sessions={sessions}
          activeSessionId={activeSessionId}
          lastTodoSummary={lastTodoSummary}
          selectedAgentId={selectedAgentId}
          onSelectAgent={onSelectAgent}
        />
      </div>
    </div>
  </div>
);

export { ScreenFrame };
