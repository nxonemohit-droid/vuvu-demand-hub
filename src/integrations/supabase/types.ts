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
      archived_leads: {
        Row: {
          archived_at: string
          archived_by: string
          archived_reason: string | null
          id: string
          original_id: string | null
          payload: Json | null
        }
        Insert: {
          archived_at?: string
          archived_by?: string
          archived_reason?: string | null
          id?: string
          original_id?: string | null
          payload?: Json | null
        }
        Update: {
          archived_at?: string
          archived_by?: string
          archived_reason?: string | null
          id?: string
          original_id?: string | null
          payload?: Json | null
        }
        Relationships: []
      }
      campaign_emails: {
        Row: {
          body_html: string | null
          body_text: string | null
          campaign_id: string
          channel: string
          click_count: number
          created_at: string
          demand_lead_id: string | null
          email_to: string | null
          error: string | null
          id: string
          open_count: number
          othm_lead_id: string | null
          recruiter_id: string | null
          resend_message_id: string | null
          scheduled_for: string | null
          sent_at: string | null
          status: string
          subject: string | null
          to_linkedin: string | null
          to_phone: string | null
          updated_at: string
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          campaign_id: string
          channel?: string
          click_count?: number
          created_at?: string
          demand_lead_id?: string | null
          email_to?: string | null
          error?: string | null
          id?: string
          open_count?: number
          othm_lead_id?: string | null
          recruiter_id?: string | null
          resend_message_id?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          to_linkedin?: string | null
          to_phone?: string | null
          updated_at?: string
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          campaign_id?: string
          channel?: string
          click_count?: number
          created_at?: string
          demand_lead_id?: string | null
          email_to?: string | null
          error?: string | null
          id?: string
          open_count?: number
          othm_lead_id?: string | null
          recruiter_id?: string | null
          resend_message_id?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          to_linkedin?: string | null
          to_phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_emails_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_emails_othm_lead_id_fkey"
            columns: ["othm_lead_id"]
            isOneToOne: false
            referencedRelation: "othm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_emails_recruiter_id_fkey"
            columns: ["recruiter_id"]
            isOneToOne: false
            referencedRelation: "recruiter_leads"
            referencedColumns: ["id"]
          },
        ]
      }
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
      daily_discovery_summary: {
        Row: {
          breakdown: Json
          countries_count: number
          date: string
          hot_count: number
          qualified_count: number
          total_found: number
          updated_at: string
        }
        Insert: {
          breakdown?: Json
          countries_count?: number
          date: string
          hot_count?: number
          qualified_count?: number
          total_found?: number
          updated_at?: string
        }
        Update: {
          breakdown?: Json
          countries_count?: number
          date?: string
          hot_count?: number
          qualified_count?: number
          total_found?: number
          updated_at?: string
        }
        Relationships: []
      }
      demand_leads: {
        Row: {
          ai_rationale: string | null
          city: string | null
          company_id: string | null
          confidence: number | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_qualified: boolean | null
          country: string
          created_at: string
          demand_size: number | null
          discovered_board: string | null
          discovered_board_domain: string | null
          duplicate_of: string | null
          email_enriched: boolean
          email_source: string
          employer_name: string | null
          enrichment_attempts: number
          id: string
          is_direct_employer: boolean
          last_enriched_at: string | null
          last_signal_at: string | null
          lead_score: number
          local_lang: string | null
          matched_keywords: string[] | null
          normalized_demand_id: string | null
          normalized_domain: string | null
          notes: string | null
          outreach_queued: boolean
          outreach_queued_at: string | null
          phone_e164: string | null
          phone_enriched: boolean
          posted_at_local: string | null
          priority: Database["public"]["Enums"]["priority_tag"]
          quality_score: number
          raw_signal_id: string | null
          repost_count: number
          review_status: string
          role: string
          role_classification: string | null
          salary_currency: string | null
          salary_max: number | null
          salary_min: number | null
          score: number | null
          score_breakdown: Json
          score_components: Json
          sector_tags: string[]
          snoozed_until: string | null
          source: Database["public"]["Enums"]["demand_source"]
          source_url: string | null
          sponsorship_signals: string[]
          target_audience_type: string | null
          tier: string | null
          trade_category: string | null
          updated_at: string
          urgency_score: number
          vacancy_count: number
          visa_sponsorship: boolean
          whatsapp_enrich_attempts: number
          whatsapp_enriched: boolean
          whatsapp_last_enriched_at: string | null
          whatsapp_number: string | null
          whatsapp_queued: boolean
          whatsapp_source: string
          worker_origin_focus: string[]
        }
        Insert: {
          ai_rationale?: string | null
          city?: string | null
          company_id?: string | null
          confidence?: number | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_qualified?: boolean | null
          country: string
          created_at?: string
          demand_size?: number | null
          discovered_board?: string | null
          discovered_board_domain?: string | null
          duplicate_of?: string | null
          email_enriched?: boolean
          email_source?: string
          employer_name?: string | null
          enrichment_attempts?: number
          id?: string
          is_direct_employer?: boolean
          last_enriched_at?: string | null
          last_signal_at?: string | null
          lead_score?: number
          local_lang?: string | null
          matched_keywords?: string[] | null
          normalized_demand_id?: string | null
          normalized_domain?: string | null
          notes?: string | null
          outreach_queued?: boolean
          outreach_queued_at?: string | null
          phone_e164?: string | null
          phone_enriched?: boolean
          posted_at_local?: string | null
          priority?: Database["public"]["Enums"]["priority_tag"]
          quality_score?: number
          raw_signal_id?: string | null
          repost_count?: number
          review_status?: string
          role: string
          role_classification?: string | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          score?: number | null
          score_breakdown?: Json
          score_components?: Json
          sector_tags?: string[]
          snoozed_until?: string | null
          source: Database["public"]["Enums"]["demand_source"]
          source_url?: string | null
          sponsorship_signals?: string[]
          target_audience_type?: string | null
          tier?: string | null
          trade_category?: string | null
          updated_at?: string
          urgency_score?: number
          vacancy_count?: number
          visa_sponsorship?: boolean
          whatsapp_enrich_attempts?: number
          whatsapp_enriched?: boolean
          whatsapp_last_enriched_at?: string | null
          whatsapp_number?: string | null
          whatsapp_queued?: boolean
          whatsapp_source?: string
          worker_origin_focus?: string[]
        }
        Update: {
          ai_rationale?: string | null
          city?: string | null
          company_id?: string | null
          confidence?: number | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_qualified?: boolean | null
          country?: string
          created_at?: string
          demand_size?: number | null
          discovered_board?: string | null
          discovered_board_domain?: string | null
          duplicate_of?: string | null
          email_enriched?: boolean
          email_source?: string
          employer_name?: string | null
          enrichment_attempts?: number
          id?: string
          is_direct_employer?: boolean
          last_enriched_at?: string | null
          last_signal_at?: string | null
          lead_score?: number
          local_lang?: string | null
          matched_keywords?: string[] | null
          normalized_demand_id?: string | null
          normalized_domain?: string | null
          notes?: string | null
          outreach_queued?: boolean
          outreach_queued_at?: string | null
          phone_e164?: string | null
          phone_enriched?: boolean
          posted_at_local?: string | null
          priority?: Database["public"]["Enums"]["priority_tag"]
          quality_score?: number
          raw_signal_id?: string | null
          repost_count?: number
          review_status?: string
          role?: string
          role_classification?: string | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          score?: number | null
          score_breakdown?: Json
          score_components?: Json
          sector_tags?: string[]
          snoozed_until?: string | null
          source?: Database["public"]["Enums"]["demand_source"]
          source_url?: string | null
          sponsorship_signals?: string[]
          target_audience_type?: string | null
          tier?: string | null
          trade_category?: string | null
          updated_at?: string
          urgency_score?: number
          vacancy_count?: number
          visa_sponsorship?: boolean
          whatsapp_enrich_attempts?: number
          whatsapp_enriched?: boolean
          whatsapp_last_enriched_at?: string | null
          whatsapp_number?: string | null
          whatsapp_queued?: boolean
          whatsapp_source?: string
          worker_origin_focus?: string[]
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
            foreignKeyName: "demand_leads_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "qualified_local_leads"
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
          {
            foreignKeyName: "demand_matches_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "qualified_local_leads"
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
      discovery_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          kind: string
          params: Json
          result: Json | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          params?: Json
          result?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          params?: Json
          result?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      discovery_keywords: {
        Row: {
          category: string | null
          created_at: string
          enabled: boolean
          id: string
          keyword: string
          kind: string
          lang: string
          updated_at: string
          weight: number
        }
        Insert: {
          category?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          keyword: string
          kind: string
          lang?: string
          updated_at?: string
          weight?: number
        }
        Update: {
          category?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          keyword?: string
          kind?: string
          lang?: string
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      discovery_query_stats: {
        Row: {
          created_at: string
          hit_count: number
          id: string
          kind: string
          last_seen_at: string
          token: string
          zero_result_count: number
        }
        Insert: {
          created_at?: string
          hit_count?: number
          id?: string
          kind: string
          last_seen_at?: string
          token: string
          zero_result_count?: number
        }
        Update: {
          created_at?: string
          hit_count?: number
          id?: string
          kind?: string
          last_seen_at?: string
          token?: string
          zero_result_count?: number
        }
        Relationships: []
      }
      email_campaigns: {
        Row: {
          body_template: string | null
          channel: string
          created_at: string
          created_by: string | null
          daily_limit: number
          failed_count: number
          id: string
          lead_source: string
          name: string
          resend_batch_id: string | null
          send_window_end_hour: number
          send_window_start_hour: number
          sent_count: number
          start_date: string | null
          status: string
          subject_template: string | null
          timezone: string
          total_recipients: number
          updated_at: string
        }
        Insert: {
          body_template?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          daily_limit?: number
          failed_count?: number
          id?: string
          lead_source?: string
          name: string
          resend_batch_id?: string | null
          send_window_end_hour?: number
          send_window_start_hour?: number
          sent_count?: number
          start_date?: string | null
          status?: string
          subject_template?: string | null
          timezone?: string
          total_recipients?: number
          updated_at?: string
        }
        Update: {
          body_template?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          daily_limit?: number
          failed_count?: number
          id?: string
          lead_source?: string
          name?: string
          resend_batch_id?: string | null
          send_window_end_hour?: number
          send_window_start_hour?: number
          sent_count?: number
          start_date?: string | null
          status?: string
          subject_template?: string | null
          timezone?: string
          total_recipients?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          lead_id: string | null
          message_id: string | null
          payload: Json
          recipient: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          lead_id?: string | null
          message_id?: string | null
          payload?: Json
          recipient?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          lead_id?: string | null
          message_id?: string | null
          payload?: Json
          recipient?: string | null
        }
        Relationships: []
      }
      email_send_settings: {
        Row: {
          auto_unblock_enabled: boolean
          country_window_overrides: Json
          daily_cap: number
          hourly_cap: number
          id: number
          per_domain_daily_cap: number
          reply_stop_enabled: boolean
          respect_send_window: boolean
          send_window_end_hour: number
          send_window_start_hour: number
          send_window_timezone: string
          skip_weekends: boolean
          updated_at: string
          warmup_daily_increment: number
          warmup_initial_cap: number
          warmup_started_at: string | null
        }
        Insert: {
          auto_unblock_enabled?: boolean
          country_window_overrides?: Json
          daily_cap?: number
          hourly_cap?: number
          id?: number
          per_domain_daily_cap?: number
          reply_stop_enabled?: boolean
          respect_send_window?: boolean
          send_window_end_hour?: number
          send_window_start_hour?: number
          send_window_timezone?: string
          skip_weekends?: boolean
          updated_at?: string
          warmup_daily_increment?: number
          warmup_initial_cap?: number
          warmup_started_at?: string | null
        }
        Update: {
          auto_unblock_enabled?: boolean
          country_window_overrides?: Json
          daily_cap?: number
          hourly_cap?: number
          id?: number
          per_domain_daily_cap?: number
          reply_stop_enabled?: boolean
          respect_send_window?: boolean
          send_window_end_hour?: number
          send_window_start_hour?: number
          send_window_timezone?: string
          skip_weekends?: boolean
          updated_at?: string
          warmup_daily_increment?: number
          warmup_initial_cap?: number
          warmup_started_at?: string | null
        }
        Relationships: []
      }
      email_suppressions: {
        Row: {
          created_at: string
          email: string
          notes: string | null
          reason: string
          source: string | null
        }
        Insert: {
          created_at?: string
          email: string
          notes?: string | null
          reason: string
          source?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          notes?: string | null
          reason?: string
          source?: string | null
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          subject: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          subject: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
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
      lead_blacklist: {
        Row: {
          created_at: string
          created_by: string | null
          domain: string
          id: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          domain: string
          id?: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          domain?: string
          id?: string
          reason?: string | null
        }
        Relationships: []
      }
      lead_contact_log: {
        Row: {
          channel: string
          created_at: string
          id: string
          lead_id: string
          note: string
          user_id: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          lead_id: string
          note: string
          user_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          lead_id?: string
          note?: string
          user_id?: string | null
        }
        Relationships: []
      }
      lead_crm: {
        Row: {
          bookmarked: boolean
          created_at: string
          id: string
          lead_id: string
          notes: string | null
          status: Database["public"]["Enums"]["lead_crm_status"]
          updated_at: string
        }
        Insert: {
          bookmarked?: boolean
          created_at?: string
          id?: string
          lead_id: string
          notes?: string | null
          status?: Database["public"]["Enums"]["lead_crm_status"]
          updated_at?: string
        }
        Update: {
          bookmarked?: boolean
          created_at?: string
          id?: string
          lead_id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["lead_crm_status"]
          updated_at?: string
        }
        Relationships: []
      }
      lead_outreach_log: {
        Row: {
          channel: string
          created_at: string
          id: string
          lead_id: string
          note: string
          user_id: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          lead_id: string
          note: string
          user_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          lead_id?: string
          note?: string
          user_id?: string | null
        }
        Relationships: []
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
      othm_leads: {
        Row: {
          city: string | null
          country: string | null
          course_level: string | null
          created_at: string
          created_by: string | null
          email: string | null
          entity_type: string
          full_name: string | null
          id: string
          institution_name: string | null
          intake_month: string | null
          linkedin_url: string | null
          notes: string | null
          outreach_queued: boolean
          phone: string | null
          preferred_country: string | null
          quality_score: number | null
          source: string | null
          stage: string
          tags: string[]
          updated_at: string
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          course_level?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          entity_type?: string
          full_name?: string | null
          id?: string
          institution_name?: string | null
          intake_month?: string | null
          linkedin_url?: string | null
          notes?: string | null
          outreach_queued?: boolean
          phone?: string | null
          preferred_country?: string | null
          quality_score?: number | null
          source?: string | null
          stage?: string
          tags?: string[]
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          course_level?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          entity_type?: string
          full_name?: string | null
          id?: string
          institution_name?: string | null
          intake_month?: string | null
          linkedin_url?: string | null
          notes?: string | null
          outreach_queued?: boolean
          phone?: string | null
          preferred_country?: string | null
          quality_score?: number | null
          source?: string | null
          stage?: string
          tags?: string[]
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: []
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
      provider_quota_state: {
        Row: {
          cycle_end_at: string | null
          cycle_start_at: string | null
          exhausted_at: string | null
          last_checked_at: string
          monthly_limit_usd: number | null
          monthly_usage_usd: number | null
          provider: string
          raw: Json
          updated_at: string
          usage_pct: number | null
        }
        Insert: {
          cycle_end_at?: string | null
          cycle_start_at?: string | null
          exhausted_at?: string | null
          last_checked_at?: string
          monthly_limit_usd?: number | null
          monthly_usage_usd?: number | null
          provider: string
          raw?: Json
          updated_at?: string
          usage_pct?: number | null
        }
        Update: {
          cycle_end_at?: string | null
          cycle_start_at?: string | null
          exhausted_at?: string | null
          last_checked_at?: string
          monthly_limit_usd?: number | null
          monthly_usage_usd?: number | null
          provider?: string
          raw?: Json
          updated_at?: string
          usage_pct?: number | null
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
          quality_score: number
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
          quality_score?: number
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
          quality_score?: number
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
      recruiter_leads: {
        Row: {
          active_orders: Json
          agency_name: string
          company_id: string | null
          confidence: number | null
          contact_email: string | null
          contact_linkedin: string | null
          contact_name: string | null
          contact_phone: string | null
          converted_at: string | null
          created_at: string
          discovered_at: string
          discovery_tier: number | null
          email_delivery_status: string | null
          email_delivery_updated_at: string | null
          email_enriched: boolean
          email_error: string | null
          email_last_event: string | null
          email_sent_at: string | null
          email_source: string
          email_status: string
          excluded_reason: string | null
          hq_city: string | null
          hq_country: string | null
          id: string
          last_enrichment_at: string | null
          last_enrichment_error: string | null
          last_seen_at: string
          last_signal_at: string | null
          license_number: string | null
          license_verified: boolean
          normalized_domain: string | null
          notes: string | null
          operating_eu_country: string | null
          quality_score: number
          raw_signal_id: string | null
          recruitment_model: Database["public"]["Enums"]["recruitment_model_tag"][]
          replied_at: string | null
          resend_message_id: string | null
          role_classification: string | null
          source_posted_at: string | null
          source_url: string | null
          status: string
          trades: string[]
          updated_at: string
          website: string | null
          whatsapp_followup_at: string | null
          whatsapp_status: string | null
          worker_collar: string | null
          worker_origin_focus: string[]
        }
        Insert: {
          active_orders?: Json
          agency_name: string
          company_id?: string | null
          confidence?: number | null
          contact_email?: string | null
          contact_linkedin?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          converted_at?: string | null
          created_at?: string
          discovered_at?: string
          discovery_tier?: number | null
          email_delivery_status?: string | null
          email_delivery_updated_at?: string | null
          email_enriched?: boolean
          email_error?: string | null
          email_last_event?: string | null
          email_sent_at?: string | null
          email_source?: string
          email_status?: string
          excluded_reason?: string | null
          hq_city?: string | null
          hq_country?: string | null
          id?: string
          last_enrichment_at?: string | null
          last_enrichment_error?: string | null
          last_seen_at?: string
          last_signal_at?: string | null
          license_number?: string | null
          license_verified?: boolean
          normalized_domain?: string | null
          notes?: string | null
          operating_eu_country?: string | null
          quality_score?: number
          raw_signal_id?: string | null
          recruitment_model?: Database["public"]["Enums"]["recruitment_model_tag"][]
          replied_at?: string | null
          resend_message_id?: string | null
          role_classification?: string | null
          source_posted_at?: string | null
          source_url?: string | null
          status?: string
          trades?: string[]
          updated_at?: string
          website?: string | null
          whatsapp_followup_at?: string | null
          whatsapp_status?: string | null
          worker_collar?: string | null
          worker_origin_focus?: string[]
        }
        Update: {
          active_orders?: Json
          agency_name?: string
          company_id?: string | null
          confidence?: number | null
          contact_email?: string | null
          contact_linkedin?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          converted_at?: string | null
          created_at?: string
          discovered_at?: string
          discovery_tier?: number | null
          email_delivery_status?: string | null
          email_delivery_updated_at?: string | null
          email_enriched?: boolean
          email_error?: string | null
          email_last_event?: string | null
          email_sent_at?: string | null
          email_source?: string
          email_status?: string
          excluded_reason?: string | null
          hq_city?: string | null
          hq_country?: string | null
          id?: string
          last_enrichment_at?: string | null
          last_enrichment_error?: string | null
          last_seen_at?: string
          last_signal_at?: string | null
          license_number?: string | null
          license_verified?: boolean
          normalized_domain?: string | null
          notes?: string | null
          operating_eu_country?: string | null
          quality_score?: number
          raw_signal_id?: string | null
          recruitment_model?: Database["public"]["Enums"]["recruitment_model_tag"][]
          replied_at?: string | null
          resend_message_id?: string | null
          role_classification?: string | null
          source_posted_at?: string | null
          source_url?: string | null
          status?: string
          trades?: string[]
          updated_at?: string
          website?: string | null
          whatsapp_followup_at?: string | null
          whatsapp_status?: string | null
          worker_collar?: string | null
          worker_origin_focus?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "recruiter_leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruiter_leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_demand_stats"
            referencedColumns: ["company_id"]
          },
        ]
      }
      scheduled_emails: {
        Row: {
          attempts: number
          blocked_at: string | null
          blocking_reason: string | null
          body: string
          cancelled_reason: string | null
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          lead_id: string | null
          message_id: string | null
          recipient_country: string | null
          send_at: string
          sent_at: string | null
          status: string
          subject: string
          template_name: string | null
          to_email: string
          unblocked_at: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          blocked_at?: string | null
          blocking_reason?: string | null
          body: string
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          lead_id?: string | null
          message_id?: string | null
          recipient_country?: string | null
          send_at: string
          sent_at?: string | null
          status?: string
          subject: string
          template_name?: string | null
          to_email: string
          unblocked_at?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          blocked_at?: string | null
          blocking_reason?: string | null
          body?: string
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          lead_id?: string | null
          message_id?: string | null
          recipient_country?: string | null
          send_at?: string
          sent_at?: string | null
          status?: string
          subject?: string
          template_name?: string | null
          to_email?: string
          unblocked_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      scrape_jobs: {
        Row: {
          actor_id: string | null
          apify_run_id: string | null
          cost_usd: number | null
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
          cost_usd?: number | null
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
          cost_usd?: number | null
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
      source_boards: {
        Row: {
          apify_actor_id: string | null
          board_domain: string
          board_name: string | null
          board_type: string
          country: string
          country_iso2: string
          created_at: string
          daily_cap: number
          enabled: boolean
          id: string
          lang: string | null
          last_error: string | null
          last_run_at: string | null
          last_success_at: string | null
          notes: string | null
          priority: number
          search_queries: string[]
          total_leads_found: number
          total_runs: number
          updated_at: string
        }
        Insert: {
          apify_actor_id?: string | null
          board_domain: string
          board_name?: string | null
          board_type?: string
          country: string
          country_iso2: string
          created_at?: string
          daily_cap?: number
          enabled?: boolean
          id?: string
          lang?: string | null
          last_error?: string | null
          last_run_at?: string | null
          last_success_at?: string | null
          notes?: string | null
          priority?: number
          search_queries?: string[]
          total_leads_found?: number
          total_runs?: number
          updated_at?: string
        }
        Update: {
          apify_actor_id?: string | null
          board_domain?: string
          board_name?: string | null
          board_type?: string
          country?: string
          country_iso2?: string
          created_at?: string
          daily_cap?: number
          enabled?: boolean
          id?: string
          lang?: string | null
          last_error?: string | null
          last_run_at?: string | null
          last_success_at?: string | null
          notes?: string | null
          priority?: number
          search_queries?: string[]
          total_leads_found?: number
          total_runs?: number
          updated_at?: string
        }
        Relationships: []
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
          max_items_per_run: number
          monthly_budget_usd: number | null
          monthly_spend_usd: number
          notes: string | null
          priority: number
          rate_limit_per_hour: number
          schedule_cron: string | null
          source_family: Database["public"]["Enums"]["demand_source"]
          spend_cycle_start: string
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
          max_items_per_run?: number
          monthly_budget_usd?: number | null
          monthly_spend_usd?: number
          notes?: string | null
          priority?: number
          rate_limit_per_hour?: number
          schedule_cron?: string | null
          source_family: Database["public"]["Enums"]["demand_source"]
          spend_cycle_start?: string
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
          max_items_per_run?: number
          monthly_budget_usd?: number | null
          monthly_spend_usd?: number
          notes?: string | null
          priority?: number
          rate_limit_per_hour?: number
          schedule_cron?: string | null
          source_family?: Database["public"]["Enums"]["demand_source"]
          spend_cycle_start?: string
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
      whatsapp_outreach: {
        Row: {
          created_at: string
          created_by: string | null
          display_number: string
          id: string
          lead_id: string
          message: string
          opened_at: string | null
          queue_date: string
          sent_at: string | null
          status: string
          template_name: string
          to_number: string
          updated_at: string
          wa_link: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_number: string
          id?: string
          lead_id: string
          message: string
          opened_at?: string | null
          queue_date: string
          sent_at?: string | null
          status?: string
          template_name?: string
          to_number: string
          updated_at?: string
          wa_link: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_number?: string
          id?: string
          lead_id?: string
          message?: string
          opened_at?: string | null
          queue_date?: string
          sent_at?: string | null
          status?: string
          template_name?: string
          to_number?: string
          updated_at?: string
          wa_link?: string
        }
        Relationships: []
      }
      whatsapp_send_settings: {
        Row: {
          daily_cap: number
          id: number
          updated_at: string
        }
        Insert: {
          daily_cap?: number
          id?: number
          updated_at?: string
        }
        Update: {
          daily_cap?: number
          id?: number
          updated_at?: string
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
      email_sent_today: {
        Row: {
          sent_last_hour: number | null
          sent_today: number | null
        }
        Relationships: []
      }
      qualified_local_leads: {
        Row: {
          ai_rationale: string | null
          city: string | null
          company_id: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_qualified: boolean | null
          country: string | null
          created_at: string | null
          demand_size: number | null
          discovered_board: string | null
          discovered_board_domain: string | null
          duplicate_of: string | null
          email_enriched: boolean | null
          employer_name: string | null
          enrichment_attempts: number | null
          id: string | null
          last_enriched_at: string | null
          local_lang: string | null
          matched_keywords: string[] | null
          normalized_demand_id: string | null
          notes: string | null
          phone_enriched: boolean | null
          posted_at_local: string | null
          priority: Database["public"]["Enums"]["priority_tag"] | null
          quality_score: number | null
          raw_signal_id: string | null
          review_status: string | null
          role: string | null
          salary_currency: string | null
          salary_max: number | null
          salary_min: number | null
          score: number | null
          score_breakdown: Json | null
          sector_tags: string[] | null
          snoozed_until: string | null
          source: Database["public"]["Enums"]["demand_source"] | null
          source_url: string | null
          sponsorship_signals: string[] | null
          target_audience_type: string | null
          tier: string | null
          updated_at: string | null
          urgency_score: number | null
          visa_sponsorship: boolean | null
          worker_origin_focus: string[] | null
        }
        Insert: {
          ai_rationale?: string | null
          city?: string | null
          company_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_qualified?: boolean | null
          country?: string | null
          created_at?: string | null
          demand_size?: number | null
          discovered_board?: string | null
          discovered_board_domain?: string | null
          duplicate_of?: string | null
          email_enriched?: boolean | null
          employer_name?: string | null
          enrichment_attempts?: number | null
          id?: string | null
          last_enriched_at?: string | null
          local_lang?: string | null
          matched_keywords?: string[] | null
          normalized_demand_id?: string | null
          notes?: string | null
          phone_enriched?: boolean | null
          posted_at_local?: string | null
          priority?: Database["public"]["Enums"]["priority_tag"] | null
          quality_score?: number | null
          raw_signal_id?: string | null
          review_status?: string | null
          role?: string | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          score?: number | null
          score_breakdown?: Json | null
          sector_tags?: string[] | null
          snoozed_until?: string | null
          source?: Database["public"]["Enums"]["demand_source"] | null
          source_url?: string | null
          sponsorship_signals?: string[] | null
          target_audience_type?: string | null
          tier?: string | null
          updated_at?: string | null
          urgency_score?: number | null
          visa_sponsorship?: boolean | null
          worker_origin_focus?: string[] | null
        }
        Update: {
          ai_rationale?: string | null
          city?: string | null
          company_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_qualified?: boolean | null
          country?: string | null
          created_at?: string | null
          demand_size?: number | null
          discovered_board?: string | null
          discovered_board_domain?: string | null
          duplicate_of?: string | null
          email_enriched?: boolean | null
          employer_name?: string | null
          enrichment_attempts?: number | null
          id?: string | null
          last_enriched_at?: string | null
          local_lang?: string | null
          matched_keywords?: string[] | null
          normalized_demand_id?: string | null
          notes?: string | null
          phone_enriched?: boolean | null
          posted_at_local?: string | null
          priority?: Database["public"]["Enums"]["priority_tag"] | null
          quality_score?: number | null
          raw_signal_id?: string | null
          review_status?: string | null
          role?: string | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          score?: number | null
          score_breakdown?: Json | null
          sector_tags?: string[] | null
          snoozed_until?: string | null
          source?: Database["public"]["Enums"]["demand_source"] | null
          source_url?: string | null
          sponsorship_signals?: string[] | null
          target_audience_type?: string | null
          tier?: string | null
          updated_at?: string | null
          urgency_score?: number | null
          visa_sponsorship?: boolean | null
          worker_origin_focus?: string[] | null
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
            foreignKeyName: "demand_leads_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "qualified_local_leads"
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
      source_quality_stats: {
        Row: {
          avg_quality: number | null
          good_leads: number | null
          good_pct: number | null
          source: string | null
          total_leads: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _lead_haystack: {
        Args: {
          _employer: string
          _notes: string
          _role: string
          _source_url: string
        }
        Returns: string
      }
      archive_and_delete_demand_lead: {
        Args: { _by?: string; _id: string; _reason: string }
        Returns: string
      }
      archive_and_delete_raw_signal: {
        Args: { _by?: string; _id: string; _reason: string }
        Returns: string
      }
      archive_low_quality_demand_leads: {
        Args: {
          _by?: string
          _min_score?: number
          _require_no_contact?: boolean
        }
        Returns: number
      }
      compute_demand_lead_quality_score: {
        Args: { _lead: Database["public"]["Tables"]["demand_leads"]["Row"] }
        Returns: number
      }
      compute_lead_score: {
        Args: { _lead: Database["public"]["Tables"]["demand_leads"]["Row"] }
        Returns: Json
      }
      compute_quality_score: {
        Args: {
          _contact_email: string
          _contact_phone: string
          _employer_name: string
          _role: string
        }
        Returns: number
      }
      compute_raw_signal_quality_score: {
        Args: { _payload: Json; _source: string }
        Returns: number
      }
      compute_recruiter_quality_score: {
        Args: { _lead: Database["public"]["Tables"]["recruiter_leads"]["Row"] }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_source_spend: {
        Args: { _amount: number; _source_id: string }
        Returns: number
      }
      is_team_member: { Args: { _user_id: string }; Returns: boolean }
      restore_archived_lead: { Args: { _archived_id: string }; Returns: string }
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
      job_status:
        | "queued"
        | "running"
        | "succeeded"
        | "failed"
        | "quota_exceeded"
        | "succeeded_empty"
        | "skipped_quota"
      lead_crm_status:
        | "new"
        | "contacted"
        | "in_progress"
        | "converted"
        | "rejected"
      priority_tag: "high" | "medium" | "low"
      recruitment_model_tag:
        | "no_advance_after_visa"
        | "no_advance_after_deployment"
        | "free_recruitment"
        | "company_recruitment"
        | "unknown"
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
      job_status: [
        "queued",
        "running",
        "succeeded",
        "failed",
        "quota_exceeded",
        "succeeded_empty",
        "skipped_quota",
      ],
      lead_crm_status: [
        "new",
        "contacted",
        "in_progress",
        "converted",
        "rejected",
      ],
      priority_tag: ["high", "medium", "low"],
      recruitment_model_tag: [
        "no_advance_after_visa",
        "no_advance_after_deployment",
        "free_recruitment",
        "company_recruitment",
        "unknown",
      ],
    },
  },
} as const
