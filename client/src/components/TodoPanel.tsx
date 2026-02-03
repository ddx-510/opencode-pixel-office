import type { TodoItem } from "../useOfficeState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type TodoPanelProps = {
  todos: TodoItem[];
};

const TodoPanel = ({ todos }: TodoPanelProps) => (
  <Card className="border-[3px] bg-[#d4dee1] text-[#24343a] border-[#4a5f66] shadow-[0_4px_0_#4a5f66]">
    <CardHeader className="pb-2">
      <CardTitle className="text-[9px] uppercase tracking-[0.18em] text-[#24343a]">Todos</CardTitle>
    </CardHeader>
    <CardContent className="text-[10px]">
      <div>
        <div className="text-[8px] uppercase tracking-[0.12em] text-[#24343a] mb-1.5">Quest Log (Todos)</div>
        {todos.length === 0 ? (
          <div className="text-[#4c6068] text-[8px]">No quests active</div>
        ) : (
          <ul className="flex flex-col gap-2 p-0 m-0 list-none">
            {todos.map((todo) => (
              <li key={todo.id} className="grid grid-cols-[16px_1fr_auto] gap-2 items-start bg-[#c6d6db] border-[3px] border-[#6c848d] rounded-md p-2 text-[8px] text-[#24343a] shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] relative">
                <div className="flex items-center justify-center w-3 h-3 mt-[1px]">
                  <div className={`
                    ${!todo.status || todo.status === "pending" ? "w-2 h-2 border-[3px] border-[#7a8b94] rounded-sm" : ""}
                    ${todo.status === "in_progress" ? "w-2 h-2 bg-[#f0b35f] border-[3px] border-[#b88328] rounded-sm animate-pulse" : ""}
                    ${todo.status === "completed" ? "w-1 h-2 border-r-[3px] border-b-[3px] border-[#2e5c46] rotate-45 -mt-0.5" : ""}
                  `} />
                </div>
                <span className="text-[#24343a] leading-tight">{todo.content}</span>
                <Badge
                  className={`
                    !m-0 text-[7px] px-1 py-0.5 rounded uppercase font-bold tracking-[0.05em] border-[3px]
                    ${(!todo.priority || todo.priority === "medium") ? "bg-[#b7c3e3] text-[#2b2c54] border-[#5b5f9b] shadow-[0_2px_0_#5b5f9b]" : ""}
                    ${todo.priority === "high" ? "bg-[#f3a2c1] text-[#4a1f2e] border-[#a34a72] shadow-[0_2px_0_#a34a72]" : ""}
                    ${todo.priority === "low" ? "bg-[#9bd9c7] text-[#1f4036] border-[#3a8a6e] shadow-[0_2px_0_#3a8a6e]" : ""}
                  `}
                >
                  {todo.priority || "MED"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </CardContent>
  </Card>
);

export { TodoPanel };
