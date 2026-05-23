import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Trash2, Settings as SettingsIcon } from "lucide-react";
import { useRoles } from "@/lib/auth";

type Keyword = {
  id: string; kind: string; lang: string; keyword: string;
  category: string | null; enabled: boolean;
};

type Board = {
  id: string; country: string; country_iso2: string; board_domain: string;
  board_name: string | null; enabled: boolean; daily_cap: number; priority: number;
};

const LANGS = ["en", "sr", "hr", "ro", "hu", "bg", "pl", "de", "el"];
const KINDS = [
  { v: "trade", label: "Trade keywords" },
  { v: "agency_exclude", label: "Agency exclusions" },
  { v: "whitecollar_exclude", label: "White-collar exclusions" },
  { v: "vacancy_phrase", label: "Vacancy phrases" },
];

export default function DiscoverySettings() {
  const { isAdmin, loading } = useRoles();
  if (loading) return <div className="p-6"><Loader2 className="animate-spin" /></div>;
  if (!isAdmin) return <div className="p-6 text-muted-foreground">Admin only.</div>;

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-primary" />
          Lead Discovery Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage keywords, agency exclusions, and per-board daily caps for the local hiring discovery engine.
        </p>
      </header>

      <Tabs defaultValue="trade">
        <TabsList>
          {KINDS.map((k) => <TabsTrigger key={k.v} value={k.v}>{k.label}</TabsTrigger>)}
          <TabsTrigger value="boards">Source boards</TabsTrigger>
        </TabsList>
        {KINDS.map((k) => (
          <TabsContent key={k.v} value={k.v}>
            <KeywordEditor kind={k.v} />
          </TabsContent>
        ))}
        <TabsContent value="boards"><BoardEditor /></TabsContent>
      </Tabs>
    </div>
  );
}

function KeywordEditor({ kind }: { kind: string }) {
  const qc = useQueryClient();
  const [newKw, setNewKw] = useState("");
  const [newLang, setNewLang] = useState("en");

  const q = useQuery({
    queryKey: ["discovery_keywords", kind],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discovery_keywords" as never)
        .select("*")
        .eq("kind", kind)
        .order("lang").order("keyword");
      if (error) throw error;
      return (data ?? []) as unknown as Keyword[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!newKw.trim()) throw new Error("Keyword required");
      const { error } = await supabase
        .from("discovery_keywords" as never)
        .insert({ kind, lang: newLang, keyword: newKw.trim() } as never);
      if (error) throw error;
    },
    onSuccess: () => { setNewKw(""); qc.invalidateQueries({ queryKey: ["discovery_keywords", kind] }); toast.success("Added"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("discovery_keywords" as never).update({ enabled } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discovery_keywords", kind] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("discovery_keywords" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["discovery_keywords", kind] }); toast.success("Removed"); },
  });

  return (
    <Card className="p-4 mt-4 space-y-4">
      <div className="flex gap-2">
        <Select value={newLang} onValueChange={setNewLang}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LANGS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="new keyword…" value={newKw} onChange={(e) => setNewKw(e.target.value)} />
        <Button onClick={() => add.mutate()} disabled={add.isPending}>
          <Plus className="h-4 w-4 mr-1" />Add
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lang</TableHead>
            <TableHead>Keyword</TableHead>
            <TableHead>Enabled</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(q.data ?? []).map((kw) => (
            <TableRow key={kw.id}>
              <TableCell><Badge variant="outline">{kw.lang}</Badge></TableCell>
              <TableCell className="font-mono text-xs">{kw.keyword}</TableCell>
              <TableCell><Switch checked={kw.enabled} onCheckedChange={(v) => toggle.mutate({ id: kw.id, enabled: v })} /></TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="ghost" onClick={() => del.mutate(kw.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function BoardEditor() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["source_boards_admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("source_boards" as never)
        .select("*")
        .order("country").order("priority");
      if (error) throw error;
      return (data ?? []) as unknown as Board[];
    },
  });

  const upd = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Board> }) => {
      const { error } = await supabase.from("source_boards" as never).update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["source_boards_admin"] }); toast.success("Updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-4 mt-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Country</TableHead>
            <TableHead>Board</TableHead>
            <TableHead>Enabled</TableHead>
            <TableHead>Daily Cap</TableHead>
            <TableHead>Priority</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(q.data ?? []).map((b) => (
            <TableRow key={b.id}>
              <TableCell><Badge variant="outline">{b.country_iso2}</Badge> {b.country}</TableCell>
              <TableCell className="font-medium">{b.board_name ?? b.board_domain}<div className="text-xs text-muted-foreground">{b.board_domain}</div></TableCell>
              <TableCell><Switch checked={b.enabled} onCheckedChange={(v) => upd.mutate({ id: b.id, patch: { enabled: v } })} /></TableCell>
              <TableCell>
                <Input type="number" defaultValue={b.daily_cap} className="w-20"
                  onBlur={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v !== b.daily_cap) upd.mutate({ id: b.id, patch: { daily_cap: v } });
                  }} />
              </TableCell>
              <TableCell>
                <Input type="number" defaultValue={b.priority} className="w-16"
                  onBlur={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v !== b.priority) upd.mutate({ id: b.id, patch: { priority: v } });
                  }} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}