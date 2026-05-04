import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Bell, Moon, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";

const KEYS = {
  highPriority: "voynova.notify.highPriorityLead.v1",
  runFailure: "voynova.notify.runFailure.v1",
  theme: "voynova.theme.v1",
} as const;

function readBool(key: string, fallback = true): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v === "1";
  } catch {
    return fallback;
  }
}

function writeBool(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export default function Settings() {
  const [highPriority, setHighPriority] = useState(true);
  const [runFailure, setRunFailure] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    setHighPriority(readBool(KEYS.highPriority, true));
    setRunFailure(readBool(KEYS.runFailure, true));
    let dark = false;
    try {
      const stored = localStorage.getItem(KEYS.theme);
      if (stored === "dark") dark = true;
      else if (stored === "light") dark = false;
      else dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      /* ignore */
    }
    setDarkMode(dark);
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  const onHighPriority = (v: boolean) => {
    setHighPriority(v);
    writeBool(KEYS.highPriority, v);
    toast.success(v ? "High-priority lead alerts on" : "High-priority lead alerts off");
  };
  const onRunFailure = (v: boolean) => {
    setRunFailure(v);
    writeBool(KEYS.runFailure, v);
    toast.success(v ? "Run failure alerts on" : "Run failure alerts off");
  };
  const onDark = (v: boolean) => {
    setDarkMode(v);
    try {
      localStorage.setItem(KEYS.theme, v ? "dark" : "light");
    } catch {
      /* ignore */
    }
    document.documentElement.classList.toggle("dark", v);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <div className="border-b bg-background/60 backdrop-blur sticky top-0 z-20">
        <div className="px-6 lg:px-8 py-5 max-w-3xl mx-auto">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Dashboard
          </Link>
          <h1 className="text-2xl lg:text-3xl font-bold flex items-center gap-2 mt-1">
            <SettingsIcon className="h-6 w-6 text-accent" />
            Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Personal preferences for notifications and display.
          </p>
        </div>
      </div>

      <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
        <Card className="p-5 rounded-xl">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-accent" />
            <h2 className="font-semibold">Notifications</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Choose which events you want to be alerted about.
          </p>
          <Separator className="my-4" />

          <div className="flex items-center justify-between gap-4 py-2">
            <div className="min-w-0">
              <Label htmlFor="notify-high">New high-priority lead alert</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Get notified when a fresh lead is tagged as high priority.
              </p>
            </div>
            <Switch
              id="notify-high"
              checked={highPriority}
              onCheckedChange={onHighPriority}
            />
          </div>

          <div className="flex items-center justify-between gap-4 py-2">
            <div className="min-w-0">
              <Label htmlFor="notify-runs">Discovery run failure alert</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Be alerted when an APIFY discovery run fails.
              </p>
            </div>
            <Switch
              id="notify-runs"
              checked={runFailure}
              onCheckedChange={onRunFailure}
            />
          </div>
        </Card>

        <Card className="p-5 rounded-xl">
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4 text-accent" />
            <h2 className="font-semibold">Display</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Tune the look and feel of the app.
          </p>
          <Separator className="my-4" />

          <div className="flex items-center justify-between gap-4 py-2">
            <div className="min-w-0">
              <Label htmlFor="dark-mode">Dark mode</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Switch between light and dark themes.
              </p>
            </div>
            <Switch id="dark-mode" checked={darkMode} onCheckedChange={onDark} />
          </div>
        </Card>
      </div>
    </div>
  );
}