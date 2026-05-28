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
      audit_pages: {
        Row: {
          audit_id: string
          external_links_count: number
          fetched_at: string
          h1: string | null
          id: string
          images_without_alt: number
          internal_links_count: number
          issues: Json
          meta_description: string | null
          page_id: string | null
          schema: Json | null
          status_code: number | null
          tenant_id: string
          title: string | null
          url: string
          word_count: number
        }
        Insert: {
          audit_id: string
          external_links_count?: number
          fetched_at?: string
          h1?: string | null
          id?: string
          images_without_alt?: number
          internal_links_count?: number
          issues?: Json
          meta_description?: string | null
          page_id?: string | null
          schema?: Json | null
          status_code?: number | null
          tenant_id: string
          title?: string | null
          url: string
          word_count?: number
        }
        Update: {
          audit_id?: string
          external_links_count?: number
          fetched_at?: string
          h1?: string | null
          id?: string
          images_without_alt?: number
          internal_links_count?: number
          issues?: Json
          meta_description?: string | null
          page_id?: string | null
          schema?: Json | null
          status_code?: number | null
          tenant_id?: string
          title?: string | null
          url?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "audit_pages_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_pages_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_pages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audits: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          pages_count: number
          site_connection_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["audit_status"]
          summary: Json
          tenant_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          pages_count?: number
          site_connection_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["audit_status"]
          summary?: Json
          tenant_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          pages_count?: number
          site_connection_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["audit_status"]
          summary?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audits_site_connection_id_fkey"
            columns: ["site_connection_id"]
            isOneToOne: false
            referencedRelation: "site_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_voice_profiles: {
        Row: {
          analyzed_at: string | null
          created_at: string
          example_phrases: Json
          forbidden_words: Json
          id: string
          job_error: string | null
          job_status: Database["public"]["Enums"]["brand_voice_job_status"]
          language: string
          preferred_words: Json
          reading_level: string | null
          source_urls: Json
          tenant_id: string
          tone_summary: string | null
          updated_at: string
          writing_style: Json
        }
        Insert: {
          analyzed_at?: string | null
          created_at?: string
          example_phrases?: Json
          forbidden_words?: Json
          id?: string
          job_error?: string | null
          job_status?: Database["public"]["Enums"]["brand_voice_job_status"]
          language?: string
          preferred_words?: Json
          reading_level?: string | null
          source_urls?: Json
          tenant_id: string
          tone_summary?: string | null
          updated_at?: string
          writing_style?: Json
        }
        Update: {
          analyzed_at?: string | null
          created_at?: string
          example_phrases?: Json
          forbidden_words?: Json
          id?: string
          job_error?: string | null
          job_status?: Database["public"]["Enums"]["brand_voice_job_status"]
          language?: string
          preferred_words?: Json
          reading_level?: string | null
          source_urls?: Json
          tenant_id?: string
          tone_summary?: string | null
          updated_at?: string
          writing_style?: Json
        }
        Relationships: []
      }
      business_profile_analyzer_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          result: Json
          stage: string
          started_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          result?: Json
          stage?: string
          started_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          result?: Json
          stage?: string
          started_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_profile_analyzer_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      business_profile_feedback: {
        Row: {
          after_value: Json | null
          before_value: Json | null
          created_at: string
          created_by: string | null
          feedback_type: string
          field_path: string | null
          id: string
          reason: string | null
          suggestion_id: string | null
          tenant_id: string
        }
        Insert: {
          after_value?: Json | null
          before_value?: Json | null
          created_at?: string
          created_by?: string | null
          feedback_type: string
          field_path?: string | null
          id?: string
          reason?: string | null
          suggestion_id?: string | null
          tenant_id: string
        }
        Update: {
          after_value?: Json | null
          before_value?: Json | null
          created_at?: string
          created_by?: string | null
          feedback_type?: string
          field_path?: string | null
          id?: string
          reason?: string | null
          suggestion_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_profile_feedback_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "business_profile_suggestions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_profile_feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      business_profile_suggestions: {
        Row: {
          business_profile_id: string | null
          can_use_in_proposals: boolean
          confidence: number
          created_at: string
          current_value: Json | null
          decided_at: string | null
          decided_by: string | null
          field_path: string
          id: string
          rationale: string | null
          requires_review: boolean
          section: string
          source_evidence: Json
          source_type: string
          status: string
          suggested_value: Json
          tenant_id: string
        }
        Insert: {
          business_profile_id?: string | null
          can_use_in_proposals?: boolean
          confidence?: number
          created_at?: string
          current_value?: Json | null
          decided_at?: string | null
          decided_by?: string | null
          field_path: string
          id?: string
          rationale?: string | null
          requires_review?: boolean
          section: string
          source_evidence?: Json
          source_type?: string
          status?: string
          suggested_value: Json
          tenant_id: string
        }
        Update: {
          business_profile_id?: string | null
          can_use_in_proposals?: boolean
          confidence?: number
          created_at?: string
          current_value?: Json | null
          decided_at?: string | null
          decided_by?: string | null
          field_path?: string
          id?: string
          rationale?: string | null
          requires_review?: boolean
          section?: string
          source_evidence?: Json
          source_type?: string
          status?: string
          suggested_value?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_profile_suggestions_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_profile_suggestions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      business_profiles: {
        Row: {
          avoid_claims: Json
          business_name: string | null
          created_at: string
          id: string
          industry: string | null
          language: string
          main_promise: string | null
          preferred_cta: string | null
          primary_offer: string | null
          proof_points: Json
          secondary_offers: Json
          service_areas: Json
          target_audience: Json
          tenant_id: string
          tone_preference: string | null
          unique_value_proposition: string | null
          updated_at: string
        }
        Insert: {
          avoid_claims?: Json
          business_name?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          language?: string
          main_promise?: string | null
          preferred_cta?: string | null
          primary_offer?: string | null
          proof_points?: Json
          secondary_offers?: Json
          service_areas?: Json
          target_audience?: Json
          tenant_id: string
          tone_preference?: string | null
          unique_value_proposition?: string | null
          updated_at?: string
        }
        Update: {
          avoid_claims?: Json
          business_name?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          language?: string
          main_promise?: string | null
          preferred_cta?: string | null
          primary_offer?: string | null
          proof_points?: Json
          secondary_offers?: Json
          service_areas?: Json
          target_audience?: Json
          tenant_id?: string
          tone_preference?: string | null
          unique_value_proposition?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      business_profiles_v2: {
        Row: {
          business_identity: Json
          claim_guardrails: Json
          confidence_map: Json
          confidence_reasons: Json
          confidence_score: number
          conversion_profile: Json
          created_at: string
          icp_profile: Json
          id: string
          location_profile: Json
          locked_fields: Json
          missing_context: Json
          offer_profile: Json
          proof_profile: Json
          source_map: Json
          status: string
          strategy_angles: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          business_identity?: Json
          claim_guardrails?: Json
          confidence_map?: Json
          confidence_reasons?: Json
          confidence_score?: number
          conversion_profile?: Json
          created_at?: string
          icp_profile?: Json
          id?: string
          location_profile?: Json
          locked_fields?: Json
          missing_context?: Json
          offer_profile?: Json
          proof_profile?: Json
          source_map?: Json
          status?: string
          strategy_angles?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          business_identity?: Json
          claim_guardrails?: Json
          confidence_map?: Json
          confidence_reasons?: Json
          confidence_score?: number
          conversion_profile?: Json
          created_at?: string
          icp_profile?: Json
          id?: string
          location_profile?: Json
          locked_fields?: Json
          missing_context?: Json
          offer_profile?: Json
          proof_profile?: Json
          source_map?: Json
          status?: string
          strategy_angles?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_profiles_v2_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
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
      competitor_scans: {
        Row: {
          clusters_scanned: number | null
          confidence: number | null
          created_at: string
          error_message: string | null
          growth_goal_id: string | null
          id: string
          market_scan_id: string | null
          partial: boolean
          scan_completed_at: string | null
          scan_started_at: string | null
          serp_results_collected: number | null
          source: string | null
          status: string
          summary: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          clusters_scanned?: number | null
          confidence?: number | null
          created_at?: string
          error_message?: string | null
          growth_goal_id?: string | null
          id?: string
          market_scan_id?: string | null
          partial?: boolean
          scan_completed_at?: string | null
          scan_started_at?: string | null
          serp_results_collected?: number | null
          source?: string | null
          status?: string
          summary?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          clusters_scanned?: number | null
          confidence?: number | null
          created_at?: string
          error_message?: string | null
          growth_goal_id?: string | null
          id?: string
          market_scan_id?: string | null
          partial?: boolean
          scan_completed_at?: string | null
          scan_started_at?: string | null
          serp_results_collected?: number | null
          source?: string | null
          status?: string
          summary?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      competitor_serp_results: {
        Row: {
          cluster_key: string | null
          competitor_id: string | null
          competitor_scan_id: string
          created_at: string
          domain: string | null
          id: string
          is_local_pack: boolean
          keyword: string | null
          local_pack_name: string | null
          local_pack_rating: number | null
          local_pack_review_count: number | null
          location: string | null
          rank: number | null
          raw: Json
          snippet: string | null
          tenant_id: string
          title: string | null
          url: string | null
        }
        Insert: {
          cluster_key?: string | null
          competitor_id?: string | null
          competitor_scan_id: string
          created_at?: string
          domain?: string | null
          id?: string
          is_local_pack?: boolean
          keyword?: string | null
          local_pack_name?: string | null
          local_pack_rating?: number | null
          local_pack_review_count?: number | null
          location?: string | null
          rank?: number | null
          raw?: Json
          snippet?: string | null
          tenant_id: string
          title?: string | null
          url?: string | null
        }
        Update: {
          cluster_key?: string | null
          competitor_id?: string | null
          competitor_scan_id?: string
          created_at?: string
          domain?: string | null
          id?: string
          is_local_pack?: boolean
          keyword?: string | null
          local_pack_name?: string | null
          local_pack_rating?: number | null
          local_pack_review_count?: number | null
          location?: string | null
          rank?: number | null
          raw?: Json
          snippet?: string | null
          tenant_id?: string
          title?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_serp_results_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_serp_results_competitor_scan_id_fkey"
            columns: ["competitor_scan_id"]
            isOneToOne: false
            referencedRelation: "competitor_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      competitors: {
        Row: {
          clusters_appeared_in: Json
          competitor_scan_id: string
          competitor_score: number | null
          created_at: string
          data_completeness: number | null
          display_name: string | null
          domain: string
          error_message: string | null
          gbp_category: string | null
          gbp_name: string | null
          gbp_rating: number | null
          gbp_review_count: number | null
          id: string
          is_self: boolean
          location_pages_count: number | null
          location_pages_sample: Json
          raw_homepage: Json
          raw_map: Json
          score_breakdown: Json
          score_confidence: number | null
          serp_appearance_count: number
          service_pages_count: number | null
          service_pages_sample: Json
          tenant_id: string
          trust_signals: Json
          updated_at: string
        }
        Insert: {
          clusters_appeared_in?: Json
          competitor_scan_id: string
          competitor_score?: number | null
          created_at?: string
          data_completeness?: number | null
          display_name?: string | null
          domain: string
          error_message?: string | null
          gbp_category?: string | null
          gbp_name?: string | null
          gbp_rating?: number | null
          gbp_review_count?: number | null
          id?: string
          is_self?: boolean
          location_pages_count?: number | null
          location_pages_sample?: Json
          raw_homepage?: Json
          raw_map?: Json
          score_breakdown?: Json
          score_confidence?: number | null
          serp_appearance_count?: number
          service_pages_count?: number | null
          service_pages_sample?: Json
          tenant_id: string
          trust_signals?: Json
          updated_at?: string
        }
        Update: {
          clusters_appeared_in?: Json
          competitor_scan_id?: string
          competitor_score?: number | null
          created_at?: string
          data_completeness?: number | null
          display_name?: string | null
          domain?: string
          error_message?: string | null
          gbp_category?: string | null
          gbp_name?: string | null
          gbp_rating?: number | null
          gbp_review_count?: number | null
          id?: string
          is_self?: boolean
          location_pages_count?: number | null
          location_pages_sample?: Json
          raw_homepage?: Json
          raw_map?: Json
          score_breakdown?: Json
          score_confidence?: number | null
          serp_appearance_count?: number
          service_pages_count?: number | null
          service_pages_sample?: Json
          tenant_id?: string
          trust_signals?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitors_competitor_scan_id_fkey"
            columns: ["competitor_scan_id"]
            isOneToOne: false
            referencedRelation: "competitor_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      fix_proposal_groups: {
        Row: {
          audit_id: string
          audit_page_id: string | null
          created_at: string
          id: string
          page_id: string | null
          status: Database["public"]["Enums"]["proposal_status"]
          tenant_id: string
          theme: string
        }
        Insert: {
          audit_id: string
          audit_page_id?: string | null
          created_at?: string
          id?: string
          page_id?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          tenant_id: string
          theme: string
        }
        Update: {
          audit_id?: string
          audit_page_id?: string | null
          created_at?: string
          id?: string
          page_id?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          tenant_id?: string
          theme?: string
        }
        Relationships: []
      }
      fix_proposals: {
        Row: {
          after: Json
          audit_page_id: string | null
          before: Json
          confidence: number
          created_at: string
          decided_at: string | null
          decided_by: string | null
          group_id: string
          id: string
          issue_code: string
          page_id: string | null
          proposal_type: Database["public"]["Enums"]["proposal_type"]
          rationale: string
          status: Database["public"]["Enums"]["proposal_status"]
          tenant_id: string
        }
        Insert: {
          after?: Json
          audit_page_id?: string | null
          before?: Json
          confidence?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          group_id: string
          id?: string
          issue_code: string
          page_id?: string | null
          proposal_type: Database["public"]["Enums"]["proposal_type"]
          rationale?: string
          status?: Database["public"]["Enums"]["proposal_status"]
          tenant_id: string
        }
        Update: {
          after?: Json
          audit_page_id?: string | null
          before?: Json
          confidence?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          group_id?: string
          id?: string
          issue_code?: string
          page_id?: string | null
          proposal_type?: Database["public"]["Enums"]["proposal_type"]
          rationale?: string
          status?: Database["public"]["Enums"]["proposal_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fix_proposals_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "fix_proposal_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      gbp_profiles: {
        Row: {
          address: string | null
          business_name: string | null
          completeness_score: number | null
          created_at: string
          gaps: Json
          growth_goal_id: string | null
          id: string
          last_reviewed_at: string | null
          local_visibility_score: number | null
          nap_consistency: string | null
          notes: string | null
          phone: string | null
          photos_status: string | null
          posts_status: string | null
          primary_category: string | null
          profile_url: string | null
          rating: number | null
          recommendations: Json
          review_count: number | null
          review_velocity: Json
          secondary_categories: Json
          service_area: Json
          services: Json
          site_id: string | null
          source: string
          status: string
          tenant_id: string
          trust_score: number | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          address?: string | null
          business_name?: string | null
          completeness_score?: number | null
          created_at?: string
          gaps?: Json
          growth_goal_id?: string | null
          id?: string
          last_reviewed_at?: string | null
          local_visibility_score?: number | null
          nap_consistency?: string | null
          notes?: string | null
          phone?: string | null
          photos_status?: string | null
          posts_status?: string | null
          primary_category?: string | null
          profile_url?: string | null
          rating?: number | null
          recommendations?: Json
          review_count?: number | null
          review_velocity?: Json
          secondary_categories?: Json
          service_area?: Json
          services?: Json
          site_id?: string | null
          source?: string
          status?: string
          tenant_id: string
          trust_score?: number | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          address?: string | null
          business_name?: string | null
          completeness_score?: number | null
          created_at?: string
          gaps?: Json
          growth_goal_id?: string | null
          id?: string
          last_reviewed_at?: string | null
          local_visibility_score?: number | null
          nap_consistency?: string | null
          notes?: string | null
          phone?: string | null
          photos_status?: string | null
          posts_status?: string | null
          primary_category?: string | null
          profile_url?: string | null
          rating?: number | null
          recommendations?: Json
          review_count?: number | null
          review_velocity?: Json
          secondary_categories?: Json
          service_area?: Json
          services?: Json
          site_id?: string | null
          source?: string
          status?: string
          tenant_id?: string
          trust_score?: number | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      growth_goals: {
        Row: {
          bad_fit_leads: Json
          capacity_notes: string | null
          close_rate: number | null
          confidence: number | null
          created_at: string
          current_count: number | null
          good_fit_leads: Json
          id: string
          lead_value: number | null
          locations: Json
          required_leads: number | null
          service_focus: Json
          source: string
          status: string
          target_count: number | null
          target_type: string
          tenant_id: string
          timeframe_months: number | null
          title: string | null
          tracking_notes: string | null
          updated_at: string
        }
        Insert: {
          bad_fit_leads?: Json
          capacity_notes?: string | null
          close_rate?: number | null
          confidence?: number | null
          created_at?: string
          current_count?: number | null
          good_fit_leads?: Json
          id?: string
          lead_value?: number | null
          locations?: Json
          required_leads?: number | null
          service_focus?: Json
          source?: string
          status?: string
          target_count?: number | null
          target_type?: string
          tenant_id: string
          timeframe_months?: number | null
          title?: string | null
          tracking_notes?: string | null
          updated_at?: string
        }
        Update: {
          bad_fit_leads?: Json
          capacity_notes?: string | null
          close_rate?: number | null
          confidence?: number | null
          created_at?: string
          current_count?: number | null
          good_fit_leads?: Json
          id?: string
          lead_value?: number | null
          locations?: Json
          required_leads?: number | null
          service_focus?: Json
          source?: string
          status?: string
          target_count?: number | null
          target_type?: string
          tenant_id?: string
          timeframe_months?: number | null
          title?: string | null
          tracking_notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_goals_tenant_id_fkey"
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
      intelligence_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          current_stage: string | null
          error_message: string | null
          failed_at: string | null
          growth_goal_id: string | null
          id: string
          input_hash: Json
          output_refs: Json
          site_id: string | null
          stages: Json
          started_at: string | null
          status: string
          tenant_id: string
          trigger_reason: string | null
          triggered_by: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_stage?: string | null
          error_message?: string | null
          failed_at?: string | null
          growth_goal_id?: string | null
          id?: string
          input_hash?: Json
          output_refs?: Json
          site_id?: string | null
          stages?: Json
          started_at?: string | null
          status?: string
          tenant_id: string
          trigger_reason?: string | null
          triggered_by?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_stage?: string | null
          error_message?: string | null
          failed_at?: string | null
          growth_goal_id?: string | null
          id?: string
          input_hash?: Json
          output_refs?: Json
          site_id?: string | null
          stages?: Json
          started_at?: string | null
          status?: string
          tenant_id?: string
          trigger_reason?: string | null
          triggered_by?: string
          updated_at?: string
        }
        Relationships: []
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
      market_demand_clusters: {
        Row: {
          average_competition: number | null
          average_difficulty: number | null
          cluster_name: string
          created_at: string
          id: string
          intent: string | null
          keyword_count: number | null
          location: string | null
          market_scan_id: string
          opportunity_score: number | null
          priority: string | null
          reasoning: Json
          representative_keywords: Json
          service: string | null
          tenant_id: string
          total_volume: number | null
        }
        Insert: {
          average_competition?: number | null
          average_difficulty?: number | null
          cluster_name: string
          created_at?: string
          id?: string
          intent?: string | null
          keyword_count?: number | null
          location?: string | null
          market_scan_id: string
          opportunity_score?: number | null
          priority?: string | null
          reasoning?: Json
          representative_keywords?: Json
          service?: string | null
          tenant_id: string
          total_volume?: number | null
        }
        Update: {
          average_competition?: number | null
          average_difficulty?: number | null
          cluster_name?: string
          created_at?: string
          id?: string
          intent?: string | null
          keyword_count?: number | null
          location?: string | null
          market_scan_id?: string
          opportunity_score?: number | null
          priority?: string | null
          reasoning?: Json
          representative_keywords?: Json
          service?: string | null
          tenant_id?: string
          total_volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_demand_clusters_market_scan_id_fkey"
            columns: ["market_scan_id"]
            isOneToOne: false
            referencedRelation: "market_scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_demand_clusters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      market_keywords: {
        Row: {
          competition: number | null
          confidence: number | null
          cpc: number | null
          created_at: string
          difficulty: number | null
          id: string
          intent: string | null
          keyword: string
          location: string | null
          market_scan_id: string
          normalized_keyword: string | null
          raw: Json
          service: string | null
          source: string
          tenant_id: string
          volume: number | null
        }
        Insert: {
          competition?: number | null
          confidence?: number | null
          cpc?: number | null
          created_at?: string
          difficulty?: number | null
          id?: string
          intent?: string | null
          keyword: string
          location?: string | null
          market_scan_id: string
          normalized_keyword?: string | null
          raw?: Json
          service?: string | null
          source?: string
          tenant_id: string
          volume?: number | null
        }
        Update: {
          competition?: number | null
          confidence?: number | null
          cpc?: number | null
          created_at?: string
          difficulty?: number | null
          id?: string
          intent?: string | null
          keyword?: string
          location?: string | null
          market_scan_id?: string
          normalized_keyword?: string | null
          raw?: Json
          service?: string | null
          source?: string
          tenant_id?: string
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_keywords_market_scan_id_fkey"
            columns: ["market_scan_id"]
            isOneToOne: false
            referencedRelation: "market_scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_keywords_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      market_scans: {
        Row: {
          confidence: number | null
          country: string | null
          created_at: string
          error_message: string | null
          growth_goal_id: string | null
          id: string
          language: string | null
          locations: Json
          region: string | null
          scan_completed_at: string | null
          scan_started_at: string | null
          services: Json
          site_id: string | null
          source: string
          status: string
          summary: Json
          tenant_id: string
          updated_at: string
          vertical: string | null
        }
        Insert: {
          confidence?: number | null
          country?: string | null
          created_at?: string
          error_message?: string | null
          growth_goal_id?: string | null
          id?: string
          language?: string | null
          locations?: Json
          region?: string | null
          scan_completed_at?: string | null
          scan_started_at?: string | null
          services?: Json
          site_id?: string | null
          source?: string
          status?: string
          summary?: Json
          tenant_id: string
          updated_at?: string
          vertical?: string | null
        }
        Update: {
          confidence?: number | null
          country?: string | null
          created_at?: string
          error_message?: string | null
          growth_goal_id?: string | null
          id?: string
          language?: string | null
          locations?: Json
          region?: string | null
          scan_completed_at?: string | null
          scan_started_at?: string | null
          services?: Json
          site_id?: string | null
          source?: string
          status?: string
          summary?: Json
          tenant_id?: string
          updated_at?: string
          vertical?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_scans_growth_goal_id_fkey"
            columns: ["growth_goal_id"]
            isOneToOne: false
            referencedRelation: "growth_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_scans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      master_plans: {
        Row: {
          confidence: number | null
          created_at: string
          generated_from: Json
          growth_goal_id: string | null
          id: string
          lead_math: Json
          main_constraints: Json
          missing_context: Json
          status: string
          strategy_summary: string | null
          summary: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          generated_from?: Json
          growth_goal_id?: string | null
          id?: string
          lead_math?: Json
          main_constraints?: Json
          missing_context?: Json
          status?: string
          strategy_summary?: string | null
          summary?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          generated_from?: Json
          growth_goal_id?: string | null
          id?: string
          lead_math?: Json
          main_constraints?: Json
          missing_context?: Json
          status?: string
          strategy_summary?: string | null
          summary?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      masterplan_items: {
        Row: {
          created_at: string
          description: string | null
          effort: string | null
          expected_impact: string | null
          id: string
          linked_audit_id: string | null
          linked_goal_id: string | null
          linked_issue_id: string | null
          linked_page_id: string | null
          master_plan_id: string
          metadata: Json
          priority: string
          reason: string | null
          source: string | null
          status: string
          tenant_id: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          effort?: string | null
          expected_impact?: string | null
          id?: string
          linked_audit_id?: string | null
          linked_goal_id?: string | null
          linked_issue_id?: string | null
          linked_page_id?: string | null
          master_plan_id: string
          metadata?: Json
          priority?: string
          reason?: string | null
          source?: string | null
          status?: string
          tenant_id: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          effort?: string | null
          expected_impact?: string | null
          id?: string
          linked_audit_id?: string | null
          linked_goal_id?: string | null
          linked_issue_id?: string | null
          linked_page_id?: string | null
          master_plan_id?: string
          metadata?: Json
          priority?: string
          reason?: string | null
          source?: string | null
          status?: string
          tenant_id?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "masterplan_items_master_plan_id_fkey"
            columns: ["master_plan_id"]
            isOneToOne: false
            referencedRelation: "master_plans"
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
      page_intelligence: {
        Row: {
          analyzed_at: string
          audit_id: string | null
          audit_page_id: string | null
          commercial_priority: string
          confidence: number
          content_summary: string | null
          created_at: string
          desired_action: string | null
          funnel_stage: string | null
          id: string
          intent: string
          local_relevance: Json
          missing_page_context: Json
          model_used: string | null
          page_id: string | null
          page_type: string
          page_url: string | null
          primary_topic: string | null
          recommended_cta: string | null
          relevant_strategy_angle: string | null
          risk_flags: Json
          seo_role: string | null
          source_evidence: Json
          summary: string | null
          target_audience: string | null
          target_keyword: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          analyzed_at?: string
          audit_id?: string | null
          audit_page_id?: string | null
          commercial_priority?: string
          confidence?: number
          content_summary?: string | null
          created_at?: string
          desired_action?: string | null
          funnel_stage?: string | null
          id?: string
          intent?: string
          local_relevance?: Json
          missing_page_context?: Json
          model_used?: string | null
          page_id?: string | null
          page_type?: string
          page_url?: string | null
          primary_topic?: string | null
          recommended_cta?: string | null
          relevant_strategy_angle?: string | null
          risk_flags?: Json
          seo_role?: string | null
          source_evidence?: Json
          summary?: string | null
          target_audience?: string | null
          target_keyword?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          analyzed_at?: string
          audit_id?: string | null
          audit_page_id?: string | null
          commercial_priority?: string
          confidence?: number
          content_summary?: string | null
          created_at?: string
          desired_action?: string | null
          funnel_stage?: string | null
          id?: string
          intent?: string
          local_relevance?: Json
          missing_page_context?: Json
          model_used?: string | null
          page_id?: string | null
          page_type?: string
          page_url?: string | null
          primary_topic?: string | null
          recommended_cta?: string | null
          relevant_strategy_angle?: string | null
          risk_flags?: Json
          seo_role?: string | null
          source_evidence?: Json
          summary?: string | null
          target_audience?: string | null
          target_keyword?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_intelligence_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
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
          h1: string | null
          health_score: number | null
          id: string
          images_without_alt: number | null
          last_audited_at: string | null
          meta_description: string | null
          site_connection_id: string | null
          status_code: number | null
          template: string | null
          tenant_id: string
          title: string | null
          url: string
          wp_post_id: number | null
        }
        Insert: {
          created_at?: string
          h1?: string | null
          health_score?: number | null
          id?: string
          images_without_alt?: number | null
          last_audited_at?: string | null
          meta_description?: string | null
          site_connection_id?: string | null
          status_code?: number | null
          template?: string | null
          tenant_id: string
          title?: string | null
          url: string
          wp_post_id?: number | null
        }
        Update: {
          created_at?: string
          h1?: string | null
          health_score?: number | null
          id?: string
          images_without_alt?: number | null
          last_audited_at?: string | null
          meta_description?: string | null
          site_connection_id?: string | null
          status_code?: number | null
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
      proposal_comparisons: {
        Row: {
          action_type: string | null
          audit_id: string
          created_at: string
          id: string
          issue_id: string
          notes: string | null
          page_id: string
          proposal_v1_id: string | null
          proposal_v2_id: string | null
          reason: string | null
          reason_tags: Json
          reviewed_at: string | null
          reviewed_by: string | null
          score_mismatch: boolean
          tenant_id: string
          updated_at: string
          v2_run_id: string | null
          winner: string
        }
        Insert: {
          action_type?: string | null
          audit_id: string
          created_at?: string
          id?: string
          issue_id: string
          notes?: string | null
          page_id: string
          proposal_v1_id?: string | null
          proposal_v2_id?: string | null
          reason?: string | null
          reason_tags?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          score_mismatch?: boolean
          tenant_id: string
          updated_at?: string
          v2_run_id?: string | null
          winner?: string
        }
        Update: {
          action_type?: string | null
          audit_id?: string
          created_at?: string
          id?: string
          issue_id?: string
          notes?: string | null
          page_id?: string
          proposal_v1_id?: string | null
          proposal_v2_id?: string | null
          reason?: string | null
          reason_tags?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          score_mismatch?: boolean
          tenant_id?: string
          updated_at?: string
          v2_run_id?: string | null
          winner?: string
        }
        Relationships: []
      }
      proposal_quality_checks: {
        Row: {
          brand_fit_score: number | null
          clarity_score: number | null
          commercial_fit_score: number | null
          created_at: string
          id: string
          proposal_id: string
          publishable: boolean
          quality_score: number | null
          risk_flags: Json
          seo_fit_score: number | null
          tenant_id: string
          verdict: Database["public"]["Enums"]["quality_verdict"]
        }
        Insert: {
          brand_fit_score?: number | null
          clarity_score?: number | null
          commercial_fit_score?: number | null
          created_at?: string
          id?: string
          proposal_id: string
          publishable?: boolean
          quality_score?: number | null
          risk_flags?: Json
          seo_fit_score?: number | null
          tenant_id: string
          verdict?: Database["public"]["Enums"]["quality_verdict"]
        }
        Update: {
          brand_fit_score?: number | null
          clarity_score?: number | null
          commercial_fit_score?: number | null
          created_at?: string
          id?: string
          proposal_id?: string
          publishable?: boolean
          quality_score?: number | null
          risk_flags?: Json
          seo_fit_score?: number | null
          tenant_id?: string
          verdict?: Database["public"]["Enums"]["quality_verdict"]
        }
        Relationships: []
      }
      proposal_v2: {
        Row: {
          action_type: string
          after: Json
          approval_notes: string | null
          approved_at: string | null
          approved_by: string | null
          audit_id: string | null
          before: Json
          block_reason: string | null
          context_snapshot: Json
          context_used: Json
          created_at: string
          growth_goal_id: string | null
          id: string
          issue_id: string | null
          keywords_used: Json
          masterplan_item_id: string | null
          model_used: string | null
          origin: string
          page_id: string | null
          proposal_run_id: string | null
          publishable: boolean
          reasoning: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          risk_flags: Json
          scores: Json
          status: string
          summary: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          action_type: string
          after?: Json
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          audit_id?: string | null
          before?: Json
          block_reason?: string | null
          context_snapshot?: Json
          context_used?: Json
          created_at?: string
          growth_goal_id?: string | null
          id?: string
          issue_id?: string | null
          keywords_used?: Json
          masterplan_item_id?: string | null
          model_used?: string | null
          origin?: string
          page_id?: string | null
          proposal_run_id?: string | null
          publishable?: boolean
          reasoning?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          risk_flags?: Json
          scores?: Json
          status?: string
          summary?: string
          tenant_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          after?: Json
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          audit_id?: string | null
          before?: Json
          block_reason?: string | null
          context_snapshot?: Json
          context_used?: Json
          created_at?: string
          growth_goal_id?: string | null
          id?: string
          issue_id?: string | null
          keywords_used?: Json
          masterplan_item_id?: string | null
          model_used?: string | null
          origin?: string
          page_id?: string | null
          proposal_run_id?: string | null
          publishable?: boolean
          reasoning?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          risk_flags?: Json
          scores?: Json
          status?: string
          summary?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_v2_growth_goal_id_fkey"
            columns: ["growth_goal_id"]
            isOneToOne: false
            referencedRelation: "growth_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_v2_masterplan_item_id_fkey"
            columns: ["masterplan_item_id"]
            isOneToOne: false
            referencedRelation: "masterplan_items"
            referencedColumns: ["id"]
          },
        ]
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
          username: string | null
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
          username?: string | null
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
          username?: string | null
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
      subscription_plans: {
        Row: {
          created_at: string
          display_name: string
          features: Json
          max_pages: number
          max_sites: number
          monthly_ai_credits: number
          monthly_leads: number
          price_eur_monthly: number
          tier: Database["public"]["Enums"]["plan_tier"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          features?: Json
          max_pages: number
          max_sites: number
          monthly_ai_credits: number
          monthly_leads: number
          price_eur_monthly?: number
          tier: Database["public"]["Enums"]["plan_tier"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          features?: Json
          max_pages?: number
          max_sites?: number
          monthly_ai_credits?: number
          monthly_leads?: number
          price_eur_monthly?: number
          tier?: Database["public"]["Enums"]["plan_tier"]
          updated_at?: string
        }
        Relationships: []
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
          plan: Database["public"]["Enums"]["plan_tier"]
          status: string
          updated_at: string
          vertical: Database["public"]["Enums"]["vertical_code"]
        }
        Insert: {
          created_at?: string
          geo: Database["public"]["Enums"]["geo_code"]
          id?: string
          name: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          status?: string
          updated_at?: string
          vertical: Database["public"]["Enums"]["vertical_code"]
        }
        Update: {
          created_at?: string
          geo?: Database["public"]["Enums"]["geo_code"]
          id?: string
          name?: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          status?: string
          updated_at?: string
          vertical?: Database["public"]["Enums"]["vertical_code"]
        }
        Relationships: []
      }
      tone_feedback_examples: {
        Row: {
          after_text: string | null
          before_text: string | null
          created_at: string
          example_type: Database["public"]["Enums"]["tone_feedback_type"]
          id: string
          proposal_id: string | null
          reason: string | null
          tenant_id: string
          tone_profile_id: string | null
        }
        Insert: {
          after_text?: string | null
          before_text?: string | null
          created_at?: string
          example_type: Database["public"]["Enums"]["tone_feedback_type"]
          id?: string
          proposal_id?: string | null
          reason?: string | null
          tenant_id: string
          tone_profile_id?: string | null
        }
        Update: {
          after_text?: string | null
          before_text?: string | null
          created_at?: string
          example_type?: Database["public"]["Enums"]["tone_feedback_type"]
          id?: string
          proposal_id?: string | null
          reason?: string | null
          tenant_id?: string
          tone_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tone_feedback_examples_tone_profile_id_fkey"
            columns: ["tone_profile_id"]
            isOneToOne: false
            referencedRelation: "tone_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tone_profile_samples: {
        Row: {
          analysis: Json
          created_at: string
          id: string
          quality_score: number | null
          source_type: Database["public"]["Enums"]["tone_sample_source"]
          source_url: string | null
          tenant_id: string
          text: string
          tone_profile_id: string
          weight: number
        }
        Insert: {
          analysis?: Json
          created_at?: string
          id?: string
          quality_score?: number | null
          source_type: Database["public"]["Enums"]["tone_sample_source"]
          source_url?: string | null
          tenant_id: string
          text: string
          tone_profile_id: string
          weight?: number
        }
        Update: {
          analysis?: Json
          created_at?: string
          id?: string
          quality_score?: number | null
          source_type?: Database["public"]["Enums"]["tone_sample_source"]
          source_url?: string | null
          tenant_id?: string
          text?: string
          tone_profile_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "tone_profile_samples_tone_profile_id_fkey"
            columns: ["tone_profile_id"]
            isOneToOne: false
            referencedRelation: "tone_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tone_profiles: {
        Row: {
          analyzed_at: string | null
          confidence_score: number | null
          created_at: string
          id: string
          job_error: string | null
          job_status: Database["public"]["Enums"]["tone_job_status"]
          language: string
          locale: string
          locked_fields: Json
          profile: Json
          source_summary: Json
          status: Database["public"]["Enums"]["tone_profile_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          analyzed_at?: string | null
          confidence_score?: number | null
          created_at?: string
          id?: string
          job_error?: string | null
          job_status?: Database["public"]["Enums"]["tone_job_status"]
          language?: string
          locale?: string
          locked_fields?: Json
          profile?: Json
          source_summary?: Json
          status?: Database["public"]["Enums"]["tone_profile_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          analyzed_at?: string | null
          confidence_score?: number | null
          created_at?: string
          id?: string
          job_error?: string | null
          job_status?: Database["public"]["Enums"]["tone_job_status"]
          language?: string
          locale?: string
          locked_fields?: Json
          profile?: Json
          source_summary?: Json
          status?: Database["public"]["Enums"]["tone_profile_status"]
          tenant_id?: string
          updated_at?: string
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
      audit_status: "queued" | "running" | "succeeded" | "failed"
      brand_voice_job_status: "queued" | "running" | "done" | "failed"
      change_status:
        | "proposed"
        | "approved"
        | "published"
        | "rejected"
        | "rolled_back"
      commercial_priority: "low" | "medium" | "high"
      connection_status: "pending" | "connected" | "error" | "revoked"
      connection_type: "wordpress" | "gbp" | "gsc" | "ga4" | "wordpress_com"
      geo_code: "NL" | "US"
      issue_severity: "low" | "medium" | "high" | "critical"
      lead_status: "new" | "qualified" | "junk" | "won" | "lost"
      onboarding_status:
        | "started"
        | "wp_probe_failed"
        | "wp_probe_ok"
        | "tenant_created"
        | "expired"
      page_intent:
        | "informational"
        | "commercial"
        | "local"
        | "trust"
        | "conversion"
        | "navigational"
      page_type:
        | "homepage"
        | "service"
        | "blog"
        | "location"
        | "contact"
        | "landing"
        | "category"
        | "about"
        | "other"
      plan_tier: "free" | "starter" | "pro" | "enterprise"
      proposal_status:
        | "draft"
        | "approved"
        | "rejected"
        | "partial"
        | "needs_context"
      proposal_type:
        | "meta_description"
        | "alt_text"
        | "schema"
        | "title"
        | "h1"
        | "other"
      quality_verdict: "publishable" | "needs_review" | "rejected"
      tone_feedback_type:
        | "approved"
        | "rejected"
        | "edited"
        | "manual_good"
        | "manual_bad"
      tone_job_status: "queued" | "running" | "done" | "failed"
      tone_profile_status: "draft" | "approved" | "locked"
      tone_sample_source:
        | "homepage"
        | "service"
        | "blog"
        | "about"
        | "contact"
        | "manual_paste"
        | "approved_proposal"
        | "other"
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
      audit_status: ["queued", "running", "succeeded", "failed"],
      brand_voice_job_status: ["queued", "running", "done", "failed"],
      change_status: [
        "proposed",
        "approved",
        "published",
        "rejected",
        "rolled_back",
      ],
      commercial_priority: ["low", "medium", "high"],
      connection_status: ["pending", "connected", "error", "revoked"],
      connection_type: ["wordpress", "gbp", "gsc", "ga4", "wordpress_com"],
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
      page_intent: [
        "informational",
        "commercial",
        "local",
        "trust",
        "conversion",
        "navigational",
      ],
      page_type: [
        "homepage",
        "service",
        "blog",
        "location",
        "contact",
        "landing",
        "category",
        "about",
        "other",
      ],
      plan_tier: ["free", "starter", "pro", "enterprise"],
      proposal_status: [
        "draft",
        "approved",
        "rejected",
        "partial",
        "needs_context",
      ],
      proposal_type: [
        "meta_description",
        "alt_text",
        "schema",
        "title",
        "h1",
        "other",
      ],
      quality_verdict: ["publishable", "needs_review", "rejected"],
      tone_feedback_type: [
        "approved",
        "rejected",
        "edited",
        "manual_good",
        "manual_bad",
      ],
      tone_job_status: ["queued", "running", "done", "failed"],
      tone_profile_status: ["draft", "approved", "locked"],
      tone_sample_source: [
        "homepage",
        "service",
        "blog",
        "about",
        "contact",
        "manual_paste",
        "approved_proposal",
        "other",
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
