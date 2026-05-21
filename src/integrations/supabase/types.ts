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
      change_groups: {
        Row: {
          action_type: Database["public"]["Enums"]["action_type"]
          created_at: string
          id: string
          page_id: string | null
          requires_approval: boolean
          risk_level: string
          rollback_strategy: string
          status: Database["public"]["Enums"]["change_status"]
          tenant_id: string
        }
        Insert: {
          action_type: Database["public"]["Enums"]["action_type"]
          created_at?: string
          id?: string
          page_id?: string | null
          requires_approval?: boolean
          risk_level?: string
          rollback_strategy?: string
          status?: Database["public"]["Enums"]["change_status"]
          tenant_id: string
        }
        Update: {
          action_type?: Database["public"]["Enums"]["action_type"]
          created_at?: string
          id?: string
          page_id?: string | null
          requires_approval?: boolean
          risk_level?: string
          rollback_strategy?: string
          status?: Database["public"]["Enums"]["change_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_groups_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      changes: {
        Row: {
          after_snapshot_id: string | null
          before_snapshot_id: string | null
          change_group_id: string
          created_at: string
          diff: Json
          field: string
          id: string
          tenant_id: string
        }
        Insert: {
          after_snapshot_id?: string | null
          before_snapshot_id?: string | null
          change_group_id: string
          created_at?: string
          diff: Json
          field: string
          id?: string
          tenant_id: string
        }
        Update: {
          after_snapshot_id?: string | null
          before_snapshot_id?: string | null
          change_group_id?: string
          created_at?: string
          diff?: Json
          field?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "changes_after_snapshot_id_fkey"
            columns: ["after_snapshot_id"]
            isOneToOne: false
            referencedRelation: "page_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "changes_before_snapshot_id_fkey"
            columns: ["before_snapshot_id"]
            isOneToOne: false
            referencedRelation: "page_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "changes_change_group_id_fkey"
            columns: ["change_group_id"]
            isOneToOne: false
            referencedRelation: "change_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "changes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      health_scores: {
        Row: {
          category: string
          id: string
          measured_at: string
          score: number
          tenant_id: string
        }
        Insert: {
          category: string
          id?: string
          measured_at?: string
          score: number
          tenant_id: string
        }
        Update: {
          category?: string
          id?: string
          measured_at?: string
          score?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_scores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      issues: {
        Row: {
          code: string
          details: Json | null
          id: string
          page_id: string | null
          resolved_at: string | null
          scan_id: string | null
          severity: Database["public"]["Enums"]["issue_severity"]
          tenant_id: string
          title: string
        }
        Insert: {
          code: string
          details?: Json | null
          id?: string
          page_id?: string | null
          resolved_at?: string | null
          scan_id?: string | null
          severity: Database["public"]["Enums"]["issue_severity"]
          tenant_id: string
          title: string
        }
        Update: {
          code?: string
          details?: Json | null
          id?: string
          page_id?: string | null
          resolved_at?: string | null
          scan_id?: string | null
          severity?: Database["public"]["Enums"]["issue_severity"]
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "issues_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          lead_id: string
          payload: Json | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          lead_id: string
          payload?: Json | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          lead_id?: string
          payload?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          attribution: Json | null
          created_at: string
          email: string | null
          id: string
          name: string | null
          page_id: string | null
          payload: Json | null
          phone: string | null
          source: string | null
          status: Database["public"]["Enums"]["lead_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attribution?: Json | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          page_id?: string | null
          payload?: Json | null
          phone?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attribution?: Json | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          page_id?: string | null
          payload?: Json | null
          phone?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      master_plans: {
        Row: {
          ai_credits_per_month: number | null
          capacity_hours_per_month: number | null
          content_pillars: Json
          icp: Json
          id: string
          services: Json
          target_keywords: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ai_credits_per_month?: number | null
          capacity_hours_per_month?: number | null
          content_pillars?: Json
          icp?: Json
          id?: string
          services?: Json
          target_keywords?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ai_credits_per_month?: number | null
          capacity_hours_per_month?: number | null
          content_pillars?: Json
          icp?: Json
          id?: string
          services?: Json
          target_keywords?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_plans: {
        Row: {
          generated_at: string
          id: string
          period_month: string
          priorities: Json
          status: string
          tenant_id: string
        }
        Insert: {
          generated_at?: string
          id?: string
          period_month: string
          priorities?: Json
          status?: string
          tenant_id: string
        }
        Update: {
          generated_at?: string
          id?: string
          period_month?: string
          priorities?: Json
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_sessions: {
        Row: {
          created_at: string
          expires_at: string
          geo: Database["public"]["Enums"]["geo_code"] | null
          id: string
          site_url: string | null
          status: Database["public"]["Enums"]["onboarding_status"]
          tenant_id: string | null
          user_id: string
          vertical: Database["public"]["Enums"]["vertical_code"] | null
          wp_probe_result: Json | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          geo?: Database["public"]["Enums"]["geo_code"] | null
          id?: string
          site_url?: string | null
          status?: Database["public"]["Enums"]["onboarding_status"]
          tenant_id?: string | null
          user_id: string
          vertical?: Database["public"]["Enums"]["vertical_code"] | null
          wp_probe_result?: Json | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          geo?: Database["public"]["Enums"]["geo_code"] | null
          id?: string
          site_url?: string | null
          status?: Database["public"]["Enums"]["onboarding_status"]
          tenant_id?: string | null
          user_id?: string
          vertical?: Database["public"]["Enums"]["vertical_code"] | null
          wp_probe_result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      page_snapshots: {
        Row: {
          created_at: string
          html: string | null
          id: string
          meta: Json | null
          page_id: string
          screenshot_path: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          html?: string | null
          id?: string
          meta?: Json | null
          page_id: string
          screenshot_path?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          html?: string | null
          id?: string
          meta?: Json | null
          page_id?: string
          screenshot_path?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_snapshots_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          created_at: string
          health_score: number | null
          id: string
          last_audited_at: string | null
          site_connection_id: string | null
          template: string | null
          tenant_id: string
          title: string | null
          url: string
          wp_post_id: number | null
        }
        Insert: {
          created_at?: string
          health_score?: number | null
          id?: string
          last_audited_at?: string | null
          site_connection_id?: string | null
          template?: string | null
          tenant_id: string
          title?: string | null
          url: string
          wp_post_id?: number | null
        }
        Update: {
          created_at?: string
          health_score?: number | null
          id?: string
          last_audited_at?: string | null
          site_connection_id?: string | null
          template?: string | null
          tenant_id?: string
          title?: string | null
          url?: string
          wp_post_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pages_site_connection_id_fkey"
            columns: ["site_connection_id"]
            isOneToOne: false
            referencedRelation: "site_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_docs: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          slug: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          id?: string
          slug: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          slug?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      raw_events: {
        Row: {
          id: string
          lead_id: string | null
          payload: Json
          processed_at: string | null
          processing_error: string | null
          received_at: string
          source: string
          tenant_id: string
        }
        Insert: {
          id?: string
          lead_id?: string | null
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
          source: string
          tenant_id: string
        }
        Update: {
          id?: string
          lead_id?: string | null
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
          source?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scans: {
        Row: {
          engine: string
          finished_at: string | null
          id: string
          started_at: string
          status: string
          tenant_id: string
        }
        Insert: {
          engine: string
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          tenant_id: string
        }
        Update: {
          engine?: string
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      secret_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          created_at: string
          id: string
          secret_key: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type: string
          created_at?: string
          id?: string
          secret_key: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          id?: string
          secret_key?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "secret_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      site_connections: {
        Row: {
          base_url: string | null
          created_at: string
          external_account_id: string | null
          id: string
          last_probe_at: string | null
          probe_result: Json | null
          status: Database["public"]["Enums"]["connection_status"]
          tenant_id: string
          type: Database["public"]["Enums"]["connection_type"]
        }
        Insert: {
          base_url?: string | null
          created_at?: string
          external_account_id?: string | null
          id?: string
          last_probe_at?: string | null
          probe_result?: Json | null
          status?: Database["public"]["Enums"]["connection_status"]
          tenant_id: string
          type: Database["public"]["Enums"]["connection_type"]
        }
        Update: {
          base_url?: string | null
          created_at?: string
          external_account_id?: string | null
          id?: string
          last_probe_at?: string | null
          probe_result?: Json | null
          status?: Database["public"]["Enums"]["connection_status"]
          tenant_id?: string
          type?: Database["public"]["Enums"]["connection_type"]
        }
        Relationships: [
          {
            foreignKeyName: "site_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_secrets: {
        Row: {
          created_at: string
          encryption_version: number
          id: string
          key: string
          tenant_id: string
          updated_at: string
          value_encrypted: string
        }
        Insert: {
          created_at?: string
          encryption_version?: number
          id?: string
          key: string
          tenant_id: string
          updated_at?: string
          value_encrypted: string
        }
        Update: {
          created_at?: string
          encryption_version?: number
          id?: string
          key?: string
          tenant_id?: string
          updated_at?: string
          value_encrypted?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_secrets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          geo: Database["public"]["Enums"]["geo_code"]
          id: string
          name: string
          status: string
          updated_at: string
          vertical: Database["public"]["Enums"]["vertical_code"]
        }
        Insert: {
          created_at?: string
          geo: Database["public"]["Enums"]["geo_code"]
          id?: string
          name: string
          status?: string
          updated_at?: string
          vertical: Database["public"]["Enums"]["vertical_code"]
        }
        Update: {
          created_at?: string
          geo?: Database["public"]["Enums"]["geo_code"]
          id?: string
          name?: string
          status?: string
          updated_at?: string
          vertical?: Database["public"]["Enums"]["vertical_code"]
        }
        Relationships: []
      }
      workflow_runs: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          job_name: string
          payload: Json | null
          result: Json | null
          started_at: string | null
          state: Database["public"]["Enums"]["workflow_state"]
          tenant_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          job_name: string
          payload?: Json | null
          result?: Json | null
          started_at?: string | null
          state?: Database["public"]["Enums"]["workflow_state"]
          tenant_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          job_name?: string
          payload?: Json | null
          result?: Json | null
          started_at?: string | null
          state?: Database["public"]["Enums"]["workflow_state"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wp_write_operations: {
        Row: {
          change_group_id: string | null
          created_at: string
          error: string | null
          http_status: number | null
          id: string
          operation: string
          request: Json
          response: Json | null
          status: string
          tenant_id: string
          wp_post_id: number | null
        }
        Insert: {
          change_group_id?: string | null
          created_at?: string
          error?: string | null
          http_status?: number | null
          id?: string
          operation: string
          request: Json
          response?: Json | null
          status?: string
          tenant_id: string
          wp_post_id?: number | null
        }
        Update: {
          change_group_id?: string | null
          created_at?: string
          error?: string | null
          http_status?: number | null
          id?: string
          operation?: string
          request?: Json
          response?: Json | null
          status?: string
          tenant_id?: string
          wp_post_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wp_write_operations_change_group_id_fkey"
            columns: ["change_group_id"]
            isOneToOne: false
            referencedRelation: "change_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_write_operations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_tenant_with_owner: {
        Args: {
          p_geo: Database["public"]["Enums"]["geo_code"]
          p_name: string
          p_vertical: Database["public"]["Enums"]["vertical_code"]
        }
        Returns: string
      }
      has_tenant_min_role: {
        Args: {
          _min_role: Database["public"]["Enums"]["app_role"]
          _tenant_id: string
        }
        Returns: boolean
      }
      has_tenant_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _tenant_id: string
        }
        Returns: boolean
      }
      is_tenant_member: { Args: { _tenant_id: string }; Returns: boolean }
    }
    Enums: {
      action_type:
        | "publish_page"
        | "fix_seo"
        | "gbp_post"
        | "review_respond"
        | "create_page"
      app_role: "owner" | "operator" | "client_approver" | "client_viewer"
      approval_state: "pending" | "approved" | "rejected" | "auto_approved"
      change_status:
        | "proposed"
        | "approved"
        | "published"
        | "rejected"
        | "rolled_back"
      connection_status: "pending" | "connected" | "error" | "revoked"
      connection_type: "wordpress" | "gbp" | "gsc" | "ga4"
      geo_code: "NL" | "US"
      issue_severity: "low" | "medium" | "high" | "critical"
      lead_status: "new" | "qualified" | "junk" | "won" | "lost"
      onboarding_status:
        | "started"
        | "wp_probe_failed"
        | "wp_probe_ok"
        | "tenant_created"
        | "expired"
      vertical_code:
        | "healthcare"
        | "legal"
        | "insurance"
        | "home_services"
        | "b2b"
        | "consulting"
        | "other"
      workflow_state:
        | "queued"
        | "running"
        | "awaiting_approval"
        | "publishing"
        | "verifying"
        | "done"
        | "failed"
        | "rolled_back"
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
      action_type: [
        "publish_page",
        "fix_seo",
        "gbp_post",
        "review_respond",
        "create_page",
      ],
      app_role: ["owner", "operator", "client_approver", "client_viewer"],
      approval_state: ["pending", "approved", "rejected", "auto_approved"],
      change_status: [
        "proposed",
        "approved",
        "published",
        "rejected",
        "rolled_back",
      ],
      connection_status: ["pending", "connected", "error", "revoked"],
      connection_type: ["wordpress", "gbp", "gsc", "ga4"],
      geo_code: ["NL", "US"],
      issue_severity: ["low", "medium", "high", "critical"],
      lead_status: ["new", "qualified", "junk", "won", "lost"],
      onboarding_status: [
        "started",
        "wp_probe_failed",
        "wp_probe_ok",
        "tenant_created",
        "expired",
      ],
      vertical_code: [
        "healthcare",
        "legal",
        "insurance",
        "home_services",
        "b2b",
        "consulting",
        "other",
      ],
      workflow_state: [
        "queued",
        "running",
        "awaiting_approval",
        "publishing",
        "verifying",
        "done",
        "failed",
        "rolled_back",
      ],
    },
  },
} as const
