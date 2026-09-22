import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useId } from "react";
import { Radar, LogOut, HelpCircle, Send, BarChart3, Handshake } from "lucide-react";
import { useRoles, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const VArrowLogo = ({ className }: { className?: string }) => {
  useId();
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <path
        d="M4 24 L16 8 L28 24"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 8 L16 3"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M12.5 6 L16 2 L19.5 6"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const navItems = [
  { to: "/find", label: "Europe Employers", icon: Radar },
  { to: "/recruiters", label: "Recruiter Engine", icon: Handshake },
  { to: "/outreach", label: "Outreach", icon: Send },
  { to: "/pipeline", label: "Pipeline", icon: BarChart3 },
];

export const AppLayout = () => {
  const navigate = useNavigate();
  const { user, roles, loading, isAdmin } = useRoles();

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen p-8 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!user) return null;

  const primaryRole = roles[0] ?? "bd";

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="sticky top-0 h-screen w-20 md:w-64 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col">
        <div className="h-20 px-4 md:px-6 border-b border-sidebar-border flex items-center justify-center md:justify-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <VArrowLogo className="h-7 w-7" />
          </div>
          <div className="hidden md:block leading-tight">
            <div className="font-extrabold text-[15px] text-foreground tracking-wide">
              VOYNOVA
            </div>
            <div className="font-semibold text-[10px] text-primary tracking-[0.15em] uppercase">
              Global Solutions
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 md:p-4 space-y-1.5">
          {navItems
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex h-10 items-center justify-center md:justify-start gap-3 px-3 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-primary"
                      : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="hidden md:inline">{item.label}</span>
              </NavLink>
            ))}
        </nav>
        <div className="p-3 md:p-4 border-t border-sidebar-border space-y-2">
          <div className="hidden md:block rounded-lg bg-sidebar-accent/60 px-3 py-2.5 text-xs">
            <div className="font-medium truncate">{user.email}</div>
            <Badge variant="secondary" className="mt-1 capitalize">
              {primaryRole}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center md:justify-start gap-2 text-muted-foreground"
            onClick={async () => {
              await signOut();
              navigate("/auth", { replace: true });
            }}
          >
            <LogOut className="h-4 w-4" /> <span className="hidden md:inline">Sign out</span>
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto">
        <Outlet />
      </main>
      <ShortcutHelpButton />
    </div>
  );
};

export default AppLayout;

const ShortcutHelpButton = () => (
  <Popover>
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label="Keyboard shortcuts"
        className="fixed bottom-4 right-4 z-30 inline-flex h-10 w-10 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-md hover:text-foreground hover:bg-muted transition-colors"
      >
        <HelpCircle className="h-5 w-5" />
      </button>
    </PopoverTrigger>
    <PopoverContent side="top" align="end" className="w-72">
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Keyboard shortcuts
        </div>
        <ul className="text-sm space-y-1.5">
          <ShortcutRow keys={["/"]} label="Focus search (on Leads)" />
          <ShortcutRow keys={["Esc"]} label="Clear all filters" />
          <ShortcutRow keys={["N"]} label="Focus notes (on Lead detail)" />
          <ShortcutRow keys={["?"]} label="Show this help" />
        </ul>
      </div>
    </PopoverContent>
  </Popover>
);

const ShortcutRow = ({ keys, label }: { keys: string[]; label: string }) => (
  <li className="flex items-center justify-between gap-3">
    <span className="text-foreground/80">{label}</span>
    <span className="flex items-center gap-1">
      {keys.map((k) => (
        <kbd
          key={k}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1.5 text-[11px] font-medium text-foreground"
        >
          {k}
        </kbd>
      ))}
    </span>
  </li>
);