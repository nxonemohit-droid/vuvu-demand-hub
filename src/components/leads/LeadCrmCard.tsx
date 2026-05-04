import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Star, StickyNote } from "lucide-react";

export type LeadCrmStatus =
  | "new"
  | "contacted"
  | "in_progress"
  | "converted"
  | "rejected";

const STATUS_OPTIONS: { value: LeadCrmStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "in_progress", label: "In Progress" },
  { value: "converted", label: "Converted" },
  { value: "rejected", label: "Rejected" },
];

type Row = {
  status: LeadCrmStatus;
  notes: string | null;
  bookmarked: boolean;
};

export function LeadCrmCard({ leadId }: { leadId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<LeadCrmStatus>("new");
  const [notes, setNotes] = useState("");
  const [bookmarked, setBookmarked] = useState(false);
  const [savedNotes, setSavedNotes] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("lead_crm")
        .select("status,notes,bookmarked")
        .eq("lead_id", leadId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error(error);
      } else if (data) {
        const row = data as Row;
        setStatus(row.status);
        setNotes(row.notes ?? "");
        setSavedNotes(row.notes ?? "");
        setBookmarked(row.bookmarked);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  const persist = async (patch: Partial<Row>) => {
    setSaving(true);
    const payload = {
      lead_id: leadId,
      status,
      notes: notes || null,
      bookmarked,
      ...patch,
    };
    const { error } = await supabase
      .from("lead_crm")
      .upsert(payload, { onConflict: "lead_id" });
    setSaving(false);
    if (error) {
      console.error(error);
      toast.error("Could not save");
      return false;
    }
    return true;
  };

  const onStatusChange = async (v: string) => {
    const next = v as LeadCrmStatus;
    setStatus(next);
    if (await persist({ status: next })) toast.success("Status updated");
  };

  const onToggleBookmark = async () => {
    const next = !bookmarked;
    setBookmarked(next);
    if (await persist({ bookmarked: next })) {
      toast.success(next ? "Bookmarked" : "Removed bookmark");
    }
  };

  const onSaveNotes = async () => {
    if (await persist({ notes: notes || null })) {
      setSavedNotes(notes);
      toast.success("Notes saved");
    }
  };

  const notesDirty = notes !== savedNotes;

  return (
    <Card className="p-5 rounded-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            My Notes
          </h3>
        </div>
        <Button
          size="sm"
          variant={bookmarked ? "default" : "outline"}
          onClick={onToggleBookmark}
          disabled={loading || saving}
          aria-pressed={bookmarked}
          aria-label={bookmarked ? "Remove bookmark" : "Bookmark lead"}
        >
          <Star
            className={`h-4 w-4 mr-1.5 ${bookmarked ? "fill-current" : ""}`}
          />
          {bookmarked ? "Bookmarked" : "Bookmark"}
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-[200px,1fr] gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Status
          </label>
          <Select
            value={status}
            onValueChange={onStatusChange}
            disabled={loading || saving}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Notes
          </label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add private notes about this lead…"
            rows={4}
            className="mt-1.5"
            disabled={loading}
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              onClick={onSaveNotes}
              disabled={!notesDirty || saving || loading}
            >
              Save notes
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}