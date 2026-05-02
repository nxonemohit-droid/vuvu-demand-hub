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
      demand_leads: {
        Row: {
          city: string | null
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
          notes: string | null
          priority: Database["public"]["Enums"]["priority_tag"]
          raw_signal_id: string | null
          role: string
          salary_currency: string | null
          salary_max: number | null
          salary_min: number | null
          source: Database["public"]["Enums"]["demand_source"]
          source_url: string | null
          updated_at: string
          urgency_score: number
          visa_sponsorship: boolean
        }
        Insert: {
          city?: string | null
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
          notes?: string | null
          priority?: Database["public"]["Enums"]["priority_tag"]
          raw_signal_id?: string | null
          role: string
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          source: Database["public"]["Enums"]["demand_source"]
          source_url?: string | null
          updated_at?: string
          urgency_score?: number
          visa_sponsorship?: boolean
        }
        Update: {
          city?: string | null
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
          notes?: string | null
          priority?: Database["public"]["Enums"]["priority_tag"]
          raw_signal_id?: string | null
          role?: string
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          source?: Database["public"]["Enums"]["demand_source"]
          source_url?: string | null
          updated_at?: string
          urgency_score?: number
          visa_sponsorship?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "demand_leads_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "demand_leads"
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
          created_at: string
          fingerprint: string
          id: string
          job_id: string | null
          payload: Json
          raw_text: string | null
          source: Database["public"]["Enums"]["demand_source"]
          source_id: string | null
          source_url: string | null
          structured: boolean
        }
        Insert: {
          created_at?: string
          fingerprint: string
          id?: string
          job_id?: string | null
          payload?: Json
          raw_text?: string | null
          source: Database["public"]["Enums"]["demand_source"]
          source_id?: string | null
          source_url?: string | null
          structured?: boolean
        }
        Update: {
          created_at?: string
          fingerprint?: string
          id?: string
          job_id?: string | null
          payload?: Json
          raw_text?: string | null
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
          items_found: number
          items_structured: number
          keyword: string | null
          source: Database["public"]["Enums"]["demand_source"]
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
          items_found?: number
          items_structured?: number
          keyword?: string | null
          source: Database["public"]["Enums"]["demand_source"]
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
          items_found?: number
          items_structured?: number
          keyword?: string | null
          source?: Database["public"]["Enums"]["demand_source"]
          started_at?: string
          status?: Database["public"]["Enums"]["job_status"]
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
      [_ in never]: never
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
    }
    Enums: {
      app_role: "admin" | "bd" | "viewer"
      demand_source:
        | "facebook"
        | "indeed"
        | "classifieds"
        | "career_page"
        | "other"
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
      ],
      job_status: ["queued", "running", "succeeded", "failed"],
      priority_tag: ["high", "medium", "low"],
    },
  },
} as const
