import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import {
  LayoutDashboard,
  Radar,
  Briefcase,
  Users,
  PlayCircle,
  Settings,
  LogOut,
} from "lucide-react";
import { useRoles, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/demand", label: "Demand Intelligence", icon: Radar },
  { to: "/leads", label: "Leads", icon: Briefcase },
  { to: "/candidates", label: "Candidates", icon: Users },
  { to: "/runs", label: "Discovery Runs", icon: PlayCircle },
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
        <div className="px-6 py-5 border-b">
          <div className="font-bold text-primary text-lg leading-tight">Voynova</div>
          <div className="text-xs text-muted-foreground">VUva OS</div>
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
    </div>
  );
};

export default AppLayout;