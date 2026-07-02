import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  GraduationCap, Upload, Plus, RefreshCw, Download, Trash2, Mail, MessageCircle,
  ExternalLink, Filter,
} from "lucide-react";
import * as XLSX from "xlsx";

type EntityType = "student" | "college" | "agency" | "consultant";
type Stage = "new" | "contacted" | "interested" | "enrolled" | "rejected";
type Level = "L3" | "L4" | "L5" | "L6" | "L7";
type Intake = "Jan" | "May" | "Sep";

type OthmLead = {
  id: string;
  entity_type: EntityType;
  full_name: string | null;
  institution_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  linkedin_url: string | null;
  website: string | null;
  country: string | null;
  city: string | null;
  course_level: Level | null;
  intake_month: Intake | null;
  preferred_country: string | null;
  stage: Stage;
  source: string | null;
  tags: string[];
  notes: string | null;
  outreach_queued: boolean;
  quality_score: number | null;
  created_at: string;
};

const ENTITY_META: Record<EntityType, { label: string; color: string }> = {
  student: { label: "Student", color: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  college: { label: "College", color: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  agency: { label: "Agency", color: "bg-purple-500/10 text-purple-700 dark:text-purple-300" },
  consultant: { label: "Consultant", color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
};

const STAGE_META: Record<Stage, string> = {
  new: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  contacted: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  interested: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  enrolled: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-red-500/10 text-red-700 dark:text-red-300",
};

const ENTITY_OPTS: EntityType[] = ["student", "college", "agency", "consultant"];
const STAGE_OPTS: Stage[] = ["new", "contacted", "interested", "enrolled", "rejected"];
const LEVEL_OPTS: Level[] = ["L3", "L4", "L5", "L6", "L7"];
const INTAKE_OPTS: Intake[] = ["Jan", "May", "Sep"];

export default function Othm() {
  const [leads, setLeads] = useState<OthmLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterEntity, setFilterEntity] = useState<string>("all");
  const [filterStage, setFilterStage] = useState<string>("all");
  const [filterCountry, setFilterCountry] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("othm_leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) toast.error(error.message);
    setLeads((data ?? []) as OthmLead[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (filterEntity !== "all" && l.entity_type !== filterEntity) return false;
      if (filterStage !== "all" && l.stage !== filterStage) return false;
      if (filterCountry && !(l.country ?? "").toLowerCase().includes(filterCountry.toLowerCase())) return false;
      if (!q) return true;
      const hay = [l.full_name, l.institution_name, l.email, l.phone, l.city, l.country, l.notes]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [leads, search, filterEntity, filterStage, filterCountry]);

  const counts = useMemo(() => ({
    total: leads.length,
    student: leads.filter((l) => l.entity_type === "student").length,
    college: leads.filter((l) => l.entity_type === "college").length,
    agency: leads.filter((l) => l.entity_type === "agency").length,
    consultant: leads.filter((l) => l.entity_type === "consultant").length,
    withEmail: leads.filter((l) => l.email && l.email.includes("@")).length,
    withPhone: leads.filter((l) => l.phone || l.whatsapp).length,
  }), [leads]);

  const exportExcel = () => {
    const rows = filtered.map((l) => ({
      "Type": l.entity_type,
      "Name": l.full_name ?? "",
      "Institution": l.institution_name ?? "",
      "Email": l.email ?? "",
      "Phone": l.phone ?? "",
      "WhatsApp": l.whatsapp ?? "",
      "LinkedIn": l.linkedin_url ?? "",
      "City": l.city ?? "",
      "Country": l.country ?? "",
      "Course Level": l.course_level ?? "",
      "Intake": l.intake_month ?? "",
      "Preferred Country": l.preferred_country ?? "",
      "Stage": l.stage,
      "Source": l.source ?? "",
      "Tags": (l.tags ?? []).join(", "),
      "Notes": l.notes ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "OTHM Leads");
    XLSX.writeFile(wb, `othm-leads-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const del = async (id: string) => {
    if (!confirm("Delete this lead?")) return;
    const { error } = await supabase.from("othm_leads").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            OTHM Students, Colleges & Agencies
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage OTHM certificate outreach audience. Import from CSV/Excel, then run campaigns from the Campaign page.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={!filtered.length}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5 mr-1.5" /> Import CSV/Excel
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add lead
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
        {[
          ["Total", counts.total],
          ["Students", counts.student],
          ["Colleges", counts.college],
          ["Agencies", counts.agency],
          ["Consultants", counts.consultant],
          ["With email", counts.withEmail],
          ["With phone", counts.withPhone],
        ].map(([label, val]) => (
          <Card key={label as string}>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-xl font-semibold">{val}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filter leads
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input placeholder="Search name, email, phone, notes…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={filterEntity} onValueChange={setFilterEntity}>
            <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {ENTITY_OPTS.map((e) => (
                <SelectItem key={e} value={e}>{ENTITY_META[e].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStage} onValueChange={setFilterStage}>
            <SelectTrigger><SelectValue placeholder="Stage" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {STAGE_OPTS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Country filter" value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)} />
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            Showing {filtered.length} of {leads.length} leads
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Name / Institution</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No leads yet. Click <b>Import CSV/Excel</b> to bulk upload, or <b>Add lead</b> to create one.
                  </TableCell></TableRow>
                ) : filtered.slice(0, 500).map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Badge className={ENTITY_META[l.entity_type].color} variant="outline">
                        {ENTITY_META[l.entity_type].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{l.institution_name || l.full_name || "—"}</div>
                      {l.institution_name && l.full_name && (
                        <div className="text-xs text-muted-foreground">{l.full_name}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {l.email && <div className="truncate max-w-[180px]">{l.email}</div>}
                      {(l.whatsapp || l.phone) && <div className="text-muted-foreground">{l.whatsapp || l.phone}</div>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {[l.city, l.country].filter(Boolean).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {l.course_level && <Badge variant="outline" className="text-[10px] mr-1">{l.course_level}</Badge>}
                      {l.intake_month && <Badge variant="outline" className="text-[10px]">{l.intake_month}</Badge>}
                      {l.preferred_country && <div className="text-muted-foreground mt-0.5">→ {l.preferred_country}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge className={STAGE_META[l.stage]} variant="outline">{l.stage}</Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {l.email && (
                        <a href={`mailto:${l.email}`} className="inline-flex">
                          <Button size="icon" variant="ghost" className="h-7 w-7"><Mail className="h-3.5 w-3.5" /></Button>
                        </a>
                      )}
                      {(l.whatsapp || l.phone) && (
                        <a
                          href={`https://wa.me/${(l.whatsapp || l.phone || "").replace(/[^\d]/g, "")}`}
                          target="_blank" rel="noreferrer"
                        >
                          <Button size="icon" variant="ghost" className="h-7 w-7"><MessageCircle className="h-3.5 w-3.5" /></Button>
                        </a>
                      )}
                      {l.linkedin_url && (
                        <a href={l.linkedin_url} target="_blank" rel="noreferrer">
                          <Button size="icon" variant="ghost" className="h-7 w-7"><ExternalLink className="h-3.5 w-3.5" /></Button>
                        </a>
                      )}
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => del(l.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {filtered.length > 500 && (
            <div className="p-3 text-xs text-muted-foreground text-center border-t">
              Showing first 500 rows. Refine filters to narrow down.
            </div>
          )}
        </CardContent>
      </Card>

      <AddLeadDialog open={addOpen} onClose={() => setAddOpen(false)} onCreated={load} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={load} />
    </div>
  );
}

function AddLeadDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    entity_type: "student" as EntityType,
    full_name: "",
    institution_name: "",
    email: "",
    phone: "",
    whatsapp: "",
    linkedin_url: "",
    country: "",
    city: "",
    course_level: "" as "" | Level,
    intake_month: "" as "" | Intake,
    preferred_country: "UK",
    stage: "new" as Stage,
    source: "manual",
    notes: "",
  });

  const save = async () => {
    if (!form.full_name && !form.institution_name) return toast.error("Name or institution required");
    setSaving(true);
    const payload = {
      ...form,
      course_level: form.course_level || null,
      intake_month: form.intake_month || null,
    };
    const { error } = await supabase.from("othm_leads").insert(payload as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Lead added");
    onCreated();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add OTHM lead</DialogTitle>
          <DialogDescription>Add a student, college, agency or consultant to the OTHM outreach list.</DialogDescription>
        </DialogHeader>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label>Type</Label>
            <Select value={form.entity_type} onValueChange={(v) => setForm({ ...form, entity_type: v as EntityType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENTITY_OPTS.map((e) => <SelectItem key={e} value={e}>{ENTITY_META[e].label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Stage</Label>
            <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v as Stage })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGE_OPTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Full name</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <Label>Institution name</Label>
            <Input value={form.institution_name} onChange={(e) => setForm({ ...form, institution_name: e.target.value })} placeholder="College / Agency" />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91..." />
          </div>
          <div>
            <Label>WhatsApp</Label>
            <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="+91..." />
          </div>
          <div>
            <Label>LinkedIn URL</Label>
            <Input value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} />
          </div>
          <div>
            <Label>City</Label>
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div>
            <Label>Country</Label>
            <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </div>
          <div>
            <Label>Course level (OTHM)</Label>
            <Select value={form.course_level} onValueChange={(v) => setForm({ ...form, course_level: v as Level })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {LEVEL_OPTS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Intake month</Label>
            <Select value={form.intake_month} onValueChange={(v) => setForm({ ...form, intake_month: v as Intake })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {INTAKE_OPTS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Preferred country</Label>
            <Input value={form.preferred_country} onChange={(e) => setForm({ ...form, preferred_country: e.target.value })} placeholder="UK" />
          </div>
          <div>
            <Label>Source</Label>
            <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="referral / linkedin / import" />
          </div>
          <div className="md:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save lead"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [defaults, setDefaults] = useState({ entity_type: "student" as EntityType, preferred_country: "UK", source: "csv-import" });
  const [busy, setBusy] = useState(false);

  const parseFile = (file: File) => {
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const parsed = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
          setRows(parsed);
          toast.success(`${parsed.length} rows parsed`);
        } catch (e) {
          toast.error("Failed to parse Excel file");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      Papa.parse<Record<string, any>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          setRows(res.data);
          toast.success(`${res.data.length} rows parsed`);
        },
        error: (err) => toast.error(err.message),
      });
    }
  };

  const normKey = (k: string) => k.toLowerCase().replace(/[\s_-]+/g, "");
  const pick = (row: Record<string, any>, keys: string[]): string => {
    const map: Record<string, any> = {};
    for (const k of Object.keys(row)) map[normKey(k)] = row[k];
    for (const key of keys) {
      const v = map[normKey(key)];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
  };

  const importAll = async () => {
    if (!rows.length) return toast.error("Upload a file first");
    setBusy(true);
    const payload = rows.map((r) => {
      const entRaw = pick(r, ["type", "entity_type", "category"]).toLowerCase();
      const entity_type: EntityType = (ENTITY_OPTS as string[]).includes(entRaw)
        ? (entRaw as EntityType) : defaults.entity_type;
      const level = pick(r, ["course_level", "level", "othm_level"]).toUpperCase().replace(/[^L0-9]/g, "");
      const intakeRaw = pick(r, ["intake", "intake_month", "month"]).slice(0, 3);
      const intake = ["Jan", "May", "Sep"].find((m) => m.toLowerCase() === intakeRaw.toLowerCase()) || null;
      return {
        entity_type,
        full_name: pick(r, ["full_name", "name", "student_name", "contact"]) || null,
        institution_name: pick(r, ["institution", "institution_name", "college", "agency", "company", "organisation", "organization"]) || null,
        email: pick(r, ["email", "email_id", "mail"]).toLowerCase() || null,
        phone: pick(r, ["phone", "mobile", "contact_number", "phone_number"]) || null,
        whatsapp: pick(r, ["whatsapp", "whatsapp_number", "wa"]) || null,
        linkedin_url: pick(r, ["linkedin", "linkedin_url", "linkedin_profile"]) || null,
        website: pick(r, ["website", "url", "site"]) || null,
        country: pick(r, ["country"]) || null,
        city: pick(r, ["city"]) || null,
        course_level: (LEVEL_OPTS as string[]).includes(level) ? level : null,
        intake_month: intake,
        preferred_country: pick(r, ["preferred_country", "target_country", "destination"]) || defaults.preferred_country,
        stage: "new" as Stage,
        source: defaults.source,
        notes: pick(r, ["notes", "remarks", "comments"]) || null,
      };
    }).filter((r) => r.full_name || r.institution_name || r.email);

    let inserted = 0, failed = 0;
    for (let i = 0; i < payload.length; i += 200) {
      const chunk = payload.slice(i, i + 200);
      const { error } = await supabase.from("othm_leads").insert(chunk as any);
      if (error) { failed += chunk.length; console.error(error); }
      else inserted += chunk.length;
    }
    setBusy(false);
    toast.success(`Imported ${inserted} leads${failed ? ` · ${failed} failed` : ""}`);
    setRows([]);
    if (fileRef.current) fileRef.current.value = "";
    onImported();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import OTHM leads from CSV or Excel</DialogTitle>
          <DialogDescription>
            Column names are auto-mapped. Supported headers: <code>type</code>, <code>full_name</code>, <code>institution</code>,
            <code> email</code>, <code>phone</code>, <code>whatsapp</code>, <code>linkedin</code>, <code>country</code>,
            <code> city</code>, <code>course_level</code> (L3-L7), <code>intake</code> (Jan/May/Sep), <code>preferred_country</code>, <code>notes</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={(e) => e.target.files?.[0] && parseFile(e.target.files[0])} />
          {rows.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {rows.length} rows detected. First row: {Object.keys(rows[0]).slice(0, 6).join(", ")}…
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 border-t pt-3">
            <div>
              <Label className="text-xs">Default type (if missing)</Label>
              <Select value={defaults.entity_type} onValueChange={(v) => setDefaults({ ...defaults, entity_type: v as EntityType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENTITY_OPTS.map((e) => <SelectItem key={e} value={e}>{ENTITY_META[e].label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Preferred country default</Label>
              <Input value={defaults.preferred_country} onChange={(e) => setDefaults({ ...defaults, preferred_country: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Source label</Label>
              <Input value={defaults.source} onChange={(e) => setDefaults({ ...defaults, source: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={importAll} disabled={busy || !rows.length}>
            {busy ? "Importing…" : `Import ${rows.length} leads`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}