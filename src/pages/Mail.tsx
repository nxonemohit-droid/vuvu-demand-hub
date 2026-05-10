import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Send, Save, Eye, FileText, Search, RefreshCw, Trash2, Plus, CheckCircle2, XCircle, Beaker,
} from "lucide-react";

type Lead = {
  id: string;
  agency_name: string;
  contact_name: string | null;
  contact_email: string | null;
  hq_country: string | null;
  operating_eu_country: string | null;
  trades: string[] | null;
  email_status: string;
  email_sent_at: string | null;
};

type Template = {
  id: string;
  name: string;
  subject: string;
  body: string;
  description: string | null;
};

type SendResult = {
  leadId: string;
  email: string;
  ok: boolean;
  error?: string;
};

const DEFAULT_SUBJECT = "Voynova × {{agency_name}} — EU placements partnership";
const DEFAULT_BODY = `Hi {{first_name}},

I'm Mohit from Voynova Global Solutions. We source pre-vetted blue-collar workers from India, Nepal and Bangladesh and place them with EU employers — currently with live orders in {{eu_country}}.

I came across {{agency_name}} and your work in {{trade}} and wanted to ask if you'd be open to a short call about a sourcing partnership. We can plug into your active orders and handle visa/onboarding end-to-end.

Would 20 minutes this week work?

Best,
Mohit
Voynova Global Solutions
mohit@voynovaglobal.com`;

const renderTemplate = (tpl: string, l: Lead) => {
  const first = (l.contact_name ?? "").trim().split(" ")[0] || "there";
  const trade = (l.trades ?? [])[0] ?? "your placements";
  const map: Record<string, string> = {
    agency_name: l.agency_name ?? "",
    first_name: first,
    contact_name: l.contact_name ?? first,
    eu_country: l.operating_eu_country ?? "Europe",
    hq_country: l.hq_country ?? "",
    trade,
  };
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => map[k] ?? "");
};

const Mail = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "not_sent" | "sent">("not_sent");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeTplId, setActiveTplId] = useState<string>("");
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);

  const [previewLead, setPreviewLead] = useState<Lead | null>(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<SendResult[]>([]);

  const [saveOpen, setSaveOpen] = useState(false);
  const [newTplName, setNewTplName] = useState("");

  const [testOpen, setTestOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setTestEmail(data.user.email);
    });
  }, []);

  const sampleLead: Lead = {
    id: "sample",
    agency_name: "Sample Agency Ltd",
    contact_name: "Alex Sample",
    contact_email: "alex@sample.com",
    hq_country: "India",
    operating_eu_country: "Greece",
    trades: ["Welding", "Construction"],
    email_status: "not_sent",
    email_sent_at: null,
  };

  const sendTest = async () => {
    if (!testEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
      return toast.error("Enter a valid email");
    }
    if (!subject.trim() || !body.trim()) return toast.error("Subject and body required");

    const sourceLead =
      leads.find((l) => selected.has(l.id)) ?? sampleLead;
    const personalSubject = `[TEST] ${renderTemplate(subject, sourceLead)}`;
    const personalText =
      `--- TEST EMAIL · merge tags rendered using ${
        sourceLead.id === "sample" ? "sample data" : sourceLead.agency_name
      } ---\n\n` + renderTemplate(body, sourceLead);

    setTestSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-recruiter-email", {
        body: { to: testEmail.trim(), subject: personalSubject, text: personalText },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Test sent to ${testEmail}`);
      setTestOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test send failed");
    } finally {
      setTestSending(false);
    }
  };

  const loadLeads = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("recruiter_leads")
      .select("id,agency_name,contact_name,contact_email,hq_country,operating_eu_country,trades,email_status,email_sent_at")
      .eq("status", "active")
      .not("contact_email", "is", null)
      .order("quality_score", { ascending: false })
      .limit(1000);
    if (error) toast.error(error.message);
    setLeads((data ?? []) as Lead[]);
    setLoading(false);
  };

  const loadTemplates = async () => {
    const { data } = await supabase
      .from("email_templates")
      .select("id,name,subject,body,description")
      .order("updated_at", { ascending: false });
    setTemplates((data ?? []) as Template[]);
  };

  useEffect(() => { loadLeads(); loadTemplates(); }, []);

  const filtered = useMemo(() => {
    let rows = leads;
    if (filter === "not_sent") rows = rows.filter((l) => l.email_status !== "sent");
    if (filter === "sent") rows = rows.filter((l) => l.email_status === "sent");
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((l) =>
        [l.agency_name, l.contact_name, l.contact_email, l.hq_country, l.operating_eu_country]
          .filter(Boolean).some((x) => (x as string).toLowerCase().includes(q)),
      );
    }
    return rows;
  }, [leads, filter, search]);

  const allSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) filtered.forEach((l) => next.delete(l.id));
    else filtered.forEach((l) => next.add(l.id));
    setSelected(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const applyTemplate = (id: string) => {
    setActiveTplId(id);
    const tpl = templates.find((t) => t.id === id);
    if (tpl) { setSubject(tpl.subject); setBody(tpl.body); }
  };

  const saveTemplate = async () => {
    if (!newTplName.trim()) return toast.error("Name required");
    const { data: u } = await supabase.auth.getUser();
    const { error, data } = await supabase
      .from("email_templates")
      .insert({ name: newTplName.trim(), subject, body, created_by: u.user?.id ?? null })
      .select()
      .single();
    if (error) return toast.error(error.message);
    toast.success("Template saved");
    setSaveOpen(false);
    setNewTplName("");
    await loadTemplates();
    if (data) setActiveTplId(data.id);
  };

  const deleteTemplate = async () => {
    if (!activeTplId) return;
    if (!confirm("Delete this template?")) return;
    const { error } = await supabase.from("email_templates").delete().eq("id", activeTplId);
    if (error) return toast.error(error.message);
    toast.success("Template deleted");
    setActiveTplId("");
    await loadTemplates();
  };

  const sendBulk = async () => {
    const recipients = leads.filter((l) => selected.has(l.id) && l.contact_email);
    if (recipients.length === 0) return toast.error("Select at least one lead with an email");
    if (!subject.trim() || !body.trim()) return toast.error("Subject and body are required");
    if (!confirm(`Send personalised email to ${recipients.length} recipient(s)?`)) return;

    setSending(true);
    setResults([]);
    setProgress({ done: 0, total: recipients.length });

    const out: SendResult[] = [];
    const CONCURRENCY = 4;
    let idx = 0;
    const worker = async () => {
      while (idx < recipients.length) {
        const i = idx++;
        const l = recipients[i];
        const personalSubject = renderTemplate(subject, l);
        const personalText = renderTemplate(body, l);
        try {
          const { data, error } = await supabase.functions.invoke("send-recruiter-email", {
            body: {
              leadId: l.id,
              to: l.contact_email,
              subject: personalSubject,
              text: personalText,
            },
          });
          if (error) throw error;
          if ((data as any)?.error) throw new Error((data as any).error);
          out.push({ leadId: l.id, email: l.contact_email!, ok: true });
        } catch (e) {
          out.push({
            leadId: l.id, email: l.contact_email!, ok: false,
            error: e instanceof Error ? e.message : "send failed",
          });
        } finally {
          setProgress((p) => ({ ...p, done: p.done + 1 }));
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setResults(out);
    setSending(false);
    const okCount = out.filter((r) => r.ok).length;
    toast.success(`${okCount}/${out.length} emails sent`);
    setSelected(new Set());
    loadLeads();
  };

  return (
    <div className="p-6 max-w-[1500px] mx-auto space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mail / Outreach</h1>
          <p className="text-sm text-muted-foreground">
            Pick recipients, choose or write a template, preview and send personalised emails in bulk.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { loadLeads(); loadTemplates(); }}>
          <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
        </Button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_460px] gap-5">
        {/* LEFT: recipients */}
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                Recipients · {selected.size} selected of {filtered.length} shown
              </CardTitle>
              <div className="flex items-center gap-2">
                <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
                  <SelectTrigger className="w-[150px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_sent">Not contacted</SelectItem>
                    <SelectItem value="sent">Already sent</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-9 w-[220px]"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border max-h-[560px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    </TableHead>
                    <TableHead>Agency</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Preview</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => (
                    <TableRow key={l.id} data-state={selected.has(l.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(l.id)}
                          onCheckedChange={() => toggleOne(l.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{l.agency_name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {(l.trades ?? []).slice(0, 2).join(", ")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{l.contact_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{l.contact_email}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {l.hq_country ?? "—"} → {l.operating_eu_country ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={l.email_status === "sent" ? "default" : "outline"}>
                          {l.email_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setPreviewLead(l)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                        {loading ? "Loading…" : "No recipients match"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* RIGHT: composer */}
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" /> Compose
              </CardTitle>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => setTestOpen(true)}>
                  <Beaker className="h-3.5 w-3.5 mr-1" /> Send test
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)}>
                  <Save className="h-3.5 w-3.5 mr-1" /> Save as template
                </Button>
                {activeTplId && (
                  <Button variant="ghost" size="sm" onClick={deleteTemplate}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Template</Label>
              <Select value={activeTplId} onValueChange={applyTemplate}>
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue placeholder="— Choose a saved template —" />
                </SelectTrigger>
                <SelectContent>
                  {templates.length === 0 && (
                    <div className="text-xs text-muted-foreground p-2">No saved templates yet</div>
                  )}
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Body (plain text)</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={14}
                className="mt-1 font-mono text-xs"
              />
            </div>
            <div className="text-[11px] text-muted-foreground leading-relaxed">
              Merge tags: <code>{"{{agency_name}}"}</code>, <code>{"{{first_name}}"}</code>,{" "}
              <code>{"{{eu_country}}"}</code>, <code>{"{{hq_country}}"}</code>,{" "}
              <code>{"{{trade}}"}</code>
            </div>

            {sending && (
              <div className="rounded-md border p-2 text-xs">
                Sending… {progress.done}/{progress.total}
                <div className="mt-1 h-1.5 bg-muted rounded overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {results.length > 0 && !sending && (
              <div className="rounded-md border max-h-40 overflow-auto text-xs divide-y">
                {results.map((r) => (
                  <div key={r.leadId} className="flex items-center gap-2 px-2 py-1.5">
                    {r.ok
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      : <XCircle className="h-3.5 w-3.5 text-destructive" />}
                    <span className="flex-1 truncate">{r.email}</span>
                    {!r.ok && <span className="text-destructive truncate max-w-[180px]">{r.error}</span>}
                  </div>
                ))}
              </div>
            )}

            <Button
              onClick={sendBulk}
              disabled={sending || selected.size === 0}
              className="w-full"
              size="lg"
            >
              <Send className="h-4 w-4 mr-2" />
              Send to {selected.size} recipient{selected.size === 1 ? "" : "s"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Preview dialog */}
      <Dialog open={!!previewLead} onOpenChange={(o) => !o && setPreviewLead(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Preview · {previewLead?.agency_name}</DialogTitle>
          </DialogHeader>
          {previewLead && (
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">To</div>
                <div>{previewLead.contact_name ?? ""} &lt;{previewLead.contact_email}&gt;</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Subject</div>
                <div className="font-medium">{renderTemplate(subject, previewLead)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Body</div>
                <pre className="whitespace-pre-wrap font-sans text-sm bg-muted/40 rounded-md p-3 border">
                  {renderTemplate(body, previewLead)}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewLead(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save template dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Template name</Label>
            <Input
              value={newTplName}
              onChange={(e) => setNewTplName(e.target.value)}
              placeholder="e.g. Cold intro — Greece HORECA"
            />
            <p className="text-xs text-muted-foreground">
              Saves the current subject and body. Merge tags are preserved.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button onClick={saveTemplate}><Plus className="h-4 w-4 mr-1" /> Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send test dialog */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send test email</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Send to</Label>
            <Input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="you@yourcompany.com"
            />
            <p className="text-xs text-muted-foreground">
              Renders the current subject and body using{" "}
              {leads.find((l) => selected.has(l.id))
                ? <>the first selected lead (<b>{leads.find((l) => selected.has(l.id))!.agency_name}</b>)</>
                : "sample data"}{" "}
              so you can verify merge tags before bulk sending. Subject is prefixed with <code>[TEST]</code> and no leads are updated.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(false)} disabled={testSending}>
              Cancel
            </Button>
            <Button onClick={sendTest} disabled={testSending}>
              <Send className="h-4 w-4 mr-1" /> {testSending ? "Sending…" : "Send test"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Mail;
