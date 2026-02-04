import type { TodoItem } from "../useOfficeState";

type TodoPanelProps = {
  todos: TodoItem[];
};

const TodoPanel = ({ todos }: TodoPanelProps) => (
  <div className="data-panel">
    <div className="gamish-panel-title">
      <span>QUEST LOG</span>
    </div>

    <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto pr-1">
      {todos.length === 0 ? (
        <div className="p-4 text-center border-2 border-dashed border-slate-700 rounded-lg">
          <span className="text-slate-600 text-[9px] uppercase">No active quests</span>
        </div>
      ) : (
        todos.map((todo) => (
          <div key={todo.id} className={`todo-item text-[10px] ${todo.status === 'completed' ? 'done' : ''} ${todo.status === 'in_progress' ? 'active' : ''}`}>
            <div className="flex justify-between items-start gap-2">
              <span className="leading-snug">{todo.content}</span>
              {todo.priority && todo.priority !== 'medium' && (
                <span className={`text-[8px] uppercase font-bold px-1 rounded ${todo.priority === 'high' ? 'text-red-400 bg-red-900/30' :
                    todo.priority === 'low' ? 'text-emerald-400 bg-emerald-900/30' : ''
                  }`}>
                  {todo.priority.slice(0, 1)}
                </span>
              )}
            </div>
            <div className="flex gap-2 mt-1">
              {todo.status === 'in_progress' && (
                <span className="text-[8px] text-amber-500 animate-pulse">▶ IN PROGRESS</span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  </div>
);

export { TodoPanel };
