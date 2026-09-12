import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <>
      <div className="dash-head"><div><h1>{title}</h1></div></div>
      <div className="panel">
        <div className="empty">
          <span className="empty__icon"><Icon size={24} /></span>
          <h2>Nothing here yet</h2>
          <p>{body}</p>
        </div>
      </div>
    </>
  );
}
