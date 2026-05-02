export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      candidates: {
        Row: {
          available_from: string | null
          country_origin: string | null
          created_at: string
          experience_years: number | null
          full_name: string
          id: string
          notes: string | null
          preferred_countries: string[] | null
          role: string
          skills: string[] | null
          updated_at: string
          visa_status: string | null
        }
        Insert: {
          available_from?: string | null
          country_origin?: string | null
          created_at?: string
          experience_years?: number | null
          full_name: string
          id?: string
          notes?: string | null
          preferred_countries?: string[] | null
          role: string
          skills?: string[] | null
          updated_at?: string
          visa_status?: string | null
        }
        Update: {
          available_from?: string | null
          country_origin?: string | null
          created_at?: string
          experience_years?: number | null
          full_name?: string
          id?: string
          notes?: string | null
          preferred_countries?: string[] | null
          role?: string
          skills?: string[] | null
          updated_at?: string
          visa_status?: string | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          careers_url: string | null
          country: string | null
          crawl_priority: number
          created_at: string
          discovery_source: string | null
          employer_type: string
          first_seen_at: string
          id: string
          industry: string | null
          last_crawled_at: string | null
          last_seen_at: string
          linkedin_slug: string | null
          metadata: Json
          name: string
          official_url: string | null
          recrawl_interval_hours: number
          size_bucket: string | null
          updated_at: string
          website_domain: string | null
        }
        Insert: {
          careers_url?: string | null
          country?: string | null
          crawl_priority?: number
          created_at?: string
          discovery_source?: string | null
          employer_type?: string
          first_seen_at?: string
          id?: string
          industry?: string | null
          last_crawled_at?: string | null
          last_seen_at?: string
          linkedin_slug?: string | null
          metadata?: Json
          name: string
          official_url?: string | null
          recrawl_interval_hours?: number
          size_bucket?: string | null
          updated_at?: string
          website_domain?: string | null
        }
        Update: {
          careers_url?: string | null
          country?: string | null
          crawl_priority?: number
          created_at?: string
          discovery_source?: string | null
          employer_type?: string
          first_seen_at?: string
          id?: string
          industry?: string | null
          last_crawled_at?: string | null
          last_seen_at?: string
          linkedin_slug?: string | null
          metadata?: Json
          name?: string
          official_url?: string | null
          recrawl_interval_hours?: number
          size_bucket?: string | null
          updated_at?: string
          website_domain?: string | null
        }
        Relationships: []
      }
      demand_leads: {
        Row: {
          ai_rationale: string | null
          city: string | null
          company_id: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          country: string
          created_at: string
          demand_size: number | null
          duplicate_of: string | null
          employer_name: string | null
          id: string
          matched_keywords: string[] | null
          normalized_demand_id: string | null
          notes: string | null
          priority: Database["public"]["Enums"]["priority_tag"]
          raw_signal_id: string | null
          review_status: string
          role: string
          salary_currency: string | null
          salary_max: number | null
          salary_min: number | null
          score: number | null
          score_breakdown: Json
          snoozed_until: string | null
          source: Database["public"]["Enums"]["demand_source"]
          source_url: string | null
          tier: string | null
          updated_at: string
          urgency_score: number
          visa_sponsorship: boolean
        }
        Insert: {
          ai_rationale?: string | null
          city?: string | null
          company_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country: string
          created_at?: string
          demand_size?: number | null
          duplicate_of?: string | null
          employer_name?: string | null
          id?: string
          matched_keywords?: string[] | null
          normalized_demand_id?: string | null
          notes?: string | null
          priority?: Database["public"]["Enums"]["priority_tag"]
          raw_signal_id?: string | null
          review_status?: string
          role: string
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          score?: number | null
          score_breakdown?: Json
          snoozed_until?: string | null
          source: Database["public"]["Enums"]["demand_source"]
          source_url?: string | null
          tier?: string | null
          updated_at?: string
          urgency_score?: number
          visa_sponsorship?: boolean
        }
        Update: {
          ai_rationale?: string | null
          city?: string | null
          company_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string
          created_at?: string
          demand_size?: number | null
          duplicate_of?: string | null
          employer_name?: string | null
          id?: string
          matched_keywords?: string[] | null
          normalized_demand_id?: string | null
          notes?: string | null
          priority?: Database["public"]["Enums"]["priority_tag"]
          raw_signal_id?: string | null
          review_status?: string
          role?: string
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          score?: number | null
          score_breakdown?: Json
          snoozed_until?: string | null
          source?: Database["public"]["Enums"]["demand_source"]
          source_url?: string | null
          tier?: string | null
          updated_at?: string
          urgency_score?: number
          visa_sponsorship?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "demand_leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_demand_stats"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "demand_leads_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "demand_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_leads_normalized_demand_id_fkey"
            columns: ["normalized_demand_id"]
            isOneToOne: false
            referencedRelation: "normalized_demand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_leads_raw_signal_id_fkey"
            columns: ["raw_signal_id"]
            isOneToOne: false
            referencedRelation: "raw_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_matches: {
        Row: {
          candidate_id: string
          created_at: string
          id: string
          lead_id: string
          match_score: number
          reason: string | null
        }
        Insert: {
          candidate_id: string
          created_at?: string
          id?: string
          lead_id: string
          match_score?: number
          reason?: string | null
        }
        Update: {
          candidate_id?: string
          created_at?: string
          id?: string
          lead_id?: string
          match_score?: number
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demand_matches_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_matches_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "demand_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_provenance: {
        Row: {
          first_seen_at: string
          id: string
          last_seen_at: string
          normalized_demand_id: string
          raw_signal_id: string | null
          source_id: string
          source_url: string | null
        }
        Insert: {
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          normalized_demand_id: string
          raw_signal_id?: string | null
          source_id: string
          source_url?: string | null
        }
        Update: {
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          normalized_demand_id?: string
          raw_signal_id?: string | null
          source_id?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demand_provenance_normalized_demand_id_fkey"
            columns: ["normalized_demand_id"]
            isOneToOne: false
            referencedRelation: "normalized_demand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_provenance_raw_signal_id_fkey"
            columns: ["raw_signal_id"]
            isOneToOne: false
            referencedRelation: "raw_signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_provenance_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "source_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      firecrawl_jobs: {
        Row: {
          company_id: string | null
          created_at: string
          credits_used: number | null
          error: string | null
          finished_at: string | null
          firecrawl_job_id: string | null
          id: string
          mode: string
          page_count: number
          pages_persisted: number
          request_payload: Json
          scrape_job_id: string | null
          source_id: string | null
          started_at: string
          status: string
          target_url: string | null
          updated_at: string
          webhook_payload: Json
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          credits_used?: number | null
          error?: string | null
          finished_at?: string | null
          firecrawl_job_id?: string | null
          id?: string
          mode: string
          page_count?: number
          pages_persisted?: number
          request_payload?: Json
          scrape_job_id?: string | null
          source_id?: string | null
          started_at?: string
          status?: string
          target_url?: string | null
          updated_at?: string
          webhook_payload?: Json
        }
        Update: {
          company_id?: string | null
          created_at?: string
          credits_used?: number | null
          error?: string | null
          finished_at?: string | null
          firecrawl_job_id?: string | null
          id?: string
          mode?: string
          page_count?: number
          pages_persisted?: number
          request_payload?: Json
          scrape_job_id?: string | null
          source_id?: string | null
          started_at?: string
          status?: string
          target_url?: string | null
          updated_at?: string
          webhook_payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "firecrawl_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firecrawl_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_demand_stats"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "firecrawl_jobs_scrape_job_id_fkey"
            columns: ["scrape_job_id"]
            isOneToOne: false
            referencedRelation: "scrape_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firecrawl_jobs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "source_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      normalized_demand: {
        Row: {
          city: string | null
          company_id: string
          country: string
          created_at: string
          employment_type: string | null
          expires_at: string | null
          fingerprint: string
          first_seen_at: string
          id: string
          last_seen_at: string
          posted_at: string | null
          role_normalized: string
          role_title: string
          salary_currency: string | null
          salary_max: number | null
          salary_min: number | null
          sector: string | null
          seen_count: number
          updated_at: string
          visa_sponsorship: boolean | null
        }
        Insert: {
          city?: string | null
          company_id: string
          country: string
          created_at?: string
          employment_type?: string | null
          expires_at?: string | null
          fingerprint: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          posted_at?: string | null
          role_normalized: string
          role_title: string
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          sector?: string | null
          seen_count?: number
          updated_at?: string
          visa_sponsorship?: boolean | null
        }
        Update: {
          city?: string | null
          company_id?: string
          country?: string
          created_at?: string
          employment_type?: string | null
          expires_at?: string | null
          fingerprint?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          posted_at?: string | null
          role_normalized?: string
          role_title?: string
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          sector?: string | null
          seen_count?: number
          updated_at?: string
          visa_sponsorship?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "normalized_demand_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "normalized_demand_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_demand_stats"
            referencedColumns: ["company_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      raw_signals: {
        Row: {
          company_domain: string | null
          created_at: string
          fingerprint: string
          id: string
          job_id: string | null
          last_seen_at: string
          payload: Json
          raw_text: string | null
          seen_count: number
          source: Database["public"]["Enums"]["demand_source"]
          source_id: string | null
          source_url: string | null
          structured: boolean
        }
        Insert: {
          company_domain?: string | null
          created_at?: string
          fingerprint: string
          id?: string
          job_id?: string | null
          last_seen_at?: string
          payload?: Json
          raw_text?: string | null
          seen_count?: number
          source: Database["public"]["Enums"]["demand_source"]
          source_id?: string | null
          source_url?: string | null
          structured?: boolean
        }
        Update: {
          company_domain?: string | null
          created_at?: string
          fingerprint?: string
          id?: string
          job_id?: string | null
          last_seen_at?: string
          payload?: Json
          raw_text?: string | null
          seen_count?: number
          source?: Database["public"]["Enums"]["demand_source"]
          source_id?: string | null
          source_url?: string | null
          structured?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "raw_signals_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "scrape_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_jobs: {
        Row: {
          actor_id: string | null
          apify_run_id: string | null
          country: string | null
          error: string | null
          finished_at: string | null
          id: string
          input: Json
          items_found: number
          items_structured: number
          keyword: string | null
          metrics: Json
          parent_company_id: string | null
          source: Database["public"]["Enums"]["demand_source"]
          source_id: string | null
          started_at: string
          status: Database["public"]["Enums"]["job_status"]
        }
        Insert: {
          actor_id?: string | null
          apify_run_id?: string | null
          country?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          items_found?: number
          items_structured?: number
          keyword?: string | null
          metrics?: Json
          parent_company_id?: string | null
          source: Database["public"]["Enums"]["demand_source"]
          source_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["job_status"]
        }
        Update: {
          actor_id?: string | null
          apify_run_id?: string | null
          country?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          items_found?: number
          items_structured?: number
          keyword?: string | null
          metrics?: Json
          parent_company_id?: string | null
          source?: Database["public"]["Enums"]["demand_source"]
          source_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "scrape_jobs_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrape_jobs_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "company_demand_stats"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "scrape_jobs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "source_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_run_events: {
        Row: {
          created_at: string
          data: Json
          event_type: string
          id: string
          message: string | null
          scrape_job_id: string
          severity: string
        }
        Insert: {
          created_at?: string
          data?: Json
          event_type: string
          id?: string
          message?: string | null
          scrape_job_id: string
          severity?: string
        }
        Update: {
          created_at?: string
          data?: Json
          event_type?: string
          id?: string
          message?: string | null
          scrape_job_id?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrape_run_events_scrape_job_id_fkey"
            columns: ["scrape_job_id"]
            isOneToOne: false
            referencedRelation: "scrape_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      source_registry: {
        Row: {
          actor_or_endpoint: string | null
          adapter: string
          confidence_weight: number
          created_at: string
          default_input: Json
          display_name: string
          enabled: boolean
          id: string
          notes: string | null
          rate_limit_per_hour: number
          schedule_cron: string | null
          source_family: Database["public"]["Enums"]["demand_source"]
          trust_tier: number
          updated_at: string
        }
        Insert: {
          actor_or_endpoint?: string | null
          adapter: string
          confidence_weight: number
          created_at?: string
          default_input?: Json
          display_name: string
          enabled?: boolean
          id: string
          notes?: string | null
          rate_limit_per_hour?: number
          schedule_cron?: string | null
          source_family: Database["public"]["Enums"]["demand_source"]
          trust_tier: number
          updated_at?: string
        }
        Update: {
          actor_or_endpoint?: string | null
          adapter?: string
          confidence_weight?: number
          created_at?: string
          default_input?: Json
          display_name?: string
          enabled?: boolean
          id?: string
          notes?: string | null
          rate_limit_per_hour?: number
          schedule_cron?: string | null
          source_family?: Database["public"]["Enums"]["demand_source"]
          trust_tier?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      company_demand_stats: {
        Row: {
          company_id: string | null
          country: string | null
          most_recent_posting: string | null
          name: string | null
          posting_count_30d: number | null
          posting_count_7d: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_team_member: { Args: { _user_id: string }; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "bd" | "viewer"
      demand_source:
        | "facebook"
        | "indeed"
        | "classifieds"
        | "career_page"
        | "other"
        | "linkedin"
        | "google_jobs"
        | "company_site"
        | "directory"
      job_status: "queued" | "running" | "succeeded" | "failed"
      priority_tag: "high" | "medium" | "low"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "bd", "viewer"],
      demand_source: [
        "facebook",
        "indeed",
        "classifieds",
        "career_page",
        "other",
        "linkedin",
        "google_jobs",
        "company_site",
        "directory",
      ],
      job_status: ["queued", "running", "succeeded", "failed"],
      priority_tag: ["high", "medium", "low"],
    },
  },
} as const
