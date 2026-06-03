import { Link, useLocation } from "@tanstack/react-router";
import { Home, Trophy, Flame, MessageCircle } from "lucide-react";

const items = [
  { to: "/", label: "Home", icon: Home },
  { to: "/chats", label: "Chats", icon: MessageCircle },
  { to: "/challenges", label: "Daily", icon: Flame },
  { to: "/progress", label: "Progress", icon: Trophy },
] as const;

export function BottomNav() {
  const loc = useLocation();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 glass border-t border-border safe-bottom">
      <div className="max-w-md mx-auto px-2 pt-2 grid grid-cols-4">
        {items.map((it) => {
          const active = loc.pathname === it.to || (it.to !== "/" && loc.pathname.startsWith(it.to));
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              className={`flex flex-col items-center gap-1 py-2 rounded-xl transition ${
                active ? "text-primary-glow" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? "drop-shadow-[0_0_8px_var(--color-primary-glow)]" : ""}`} />
              <span className="text-[10px] font-medium tracking-wide uppercase">{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
