import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, X, ArrowRight, ArrowLeft, Sparkles, Play, Pause } from "lucide-react";

const STORAGE_KEY = "mail-walkthrough-dismissed";

type Step = {
  title: string;
  click: string;
  expect: string;
  seconds: number;
};

const STEPS: Step[] = [
  {
    title: "Step 1 — Add emails to the queue",
    click: 'Click the blue "Queue now" button (card #1, top-left).',
    expect: 'A toast: "Queued N demand emails". The "pending" counter on card #1 jumps up by that N.',
    seconds: 10,
  },
  {
    title: "Step 2 — Check the status panel",
    click: 'Click "Why aren\'t my pending emails sending?" right under the 3 cards.',
    expect: 'It expands and shows a green "X ready to send" row + live counters (ready / future / sent / suppressed / failed).',
    seconds: 10,
  },
  {
    title: "Step 3 — Send them right now",
    click: 'Click the green "Send now" button (card #2, middle).',
    expect: 'A toast: "Processed: N". The "sent today" counter on card #2 increases. "ready" in the status panel decreases.',
    seconds: 15,
  },
  {
    title: "Step 4 — Open WhatsApp queue",
    click: 'Click "Open WhatsApp queue" (card #3, right).',
    expect: 'The page switches to the WhatsApp tab and shows today\'s queue table with per-row "Open WhatsApp" buttons.',
    seconds: 10,
  },
  {
    title: "Step 5 — Send one WhatsApp",
    click: 'Pick any row and click the green WhatsApp icon button on the right.',
    expect: 'WhatsApp Web opens in a new tab with the message pre-filled. Hit Enter to send, then come back and click "Mark sent".',
    seconds: 15,
  },
];

export function MailWalkthrough() {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [secLeft, setSecLeft] = useState(STEPS[0].seconds);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
  }, []);

  useEffect(() => { setSecLeft(STEPS[idx].seconds); }, [idx]);

  useEffect(() => {
    if (!open || paused) return;
    if (secLeft <= 0) {
      if (idx < STEPS.length - 1) setIdx((i) => i + 1);
      return;
    }
    const t = setTimeout(() => setSecLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [open, paused, secLeft, idx]);

  const dismiss = (remember: boolean) => {
    setOpen(false);
    if (remember && typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, "1");
  };

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => { localStorage.removeItem(STORAGE_KEY); setIdx(0); setOpen(true); }}
      >
        <Sparkles className="h-4 w-4" /> Replay 60-second walkthrough
      </Button>
    );
  }

  const step = STEPS[idx];
  const totalSec = STEPS.reduce((a, s) => a + s.seconds, 0);
  const elapsed = STEPS.slice(0, idx).reduce((a, s) => a + s.seconds, 0) + (step.seconds - secLeft);
  const pct = Math.round((elapsed / totalSec) * 100);

  return (
    <Card className="p-5 border-primary/40 bg-gradient-to-br from-primary/10 via-background to-emerald-500/5 relative">
      <button
        onClick={() => dismiss(true)}
        className="absolute top-3 right-3 p-1 rounded-md hover:bg-muted text-muted-foreground"
        aria-label="Dismiss walkthrough"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-5 w-5 text-primary" />
        <div className="text-lg font-semibold">60-second guided walkthrough</div>
        <Badge variant="outline" className="ml-2">{idx + 1} / {STEPS.length}</Badge>
      </div>

      <Progress value={pct} className="h-1.5 mb-4" />

      <div className="space-y-3">
        <div className="text-base font-semibold">{step.title}</div>

        <div className="rounded-md border bg-background p-3">
          <div className="text-[11px] uppercase tracking-wide text-primary font-semibold mb-1">👉 Click this</div>
          <div className="text-sm">{step.click}</div>
        </div>

        <div className="rounded-md border bg-emerald-500/5 border-emerald-500/30 p-3">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-emerald-700 font-semibold mb-1">
            <CheckCircle2 className="h-3 w-3" /> You should see
          </div>
          <div className="text-sm">{step.expect}</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button
            onClick={() => setPaused((p) => !p)}
            className="inline-flex items-center gap-1 rounded border px-2 py-1 hover:bg-muted"
          >
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            {paused ? "Resume" : "Pause"}
          </button>
          <span>Auto-advances in {secLeft}s</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm" variant="ghost"
            disabled={idx === 0}
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {idx < STEPS.length - 1 ? (
            <Button size="sm" onClick={() => setIdx((i) => i + 1)}>
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={() => dismiss(true)}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Done — don't show again
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}