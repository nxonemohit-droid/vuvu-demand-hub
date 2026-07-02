import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useId } from "react";
import {
  LayoutDashboard,
  Radar,
  Briefcase,
  Users,
  PlayCircle,
  Settings,
  LogOut,
  HelpCircle,
  Building2,
  Send,
  Mail,
  BarChart3,
  Globe2,
  Activity,
  GraduationCap,
  BookOpen,
} from "lucide-react";
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
  const gid = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <path
        d="M4 24 L16 8 L28 24"
        stroke={`url(#${gid})`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 8 L16 3"
        stroke={`url(#${gid})`}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M12.5 6 L16 2 L19.5 6"
        stroke={`url(#${gid})`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="32" y2="0">
          <stop offset="0%" stopColor="#C9A84C" />
          <stop offset="100%" stopColor="#8B6914" />
        </linearGradient>
      </defs>
    </svg>
  );
};

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/guide", label: "User Guide", icon: BookOpen },
  { to: "/demand", label: "Demand Intelligence", icon: Radar },
  { to: "/local-hiring", label: "Local Hiring", icon: Globe2 },
  { to: "/leads", label: "Leads", icon: Briefcase },
  { to: "/recruiters", label: "Recruiters", icon: Building2 },
  { to: "/mail", label: "Mail / Outreach", icon: Mail },
  { to: "/campaign", label: "Campaign", icon: BarChart3 },
  { to: "/othm", label: "OTHM Students", icon: GraduationCap },
  { to: "/candidates", label: "Candidates", icon: Users },
  { to: "/runs", label: "Discovery Runs", icon: PlayCircle },
  { to: "/admin/diagnostics", label: "Diagnostics", icon: Activity, adminOnly: true },
  { to: "/settings/discovery", label: "Discovery Settings", icon: Settings, adminOnly: true },
  { to: "/settings", label: "Settings", icon: Settings, adminOnly: true },
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
    <div className="min-h-screen flex bg-muted/20">
      <aside className="w-64 shrink-0 border-r bg-background flex flex-col">
        <div className="px-5 py-5 border-b flex items-center gap-2.5">
          <VArrowLogo className="h-9 w-9 shrink-0" />
          <div className="leading-tight">
            <div className="font-extrabold text-[15px] bg-gradient-to-r from-[#C9A84C] to-[#8B6914] bg-clip-text text-transparent tracking-wide">
              VOYNOVA
            </div>
            <div className="font-bold text-[10px] bg-gradient-to-r from-[#C9A84C] to-[#8B6914] bg-clip-text text-transparent tracking-[0.15em] uppercase">
              Global Solutions
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems
            .filter((i) => !i.adminOnly || isAdmin)
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground/70 hover:bg-muted hover:text-foreground"
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
        </nav>
        <div className="p-3 border-t space-y-2">
          <div className="px-2 text-xs">
            <div className="font-medium truncate">{user.email}</div>
            <Badge variant="secondary" className="mt-1 capitalize">
              {primaryRole}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={async () => {
              await signOut();
              navigate("/auth", { replace: true });
            }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
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