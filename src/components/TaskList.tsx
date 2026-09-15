import type { TaskItem } from '../types'

export default function TaskList({
  tasks,
  onToggle,
}: {
  tasks: TaskItem[]
  onToggle: (taskId: string) => void
}) {
  const pending = tasks.filter((t) => !t.done)

  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {pending.length > 0 ? `${pending.length} pendente${pending.length > 1 ? 's' : ''}` : 'Tudo em dia 🎉'}
      </p>
      <ul className="space-y-2">
        {tasks.map((task) => (
          <li key={task.id}>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-100 px-3.5 py-3 transition-colors hover:bg-slate-50">
              <input
                type="checkbox"
                checked={task.done}
                onChange={() => onToggle(task.id)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-400"
              />
              <span className="flex-1">
                <span
                  className={`block text-sm font-medium ${
                    task.done ? 'text-slate-400 line-through' : 'text-slate-800'
                  }`}
                >
                  {task.label}
                </span>
                {task.due && (
                  <span className="mt-0.5 block text-xs text-slate-500">Prazo: {task.due}</span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
