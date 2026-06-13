import { cn } from "@/lib/utils";

interface PanelProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerAction?: React.ReactNode;
  noPadding?: boolean;
}

export default function Panel({ title, icon, children, className, headerAction, noPadding }: PanelProps) {
  return (
    <div
      className={cn(
        "bg-card border border-border overflow-hidden flex flex-col",
        className
      )}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          {icon && <span className="text-emerald-500 opacity-80">{icon}</span>}
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">{title}</h2>
        </div>
        {headerAction}
      </div>
      <div className={cn("flex-1 overflow-auto", noPadding ? "" : "")}>{children}</div>
    </div>
  );
}
