import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, Globe, Linkedin, MapPin } from "lucide-react";
import { countryFlag } from "@/lib/country-flags";
import {
  audienceLabel,
  sectorLabel,
  priorityScoreClass,
  qualityTier,
  type Lead,
} from "@/lib/lead-shape";
import {
  classifyRoleType,
  extractDomain,
  FRESHNESS_CLASS,
  FRESHNESS_LABEL,
  getFreshness,
  getTrustTier,
  ROLE_TYPE_CLASS,
  ROLE_TYPE_LABEL,
  TRUST_DOT_CLASS,
  TRUST_LABEL,
} from "@/lib/lead-classifiers";

interface LeadCardProps {
  lead: Lead;
  blacklistedDomains?: Set<string>;
}

/**
 * Compact, dense, clickable lead card. Used in the Leads page grid and
 * (eventually) the dashboard. Whole card is keyboard + mouse navigable
 * and routes to /leads/:id.
 */
export function LeadCard({ lead, blacklistedDomains }: LeadCardProps) {
  const navigate = useNavigate();
  const score = lead.computed_score ?? lead.urgency_score ?? 0;
  const audience = audienceLabel(lead.target_audience_type);
  const flag = countryFlag(lead.country);
  const company = lead.employer_name ?? "Unknown employer";
  const freshness = getFreshness(lead.created_at);
  const trust = getTrustTier((lead.raw_signals?.payload as Record<string, unknown> | null)?.source as string | undefined ?? lead.source_url);
  const roleType = classifyRoleType(lead.role, lead.target_audience_type);
  const domain = extractDomain(lead.website_url, lead.contact_email);
  const isBlacklisted = !!(domain && blacklistedDomains?.has(domain));

  const go = () => navigate(`/leads/${lead.id}`);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      go();
    }
  };

  return (
    <Card
      role="link"
      tabIndex={0}
      aria-label={`Open lead ${company}`}
      onClick={go}
      onKeyDown={onKeyDown}
      className="p-4 rounded-xl border bg-card shadow-sm cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block h-2 w-2 rounded-full shrink-0 ${TRUST_DOT_CLASS[trust]}`}
              title={TRUST_LABEL[trust]}
            />
            <h3 className="font-semibold text-sm leading-tight truncate" title={company}>
              {company}
            </h3>
          </div>
          <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground truncate">
            <span aria-hidden>{flag}</span>
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {lead.country}
              {lead.city ? ` · ${lead.city}` : ""}
            </span>
          </div>
        </div>
        <Badge
          variant="outline"
          className={`shrink-0 tabular-nums text-[10px] px-1.5 h-5 ${priorityScoreClass(score)}`}
          title={`Priority score ${score}/100`}
        >
          {Math.round(score)}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground mt-2 line-clamp-2" title={lead.role}>
        {lead.role}
      </p>

      <div className="flex flex-wrap gap-1 mt-3">
        {(() => {
          const q = qualityTier(lead.quality_score);
          return (
            <Badge variant="outline" className={`text-[10px] py-0 px-1.5 h-5 ${q.cls}`} title={`Data quality ${q.label}/100`}>
              <span className="mr-0.5">{q.symbol}</span>{q.label}
            </Badge>
          );
        })()}
        <Badge variant="outline" className={`text-[10px] py-0 px-1.5 h-5 ${FRESHNESS_CLASS[freshness]}`}>
          {FRESHNESS_LABEL[freshness]}
        </Badge>
        <Badge variant="outline" className={`text-[10px] py-0 px-1.5 h-5 ${ROLE_TYPE_CLASS[roleType]}`}>
          {ROLE_TYPE_LABEL[roleType]}
        </Badge>
        {isBlacklisted && (
          <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-5 bg-destructive/10 text-destructive border-destructive/30">
            Blacklisted
          </Badge>
        )}
        {lead.target_audience_type && (
          <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-5">
            {audience}
          </Badge>
        )}
        {(lead.sector_tags ?? []).slice(0, 2).map((t) => (
          <Badge key={t} variant="outline" className="text-[10px] py-0 px-1.5 h-5">
            {sectorLabel(t)}
          </Badge>
        ))}
        {(lead.worker_origin_focus ?? []).map((origin) => (
          <Badge
            key={origin}
            variant="outline"
            className="text-[10px] py-0 px-1.5 h-5 bg-accent/10 text-accent border-accent/30"
            title={`Worker source: ${origin}`}
          >
            <span aria-hidden className="mr-0.5">
              {countryFlag(origin)}
            </span>
            {origin}
          </Badge>
        ))}
      </div>

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/60 text-muted-foreground">
        <ContactDot active={!!lead.contact_email} title={lead.contact_email ?? "No email"}>
          <Mail className="h-3.5 w-3.5" />
        </ContactDot>
        <ContactDot active={!!lead.contact_phone} title={lead.contact_phone ?? "No phone"}>
          <Phone className="h-3.5 w-3.5" />
        </ContactDot>
        <ContactDot active={!!lead.website_url} title={lead.website_url ?? "No website"}>
          <Globe className="h-3.5 w-3.5" />
        </ContactDot>
        <ContactDot active={!!lead.linkedin_url} title={lead.linkedin_url ?? "No LinkedIn"}>
          <Linkedin className="h-3.5 w-3.5" />
        </ContactDot>
        {lead.contact_name && (
          <span className="ml-auto text-[11px] truncate max-w-[120px]" title={lead.contact_name}>
            {lead.contact_name}
          </span>
        )}
      </div>
    </Card>
  );
}

function ContactDot({
  active,
  title,
  children,
}: {
  active: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={
        active
          ? "inline-flex items-center justify-center h-6 w-6 rounded-md bg-primary/10 text-primary"
          : "inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground/30"
      }
    >
      {children}
    </span>
  );
}