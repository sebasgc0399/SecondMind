import { useState, type KeyboardEvent } from 'react';
import { Plus } from 'lucide-react';

interface TaskInlineCreateProps {
  onCreate: (name: string) => void | Promise<unknown>;
}

export default function TaskInlineCreate({ onCreate }: TaskInlineCreateProps) {
  const [value, setValue] = useState('');

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const trimmed = value.trim();
      if (!trimmed) return;
      void onCreate(trimmed);
      setValue('');
    } else if (event.key === 'Escape') {
      setValue('');
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary/50 transition-colors">
      <Plus className="h-4 w-4 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Nueva tarea... (Enter para crear)"
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
    </div>
  );
}
