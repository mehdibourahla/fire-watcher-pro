export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      admin_units: {
        Row: {
          code: string;
          created_at: string;
          forest_fraction: number;
          geom: Json | null;
          id: string;
          landcover: Json | null;
          lat: number;
          level: string;
          lon: number;
          name_ar: string;
          name_en: string;
          name_fr: string;
          name_kab: string | null;
          parent_id: string | null;
          population: number | null;
          terrain: Json | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          forest_fraction?: number;
          geom?: Json | null;
          id?: string;
          landcover?: Json | null;
          lat: number;
          level: string;
          lon: number;
          name_ar: string;
          name_en: string;
          name_fr: string;
          name_kab?: string | null;
          parent_id?: string | null;
          population?: number | null;
          terrain?: Json | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          forest_fraction?: number;
          geom?: Json | null;
          id?: string;
          landcover?: Json | null;
          lat?: number;
          level?: string;
          lon?: number;
          name_ar?: string;
          name_en?: string;
          name_fr?: string;
          name_kab?: string | null;
          parent_id?: string | null;
          population?: number | null;
          terrain?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "admin_units_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "admin_units";
            referencedColumns: ["id"];
          },
        ];
      };
      alerts: {
        Row: {
          body: string;
          cap_alert_id: string | null;
          cluster_id: string | null;
          commune_id: string | null;
          created_at: string;
          dedupe_key: string;
          delivered_email: boolean;
          delivered_webhook: boolean;
          distance_km: number | null;
          id: string;
          kind: string;
          payload: Json | null;
          read_at: string | null;
          severity: number;
          title: string;
          user_id: string;
          zone_id: string | null;
        };
        Insert: {
          body: string;
          cap_alert_id?: string | null;
          cluster_id?: string | null;
          commune_id?: string | null;
          created_at?: string;
          dedupe_key: string;
          delivered_email?: boolean;
          delivered_webhook?: boolean;
          distance_km?: number | null;
          id?: string;
          kind: string;
          payload?: Json | null;
          read_at?: string | null;
          severity?: number;
          title: string;
          user_id: string;
          zone_id?: string | null;
        };
        Update: {
          body?: string;
          cap_alert_id?: string | null;
          cluster_id?: string | null;
          commune_id?: string | null;
          created_at?: string;
          dedupe_key?: string;
          delivered_email?: boolean;
          delivered_webhook?: boolean;
          distance_km?: number | null;
          id?: string;
          kind?: string;
          payload?: Json | null;
          read_at?: string | null;
          severity?: number;
          title?: string;
          user_id?: string;
          zone_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "alerts_cap_alert_id_fkey";
            columns: ["cap_alert_id"];
            isOneToOne: false;
            referencedRelation: "cap_alerts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "alerts_cluster_id_fkey";
            columns: ["cluster_id"];
            isOneToOne: false;
            referencedRelation: "fire_clusters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "alerts_commune_id_fkey";
            columns: ["commune_id"];
            isOneToOne: false;
            referencedRelation: "admin_units";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "alerts_zone_id_fkey";
            columns: ["zone_id"];
            isOneToOne: false;
            referencedRelation: "zones";
            referencedColumns: ["id"];
          },
        ];
      };
      authority_warnings: {
        Row: {
          body: string;
          commune_codes: string[] | null;
          created_at: string;
          created_by: string | null;
          id: string;
          received_via: string;
          severity: string;
          source: string;
          wilaya_id: string | null;
        };
        Insert: {
          body: string;
          commune_codes?: string[] | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          received_via: string;
          severity: string;
          source: string;
          wilaya_id?: string | null;
        };
        Update: {
          body?: string;
          commune_codes?: string[] | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          received_via?: string;
          severity?: string;
          source?: string;
          wilaya_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "authority_warnings_wilaya_id_fkey";
            columns: ["wilaya_id"];
            isOneToOne: false;
            referencedRelation: "admin_units";
            referencedColumns: ["id"];
          },
        ];
      };
      broadcast_audit: {
        Row: {
          action: string;
          actor_id: string | null;
          at: string;
          cluster_id: string | null;
          commune_codes: string[] | null;
          id: string;
          kind: string | null;
          onm_vigilance_id: string | null;
          payload: Json | null;
          phase: string | null;
          reason: string;
          severity: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          at?: string;
          cluster_id?: string | null;
          commune_codes?: string[] | null;
          id?: string;
          kind?: string | null;
          onm_vigilance_id?: string | null;
          payload?: Json | null;
          phase?: string | null;
          reason: string;
          severity?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          at?: string;
          cluster_id?: string | null;
          commune_codes?: string[] | null;
          id?: string;
          kind?: string | null;
          onm_vigilance_id?: string | null;
          payload?: Json | null;
          phase?: string | null;
          reason?: string;
          severity?: string | null;
        };
        Relationships: [];
      };
      broadcast_settings: {
        Row: {
          enabled: boolean;
          id: boolean;
          updated_at: string;
        };
        Insert: {
          enabled?: boolean;
          id?: boolean;
          updated_at?: string;
        };
        Update: {
          enabled?: boolean;
          id?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      broadcasts: {
        Row: {
          authority_warning_id: string | null;
          cap_alert_id: string | null;
          cluster_id: string | null;
          commune_codes: string[];
          created_at: string;
          fcm_delivered_at: string | null;
          fcm_topics: number | null;
          id: string;
          kind: string;
          onm_vigilance_id: string | null;
          phase: string;
          severity: string;
          telegram_channels: number | null;
          telegram_delivered_at: string | null;
        };
        Insert: {
          authority_warning_id?: string | null;
          cap_alert_id?: string | null;
          cluster_id?: string | null;
          commune_codes: string[];
          created_at?: string;
          fcm_delivered_at?: string | null;
          fcm_topics?: number | null;
          id?: string;
          kind: string;
          onm_vigilance_id?: string | null;
          phase?: string;
          severity: string;
          telegram_channels?: number | null;
          telegram_delivered_at?: string | null;
        };
        Update: {
          authority_warning_id?: string | null;
          cap_alert_id?: string | null;
          cluster_id?: string | null;
          commune_codes?: string[];
          created_at?: string;
          fcm_delivered_at?: string | null;
          fcm_topics?: number | null;
          id?: string;
          kind?: string;
          onm_vigilance_id?: string | null;
          phase?: string;
          severity?: string;
          telegram_channels?: number | null;
          telegram_delivered_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "broadcasts_authority_warning_id_fkey";
            columns: ["authority_warning_id"];
            isOneToOne: false;
            referencedRelation: "authority_warnings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "broadcasts_cap_alert_id_fkey";
            columns: ["cap_alert_id"];
            isOneToOne: false;
            referencedRelation: "cap_alerts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "broadcasts_cluster_id_fkey";
            columns: ["cluster_id"];
            isOneToOne: false;
            referencedRelation: "fire_clusters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "broadcasts_onm_vigilance_id_fkey";
            columns: ["onm_vigilance_id"];
            isOneToOne: false;
            referencedRelation: "onm_vigilance";
            referencedColumns: ["id"];
          },
        ];
      };
      cap_alerts: {
        Row: {
          cap_references: string | null;
          cluster_id: string | null;
          created_at: string;
          id: string;
          identifier: string;
          info: Json;
          msg_type: string;
          scope: string;
          sender: string;
          sent: string;
          status: string;
        };
        Insert: {
          cap_references?: string | null;
          cluster_id?: string | null;
          created_at?: string;
          id?: string;
          identifier: string;
          info: Json;
          msg_type: string;
          scope: string;
          sender: string;
          sent: string;
          status: string;
        };
        Update: {
          cap_references?: string | null;
          cluster_id?: string | null;
          created_at?: string;
          id?: string;
          identifier?: string;
          info?: Json;
          msg_type?: string;
          scope?: string;
          sender?: string;
          sent?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cap_alerts_cluster_id_fkey";
            columns: ["cluster_id"];
            isOneToOne: false;
            referencedRelation: "fire_clusters";
            referencedColumns: ["id"];
          },
        ];
      };
      citizen_reports: {
        Row: {
          cluster_id: string | null;
          commune_id: string | null;
          created_at: string;
          id: string;
          kind: string;
          lat: number;
          lon: number;
          moderation_note: string | null;
          note: string | null;
          observed_at: string;
          photo_url: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          sighting: string;
          size_hint: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          cluster_id?: string | null;
          commune_id?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          lat: number;
          lon: number;
          moderation_note?: string | null;
          note?: string | null;
          observed_at?: string;
          photo_url?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          sighting?: string;
          size_hint?: string;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          cluster_id?: string | null;
          commune_id?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          lat?: number;
          lon?: number;
          moderation_note?: string | null;
          note?: string | null;
          observed_at?: string;
          photo_url?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          sighting?: string;
          size_hint?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "citizen_reports_cluster_id_fkey";
            columns: ["cluster_id"];
            isOneToOne: false;
            referencedRelation: "fire_clusters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "citizen_reports_commune_id_fkey";
            columns: ["commune_id"];
            isOneToOne: false;
            referencedRelation: "admin_units";
            referencedColumns: ["id"];
          },
        ];
      };
      cluster_events: {
        Row: {
          at: string;
          cluster_id: string;
          event: string;
          id: string;
          payload: Json | null;
        };
        Insert: {
          at?: string;
          cluster_id: string;
          event: string;
          id?: string;
          payload?: Json | null;
        };
        Update: {
          at?: string;
          cluster_id?: string;
          event?: string;
          id?: string;
          payload?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "cluster_events_cluster_id_fkey";
            columns: ["cluster_id"];
            isOneToOne: false;
            referencedRelation: "fire_clusters";
            referencedColumns: ["id"];
          },
        ];
      };
      contribution_idea_votes: {
        Row: {
          created_at: string;
          idea_id: string;
          value: number;
          voter_key: string;
        };
        Insert: {
          created_at?: string;
          idea_id: string;
          value: number;
          voter_key: string;
        };
        Update: {
          created_at?: string;
          idea_id?: string;
          value?: number;
          voter_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contribution_idea_votes_idea_id_fkey";
            columns: ["idea_id"];
            isOneToOne: false;
            referencedRelation: "contribution_ideas";
            referencedColumns: ["id"];
          },
        ];
      };
      contribution_ideas: {
        Row: {
          contact: string | null;
          created_at: string;
          id: string;
          lane: string;
          locale: string;
          message: string;
          moderated_by: string | null;
          moderation_note: string | null;
          published_at: string | null;
          score: number;
          status: string;
        };
        Insert: {
          contact?: string | null;
          created_at?: string;
          id?: string;
          lane?: string;
          locale?: string;
          message: string;
          moderated_by?: string | null;
          moderation_note?: string | null;
          published_at?: string | null;
          score?: number;
          status?: string;
        };
        Update: {
          contact?: string | null;
          created_at?: string;
          id?: string;
          lane?: string;
          locale?: string;
          message?: string;
          moderated_by?: string | null;
          moderation_note?: string | null;
          published_at?: string | null;
          score?: number;
          status?: string;
        };
        Relationships: [];
      };
      data_sources: {
        Row: {
          id: string;
          label: string;
          last_ok_at: string | null;
          name: string;
          note: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          label: string;
          last_ok_at?: string | null;
          name: string;
          note?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          label?: string;
          last_ok_at?: string | null;
          name?: string;
          note?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      detections: {
        Row: {
          cluster_id: string | null;
          confidence_raw: number;
          created_at: string;
          daynight: string | null;
          detected_at: string;
          fp_reason: string | null;
          frp_mw: number | null;
          id: string;
          lat: number;
          lon: number;
          natural_key: string;
          raw: Json | null;
          sensor: string;
          source: string;
        };
        Insert: {
          cluster_id?: string | null;
          confidence_raw: number;
          created_at?: string;
          daynight?: string | null;
          detected_at: string;
          fp_reason?: string | null;
          frp_mw?: number | null;
          id?: string;
          lat: number;
          lon: number;
          natural_key: string;
          raw?: Json | null;
          sensor: string;
          source: string;
        };
        Update: {
          cluster_id?: string | null;
          confidence_raw?: number;
          created_at?: string;
          daynight?: string | null;
          detected_at?: string;
          fp_reason?: string | null;
          frp_mw?: number | null;
          id?: string;
          lat?: number;
          lon?: number;
          natural_key?: string;
          raw?: Json | null;
          sensor?: string;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "detections_cluster_id_fkey";
            columns: ["cluster_id"];
            isOneToOne: false;
            referencedRelation: "fire_clusters";
            referencedColumns: ["id"];
          },
        ];
      };
      effis_danger: {
        Row: {
          commune_id: string;
          created_at: string;
          danger_class: string;
          date: string;
          id: string;
        };
        Insert: {
          commune_id: string;
          created_at?: string;
          danger_class: string;
          date: string;
          id?: string;
        };
        Update: {
          commune_id?: string;
          created_at?: string;
          danger_class?: string;
          date?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "effis_danger_commune_id_fkey";
            columns: ["commune_id"];
            isOneToOne: false;
            referencedRelation: "admin_units";
            referencedColumns: ["id"];
          },
        ];
      };
      fire_clusters: {
        Row: {
          commune_id: string | null;
          confidence: number;
          created_at: string;
          detection_count: number;
          est_area_ha: number | null;
          first_detected_at: string;
          hull: Json | null;
          id: string;
          last_detected_at: string;
          lat: number;
          lon: number;
          max_frp_mw: number | null;
          nearest_settlement_id: string | null;
          nearest_settlement_km: number | null;
          resolution_note: string | null;
          resolution_reason: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          short_id: string;
          sources: string[];
          spread_bearing_deg: number | null;
          state: string;
          suspected_persistent_source: boolean;
          updated_at: string;
          wilaya_id: string | null;
          wind_dir_deg: number | null;
          wind_speed_kmh: number | null;
        };
        Insert: {
          commune_id?: string | null;
          confidence?: number;
          created_at?: string;
          detection_count?: number;
          est_area_ha?: number | null;
          first_detected_at: string;
          hull?: Json | null;
          id?: string;
          last_detected_at: string;
          lat: number;
          lon: number;
          max_frp_mw?: number | null;
          nearest_settlement_id?: string | null;
          nearest_settlement_km?: number | null;
          resolution_note?: string | null;
          resolution_reason?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          short_id: string;
          sources?: string[];
          spread_bearing_deg?: number | null;
          state?: string;
          suspected_persistent_source?: boolean;
          updated_at?: string;
          wilaya_id?: string | null;
          wind_dir_deg?: number | null;
          wind_speed_kmh?: number | null;
        };
        Update: {
          commune_id?: string | null;
          confidence?: number;
          created_at?: string;
          detection_count?: number;
          est_area_ha?: number | null;
          first_detected_at?: string;
          hull?: Json | null;
          id?: string;
          last_detected_at?: string;
          lat?: number;
          lon?: number;
          max_frp_mw?: number | null;
          nearest_settlement_id?: string | null;
          nearest_settlement_km?: number | null;
          resolution_note?: string | null;
          resolution_reason?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          short_id?: string;
          sources?: string[];
          spread_bearing_deg?: number | null;
          state?: string;
          suspected_persistent_source?: boolean;
          updated_at?: string;
          wilaya_id?: string | null;
          wind_dir_deg?: number | null;
          wind_speed_kmh?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "fire_clusters_commune_id_fkey";
            columns: ["commune_id"];
            isOneToOne: false;
            referencedRelation: "admin_units";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fire_clusters_nearest_settlement_id_fkey";
            columns: ["nearest_settlement_id"];
            isOneToOne: false;
            referencedRelation: "settlements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fire_clusters_wilaya_id_fkey";
            columns: ["wilaya_id"];
            isOneToOne: false;
            referencedRelation: "admin_units";
            referencedColumns: ["id"];
          },
        ];
      };
      fwi_state: {
        Row: {
          commune_id: string;
          date: string;
          dc: number;
          dmc: number;
          ffmc: number;
          inputs: string;
          updated_at: string;
        };
        Insert: {
          commune_id: string;
          date: string;
          dc: number;
          dmc: number;
          ffmc: number;
          inputs?: string;
          updated_at?: string;
        };
        Update: {
          commune_id?: string;
          date?: string;
          dc?: number;
          dmc?: number;
          ffmc?: number;
          inputs?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fwi_state_commune_id_fkey";
            columns: ["commune_id"];
            isOneToOne: false;
            referencedRelation: "admin_units";
            referencedColumns: ["id"];
          },
        ];
      };
      ingest_runs: {
        Row: {
          error: string | null;
          finished_at: string | null;
          id: string;
          records_in: number;
          records_new: number;
          source: string;
          started_at: string;
          status: string;
        };
        Insert: {
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          records_in?: number;
          records_new?: number;
          source: string;
          started_at?: string;
          status?: string;
        };
        Update: {
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          records_in?: number;
          records_new?: number;
          source?: string;
          started_at?: string;
          status?: string;
        };
        Relationships: [];
      };
      internal_cron_token: {
        Row: {
          created_at: string;
          id: boolean;
          token: string;
        };
        Insert: {
          created_at?: string;
          id?: boolean;
          token: string;
        };
        Update: {
          created_at?: string;
          id?: boolean;
          token?: string;
        };
        Relationships: [];
      };
      admin_unit_aliases: {
        Row: {
          admin_unit_id: string;
          alias_ar: string;
          source: string;
        };
        Insert: {
          admin_unit_id: string;
          alias_ar: string;
          source: string;
        };
        Update: {
          admin_unit_id?: string;
          alias_ar?: string;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_unit_aliases_admin_unit_id_fkey";
            columns: ["admin_unit_id"];
            isOneToOne: false;
            referencedRelation: "admin_units";
            referencedColumns: ["id"];
          },
        ];
      };
      incident_mentions: {
        Row: {
          as_of: string;
          commune_id: string | null;
          created_at: string;
          document_id: string;
          evidence: string;
          extractor: string;
          fire_count: number;
          id: string;
          incident_id: string | null;
          kind: string;
          place_text: string | null;
          precision: string;
          status: string;
          text_source_id: string;
          wilaya_id: string;
        };
        Insert: {
          as_of: string;
          commune_id?: string | null;
          created_at?: string;
          document_id: string;
          evidence: string;
          extractor: string;
          fire_count?: number;
          id?: string;
          incident_id?: string | null;
          kind: string;
          place_text?: string | null;
          precision: string;
          status: string;
          text_source_id: string;
          wilaya_id: string;
        };
        Update: {
          as_of?: string;
          commune_id?: string | null;
          created_at?: string;
          document_id?: string;
          evidence?: string;
          extractor?: string;
          fire_count?: number;
          id?: string;
          incident_id?: string | null;
          kind?: string;
          place_text?: string | null;
          precision?: string;
          status?: string;
          text_source_id?: string;
          wilaya_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "incident_mentions_commune_id_fkey";
            columns: ["commune_id"];
            isOneToOne: false;
            referencedRelation: "admin_units";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incident_mentions_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "source_documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incident_mentions_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "official_incidents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incident_mentions_text_source_id_fkey";
            columns: ["text_source_id"];
            isOneToOne: false;
            referencedRelation: "text_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incident_mentions_wilaya_id_fkey";
            columns: ["wilaya_id"];
            isOneToOne: false;
            referencedRelation: "admin_units";
            referencedColumns: ["id"];
          },
        ];
      };
      official_incidents: {
        Row: {
          as_of: string;
          authority_tier: string;
          commune_id: string | null;
          evidence: string;
          first_reported_at: string;
          id: string;
          kind: string;
          last_reported_at: string;
          latest_mention_id: string | null;
          mention_count: number;
          place_text: string | null;
          precision: string;
          status: string;
          updated_at: string;
          wilaya_id: string;
        };
        Insert: {
          as_of: string;
          authority_tier: string;
          commune_id?: string | null;
          evidence: string;
          first_reported_at: string;
          id?: string;
          kind: string;
          last_reported_at: string;
          latest_mention_id?: string | null;
          mention_count?: number;
          place_text?: string | null;
          precision: string;
          status: string;
          updated_at?: string;
          wilaya_id: string;
        };
        Update: {
          as_of?: string;
          authority_tier?: string;
          commune_id?: string | null;
          evidence?: string;
          first_reported_at?: string;
          id?: string;
          kind?: string;
          last_reported_at?: string;
          latest_mention_id?: string | null;
          mention_count?: number;
          place_text?: string | null;
          precision?: string;
          status?: string;
          updated_at?: string;
          wilaya_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "official_incidents_commune_id_fkey";
            columns: ["commune_id"];
            isOneToOne: false;
            referencedRelation: "admin_units";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "official_incidents_latest_mention_fkey";
            columns: ["latest_mention_id"];
            isOneToOne: false;
            referencedRelation: "incident_mentions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "official_incidents_wilaya_id_fkey";
            columns: ["wilaya_id"];
            isOneToOne: false;
            referencedRelation: "admin_units";
            referencedColumns: ["id"];
          },
        ];
      };
      source_documents: {
        Row: {
          body: string;
          content_hash: string;
          external_id: string;
          fetched_at: string;
          id: string;
          published_at: string;
          raw: Json | null;
          text_source_id: string;
          url: string;
        };
        Insert: {
          body: string;
          content_hash: string;
          external_id: string;
          fetched_at?: string;
          id?: string;
          published_at: string;
          raw?: Json | null;
          text_source_id: string;
          url: string;
        };
        Update: {
          body?: string;
          content_hash?: string;
          external_id?: string;
          fetched_at?: string;
          id?: string;
          published_at?: string;
          raw?: Json | null;
          text_source_id?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "source_documents_text_source_id_fkey";
            columns: ["text_source_id"];
            isOneToOne: false;
            referencedRelation: "text_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      text_sources: {
        Row: {
          authority_tier: string;
          created_at: string;
          enabled: boolean;
          id: string;
          key: string;
          kind: string;
          label: string;
          language: string;
          template: string | null;
          url: string;
          wilaya_id: string | null;
        };
        Insert: {
          authority_tier: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          key: string;
          kind: string;
          label: string;
          language?: string;
          template?: string | null;
          url: string;
          wilaya_id?: string | null;
        };
        Update: {
          authority_tier?: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          key?: string;
          kind?: string;
          label?: string;
          language?: string;
          template?: string | null;
          url?: string;
          wilaya_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "text_sources_key_fkey";
            columns: ["key"];
            isOneToOne: true;
            referencedRelation: "source_contracts";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "text_sources_key_fkey";
            columns: ["key"];
            isOneToOne: true;
            referencedRelation: "source_health";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "text_sources_wilaya_id_fkey";
            columns: ["wilaya_id"];
            isOneToOne: false;
            referencedRelation: "admin_units";
            referencedColumns: ["id"];
          },
        ];
      };
      onm_vigilance: {
        Row: {
          area_desc: string;
          cap_id: string;
          cap_url: string | null;
          certainty: string;
          created_at: string;
          event: string;
          expires: string | null;
          headline_fr: string | null;
          id: string;
          instruction_fr: string | null;
          onset: string | null;
          polygon: Json | null;
          sent: string;
          severity: string;
          title: string;
          urgency: string;
          wilaya_id: string | null;
        };
        Insert: {
          area_desc: string;
          cap_id: string;
          cap_url?: string | null;
          certainty: string;
          created_at?: string;
          event: string;
          expires?: string | null;
          headline_fr?: string | null;
          id?: string;
          instruction_fr?: string | null;
          onset?: string | null;
          polygon?: Json | null;
          sent: string;
          severity: string;
          title: string;
          urgency: string;
          wilaya_id?: string | null;
        };
        Update: {
          area_desc?: string;
          cap_id?: string;
          cap_url?: string | null;
          certainty?: string;
          created_at?: string;
          event?: string;
          expires?: string | null;
          headline_fr?: string | null;
          id?: string;
          instruction_fr?: string | null;
          onset?: string | null;
          polygon?: Json | null;
          sent?: string;
          severity?: string;
          title?: string;
          urgency?: string;
          wilaya_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "onm_vigilance_wilaya_id_fkey";
            columns: ["wilaya_id"];
            isOneToOne: false;
            referencedRelation: "admin_units";
            referencedColumns: ["id"];
          },
        ];
      };
      open_areas: {
        Row: {
          area_type: string;
          commune_id: string | null;
          created_at: string;
          id: string;
          lat: number;
          lon: number;
          name: string;
          name_ar: string | null;
          osm_id: number | null;
          osm_type: string | null;
          source: string;
          verified_at: string | null;
          verified_by: string | null;
          verified_note: string | null;
        };
        Insert: {
          area_type: string;
          commune_id?: string | null;
          created_at?: string;
          id?: string;
          lat: number;
          lon: number;
          name: string;
          name_ar?: string | null;
          osm_id?: number | null;
          osm_type?: string | null;
          source?: string;
          verified_at?: string | null;
          verified_by?: string | null;
          verified_note?: string | null;
        };
        Update: {
          area_type?: string;
          commune_id?: string | null;
          created_at?: string;
          id?: string;
          lat?: number;
          lon?: number;
          name?: string;
          name_ar?: string | null;
          osm_id?: number | null;
          osm_type?: string | null;
          source?: string;
          verified_at?: string | null;
          verified_by?: string | null;
          verified_note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "open_areas_commune_id_fkey";
            columns: ["commune_id"];
            isOneToOne: false;
            referencedRelation: "admin_units";
            referencedColumns: ["id"];
          },
        ];
      };
      persistent_sources: {
        Row: {
          active_days: number;
          created_at: string;
          detection_count: number;
          first_seen: string;
          frp_p50: number | null;
          frp_p90: number | null;
          id: string;
          jul_aug_share: number | null;
          last_seen: string;
          lat: number;
          lon: number;
          observation_days: number;
          site_id: string;
          site_name: string | null;
          static_share: number;
        };
        Insert: {
          active_days: number;
          created_at?: string;
          detection_count: number;
          first_seen: string;
          frp_p50?: number | null;
          frp_p90?: number | null;
          id?: string;
          jul_aug_share?: number | null;
          last_seen: string;
          lat: number;
          lon: number;
          observation_days: number;
          site_id: string;
          site_name?: string | null;
          static_share: number;
        };
        Update: {
          active_days?: number;
          created_at?: string;
          detection_count?: number;
          first_seen?: string;
          frp_p50?: number | null;
          frp_p90?: number | null;
          id?: string;
          jul_aug_share?: number | null;
          last_seen?: string;
          lat?: number;
          lon?: number;
          observation_days?: number;
          site_id?: string;
          site_name?: string | null;
          static_share?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          alert_email: boolean;
          alert_push: boolean;
          created_at: string;
          display_name: string | null;
          id: string;
          locale: string;
          min_confidence: number;
          min_danger_level: number;
          phone: string | null;
          quiet_hours_end: number | null;
          quiet_hours_start: number | null;
          updated_at: string;
        };
        Insert: {
          alert_email?: boolean;
          alert_push?: boolean;
          created_at?: string;
          display_name?: string | null;
          id: string;
          locale?: string;
          min_confidence?: number;
          min_danger_level?: number;
          phone?: string | null;
          quiet_hours_end?: number | null;
          quiet_hours_start?: number | null;
          updated_at?: string;
        };
        Update: {
          alert_email?: boolean;
          alert_push?: boolean;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          locale?: string;
          min_confidence?: number;
          min_danger_level?: number;
          phone?: string | null;
          quiet_hours_end?: number | null;
          quiet_hours_start?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      risk_forecasts: {
        Row: {
          commune_id: string;
          components: Json | null;
          created_at: string;
          danger_level: number;
          forecast_date: string;
          fuel_limited: boolean;
          fwi: number;
          horizon_days: number;
          id: string;
          snapshot_id: string | null;
          source: string;
        };
        Insert: {
          commune_id: string;
          components?: Json | null;
          created_at?: string;
          danger_level: number;
          forecast_date: string;
          fuel_limited?: boolean;
          fwi: number;
          horizon_days: number;
          id?: string;
          snapshot_id?: string | null;
          source: string;
        };
        Update: {
          commune_id?: string;
          components?: Json | null;
          created_at?: string;
          danger_level?: number;
          forecast_date?: string;
          fuel_limited?: boolean;
          fwi?: number;
          horizon_days?: number;
          id?: string;
          snapshot_id?: string | null;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "risk_forecasts_commune_id_fkey";
            columns: ["commune_id"];
            isOneToOne: false;
            referencedRelation: "admin_units";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "risk_forecasts_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "risk_publications";
            referencedColumns: ["snapshot_id"];
          },
        ];
      };
      settlements: {
        Row: {
          commune_id: string | null;
          created_at: string;
          id: string;
          lat: number;
          lon: number;
          name: string;
          name_ar: string | null;
          osm_id: number | null;
          place_type: string;
          population: number | null;
        };
        Insert: {
          commune_id?: string | null;
          created_at?: string;
          id?: string;
          lat: number;
          lon: number;
          name: string;
          name_ar?: string | null;
          osm_id?: number | null;
          place_type?: string;
          population?: number | null;
        };
        Update: {
          commune_id?: string | null;
          created_at?: string;
          id?: string;
          lat?: number;
          lon?: number;
          name?: string;
          name_ar?: string | null;
          osm_id?: number | null;
          place_type?: string;
          population?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "settlements_commune_id_fkey";
            columns: ["commune_id"];
            isOneToOne: false;
            referencedRelation: "admin_units";
            referencedColumns: ["id"];
          },
        ];
      };
      source_checkpoints: {
        Row: {
          consecutive_failures: number;
          contract_key: string;
          coverage_status: string;
          data_from: string | null;
          data_through: string | null;
          fallback_contract_key: string | null;
          last_attempt_at: string | null;
          last_public_reason_code: string | null;
          last_scheduled_for: string | null;
          last_success_at: string | null;
          published_at: string | null;
          records_accepted: number;
          records_expected: number | null;
          replay_cursor: Json | null;
          schema_fingerprint: string | null;
          updated_at: string;
          upstream_published_at: string | null;
          validated_at: string | null;
        };
        Insert: {
          consecutive_failures?: number;
          contract_key: string;
          coverage_status?: string;
          data_from?: string | null;
          data_through?: string | null;
          fallback_contract_key?: string | null;
          last_attempt_at?: string | null;
          last_public_reason_code?: string | null;
          last_scheduled_for?: string | null;
          last_success_at?: string | null;
          published_at?: string | null;
          records_accepted?: number;
          records_expected?: number | null;
          replay_cursor?: Json | null;
          schema_fingerprint?: string | null;
          updated_at?: string;
          upstream_published_at?: string | null;
          validated_at?: string | null;
        };
        Update: {
          consecutive_failures?: number;
          contract_key?: string;
          coverage_status?: string;
          data_from?: string | null;
          data_through?: string | null;
          fallback_contract_key?: string | null;
          last_attempt_at?: string | null;
          last_public_reason_code?: string | null;
          last_scheduled_for?: string | null;
          last_success_at?: string | null;
          published_at?: string | null;
          records_accepted?: number;
          records_expected?: number | null;
          replay_cursor?: Json | null;
          schema_fingerprint?: string | null;
          updated_at?: string;
          upstream_published_at?: string | null;
          validated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "source_checkpoints_contract_key_fkey";
            columns: ["contract_key"];
            isOneToOne: true;
            referencedRelation: "source_contracts";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "source_checkpoints_contract_key_fkey";
            columns: ["contract_key"];
            isOneToOne: true;
            referencedRelation: "source_health";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "source_checkpoints_fallback_contract_key_fkey";
            columns: ["fallback_contract_key"];
            isOneToOne: false;
            referencedRelation: "source_contracts";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "source_checkpoints_fallback_contract_key_fkey";
            columns: ["fallback_contract_key"];
            isOneToOne: false;
            referencedRelation: "source_health";
            referencedColumns: ["key"];
          },
        ];
      };
      source_contracts: {
        Row: {
          attribution: string;
          cadence_minutes: number;
          created_at: string;
          criticality: string;
          dependency_keys: string[];
          enabled: boolean;
          execution_target: string;
          expected_coverage: Json;
          family: string;
          freshness_basis: string;
          key: string;
          label: string;
          lease_seconds: number;
          licence: string;
          max_attempts: number;
          max_fallback_age_minutes: number | null;
          overlap_minutes: number;
          owner: string;
          parser_version: string;
          replay_capability: string;
          replay_window_minutes: number | null;
          retry_base_seconds: number;
          retry_window_minutes: number;
          runbook_url: string | null;
          schedule_enabled: boolean;
          schedule_offset_minutes: number;
          stale_after_minutes: number;
          updated_at: string;
          version: number;
          warning_after_minutes: number;
        };
        Insert: {
          attribution: string;
          cadence_minutes: number;
          created_at?: string;
          criticality: string;
          dependency_keys?: string[];
          enabled?: boolean;
          execution_target?: string;
          expected_coverage?: Json;
          family: string;
          freshness_basis: string;
          key: string;
          label: string;
          lease_seconds?: number;
          licence: string;
          max_attempts?: number;
          max_fallback_age_minutes?: number | null;
          overlap_minutes?: number;
          owner: string;
          parser_version: string;
          replay_capability?: string;
          replay_window_minutes?: number | null;
          retry_base_seconds?: number;
          retry_window_minutes?: number;
          runbook_url?: string | null;
          schedule_enabled?: boolean;
          schedule_offset_minutes?: number;
          stale_after_minutes: number;
          updated_at?: string;
          version: number;
          warning_after_minutes: number;
        };
        Update: {
          attribution?: string;
          cadence_minutes?: number;
          created_at?: string;
          criticality?: string;
          dependency_keys?: string[];
          enabled?: boolean;
          execution_target?: string;
          expected_coverage?: Json;
          family?: string;
          freshness_basis?: string;
          key?: string;
          label?: string;
          lease_seconds?: number;
          licence?: string;
          max_attempts?: number;
          max_fallback_age_minutes?: number | null;
          overlap_minutes?: number;
          owner?: string;
          parser_version?: string;
          replay_capability?: string;
          replay_window_minutes?: number | null;
          retry_base_seconds?: number;
          retry_window_minutes?: number;
          runbook_url?: string | null;
          schedule_enabled?: boolean;
          schedule_offset_minutes?: number;
          stale_after_minutes?: number;
          updated_at?: string;
          version?: number;
          warning_after_minutes?: number;
        };
        Relationships: [];
      };
      source_gaps: {
        Row: {
          contract_key: string;
          data_from: string;
          data_through: string;
          detected_at: string;
          id: string;
          public_reason_code: string | null;
          replay_count: number;
          resolved_at: string | null;
          resolved_by_run_id: string | null;
          state: string;
          updated_at: string;
        };
        Insert: {
          contract_key: string;
          data_from: string;
          data_through: string;
          detected_at?: string;
          id?: string;
          public_reason_code?: string | null;
          replay_count?: number;
          resolved_at?: string | null;
          resolved_by_run_id?: string | null;
          state?: string;
          updated_at?: string;
        };
        Update: {
          contract_key?: string;
          data_from?: string;
          data_through?: string;
          detected_at?: string;
          id?: string;
          public_reason_code?: string | null;
          replay_count?: number;
          resolved_at?: string | null;
          resolved_by_run_id?: string | null;
          state?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "source_gaps_contract_key_fkey";
            columns: ["contract_key"];
            isOneToOne: false;
            referencedRelation: "source_contracts";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "source_gaps_contract_key_fkey";
            columns: ["contract_key"];
            isOneToOne: false;
            referencedRelation: "source_health";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "source_gaps_resolved_by_run_id_fkey";
            columns: ["resolved_by_run_id"];
            isOneToOne: false;
            referencedRelation: "source_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      source_job_leases: {
        Row: {
          attempt: number;
          contract_key: string;
          job_id: string;
          lease_expires_at: string;
          leased_at: string;
          worker_id: string;
        };
        Insert: {
          attempt: number;
          contract_key: string;
          job_id: string;
          lease_expires_at: string;
          leased_at: string;
          worker_id: string;
        };
        Update: {
          attempt?: number;
          contract_key?: string;
          job_id?: string;
          lease_expires_at?: string;
          leased_at?: string;
          worker_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "source_job_leases_contract_key_fkey";
            columns: ["contract_key"];
            isOneToOne: true;
            referencedRelation: "source_contracts";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "source_job_leases_contract_key_fkey";
            columns: ["contract_key"];
            isOneToOne: true;
            referencedRelation: "source_health";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "source_job_leases_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: true;
            referencedRelation: "source_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      source_jobs: {
        Row: {
          attempt_count: number;
          available_at: string;
          contract_key: string;
          contract_version: number;
          created_at: string;
          data_from: string;
          data_through: string;
          enqueued_by: string[];
          execution_target: string;
          finished_at: string | null;
          gap_id: string | null;
          id: string;
          idempotency_key: string;
          last_error_at: string | null;
          last_public_reason_code: string | null;
          max_attempts: number;
          retry_base_seconds: number;
          retry_until: string;
          scheduled_for: string;
          started_at: string | null;
          state: string;
          trigger_kind: string;
          updated_at: string;
        };
        Insert: {
          attempt_count?: number;
          available_at?: string;
          contract_key: string;
          contract_version: number;
          created_at?: string;
          data_from: string;
          data_through: string;
          enqueued_by?: string[];
          execution_target: string;
          finished_at?: string | null;
          gap_id?: string | null;
          id?: string;
          idempotency_key: string;
          last_error_at?: string | null;
          last_public_reason_code?: string | null;
          max_attempts: number;
          retry_base_seconds: number;
          retry_until: string;
          scheduled_for: string;
          started_at?: string | null;
          state?: string;
          trigger_kind: string;
          updated_at?: string;
        };
        Update: {
          attempt_count?: number;
          available_at?: string;
          contract_key?: string;
          contract_version?: number;
          created_at?: string;
          data_from?: string;
          data_through?: string;
          enqueued_by?: string[];
          execution_target?: string;
          finished_at?: string | null;
          gap_id?: string | null;
          id?: string;
          idempotency_key?: string;
          last_error_at?: string | null;
          last_public_reason_code?: string | null;
          max_attempts?: number;
          retry_base_seconds?: number;
          retry_until?: string;
          scheduled_for?: string;
          started_at?: string | null;
          state?: string;
          trigger_kind?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "source_jobs_contract_key_fkey";
            columns: ["contract_key"];
            isOneToOne: false;
            referencedRelation: "source_contracts";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "source_jobs_contract_key_fkey";
            columns: ["contract_key"];
            isOneToOne: false;
            referencedRelation: "source_health";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "source_jobs_gap_id_fkey";
            columns: ["gap_id"];
            isOneToOne: false;
            referencedRelation: "source_gaps";
            referencedColumns: ["id"];
          },
        ];
      };
      source_runs: {
        Row: {
          attempt: number | null;
          contract_key: string;
          contract_version: number;
          coverage_status: string;
          created_at: string;
          data_from: string | null;
          data_through: string | null;
          finished_at: string | null;
          id: string;
          idempotency_key: string | null;
          job_id: string | null;
          outcome: string;
          private_diagnostic: string | null;
          public_reason_code: string | null;
          published_at: string | null;
          quality_checks: Json;
          records_expected: number | null;
          records_inserted: number;
          records_rejected: number;
          records_seen: number;
          records_updated: number;
          scheduled_for: string;
          started_at: string;
          trigger_kind: string;
          upstream_published_at: string | null;
          validated_at: string | null;
        };
        Insert: {
          attempt?: number | null;
          contract_key: string;
          contract_version: number;
          coverage_status?: string;
          created_at?: string;
          data_from?: string | null;
          data_through?: string | null;
          finished_at?: string | null;
          id?: string;
          idempotency_key?: string | null;
          job_id?: string | null;
          outcome: string;
          private_diagnostic?: string | null;
          public_reason_code?: string | null;
          published_at?: string | null;
          quality_checks?: Json;
          records_expected?: number | null;
          records_inserted?: number;
          records_rejected?: number;
          records_seen?: number;
          records_updated?: number;
          scheduled_for: string;
          started_at: string;
          trigger_kind: string;
          upstream_published_at?: string | null;
          validated_at?: string | null;
        };
        Update: {
          attempt?: number | null;
          contract_key?: string;
          contract_version?: number;
          coverage_status?: string;
          created_at?: string;
          data_from?: string | null;
          data_through?: string | null;
          finished_at?: string | null;
          id?: string;
          idempotency_key?: string | null;
          job_id?: string | null;
          outcome?: string;
          private_diagnostic?: string | null;
          public_reason_code?: string | null;
          published_at?: string | null;
          quality_checks?: Json;
          records_expected?: number | null;
          records_inserted?: number;
          records_rejected?: number;
          records_seen?: number;
          records_updated?: number;
          scheduled_for?: string;
          started_at?: string;
          trigger_kind?: string;
          upstream_published_at?: string | null;
          validated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "source_runs_contract_key_fkey";
            columns: ["contract_key"];
            isOneToOne: false;
            referencedRelation: "source_contracts";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "source_runs_contract_key_fkey";
            columns: ["contract_key"];
            isOneToOne: false;
            referencedRelation: "source_health";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "source_runs_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "source_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_channels: {
        Row: {
          chat_id: string;
          created_at: string;
          wilaya_id: string;
        };
        Insert: {
          chat_id: string;
          created_at?: string;
          wilaya_id: string;
        };
        Update: {
          chat_id?: string;
          created_at?: string;
          wilaya_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_channels_wilaya_id_fkey";
            columns: ["wilaya_id"];
            isOneToOne: true;
            referencedRelation: "admin_units";
            referencedColumns: ["id"];
          },
        ];
      };
      translation_suggestions: {
        Row: {
          created_at: string;
          current_text: string;
          id: string;
          key_path: string;
          locale: string;
          moderated_by: string | null;
          moderation_note: string | null;
          note: string | null;
          reviewer_key: string;
          reviewer_name: string | null;
          source_text: string;
          status: string;
          suggestion: string | null;
          verdict: string;
        };
        Insert: {
          created_at?: string;
          current_text: string;
          id?: string;
          key_path: string;
          locale: string;
          moderated_by?: string | null;
          moderation_note?: string | null;
          note?: string | null;
          reviewer_key: string;
          reviewer_name?: string | null;
          source_text: string;
          status?: string;
          suggestion?: string | null;
          verdict: string;
        };
        Update: {
          created_at?: string;
          current_text?: string;
          id?: string;
          key_path?: string;
          locale?: string;
          moderated_by?: string | null;
          moderation_note?: string | null;
          note?: string | null;
          reviewer_key?: string;
          reviewer_name?: string | null;
          source_text?: string;
          status?: string;
          suggestion?: string | null;
          verdict?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      webhook_deliveries: {
        Row: {
          alert_id: string | null;
          created_at: string;
          endpoint_id: string;
          error: string | null;
          id: string;
          ok: boolean;
          status_code: number | null;
          user_id: string;
        };
        Insert: {
          alert_id?: string | null;
          created_at?: string;
          endpoint_id: string;
          error?: string | null;
          id?: string;
          ok?: boolean;
          status_code?: number | null;
          user_id: string;
        };
        Update: {
          alert_id?: string | null;
          created_at?: string;
          endpoint_id?: string;
          error?: string | null;
          id?: string;
          ok?: boolean;
          status_code?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_alert_id_fkey";
            columns: ["alert_id"];
            isOneToOne: false;
            referencedRelation: "alerts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey";
            columns: ["endpoint_id"];
            isOneToOne: false;
            referencedRelation: "webhook_endpoints";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_endpoints: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          kinds: string[];
          label: string;
          last_attempt_at: string | null;
          last_error: string | null;
          last_status: number | null;
          min_severity: number;
          secret: string;
          updated_at: string;
          url: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          kinds?: string[];
          label: string;
          last_attempt_at?: string | null;
          last_error?: string | null;
          last_status?: number | null;
          min_severity?: number;
          secret?: string;
          updated_at?: string;
          url: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          kinds?: string[];
          label?: string;
          last_attempt_at?: string | null;
          last_error?: string | null;
          last_status?: number | null;
          min_severity?: number;
          secret?: string;
          updated_at?: string;
          url?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      zones: {
        Row: {
          active: boolean;
          commune_id: string | null;
          created_at: string;
          id: string;
          lat: number;
          lon: number;
          min_danger_level: number;
          name: string;
          notify_fires: boolean;
          notify_risk: boolean;
          radius_km: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          commune_id?: string | null;
          created_at?: string;
          id?: string;
          lat: number;
          lon: number;
          min_danger_level?: number;
          name: string;
          notify_fires?: boolean;
          notify_risk?: boolean;
          radius_km?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          commune_id?: string | null;
          created_at?: string;
          id?: string;
          lat?: number;
          lon?: number;
          min_danger_level?: number;
          name?: string;
          notify_fires?: boolean;
          notify_risk?: boolean;
          radius_km?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "zones_commune_id_fkey";
            columns: ["commune_id"];
            isOneToOne: false;
            referencedRelation: "admin_units";
            referencedColumns: ["id"];
          },
        ];
      };

      risk_forecast_snapshot_runs: {
        Row: {
          base_date: string;
          created_at: string;
          finished_at: string | null;
          heartbeat_at: string;
          scheduled_for: string;
          snapshot_id: string;
          status: string;
        };
        Insert: {
          base_date: string;
          created_at?: string;
          finished_at?: string | null;
          heartbeat_at?: string;
          scheduled_for: string;
          snapshot_id: string;
          status?: string;
        };
        Update: {
          base_date?: string;
          created_at?: string;
          finished_at?: string | null;
          heartbeat_at?: string;
          scheduled_for?: string;
          snapshot_id?: string;
          status?: string;
        };
        Relationships: [];
      };
      risk_forecast_staging: {
        Row: {
          commune_id: string;
          components: Json | null;
          danger_level: number;
          forecast_date: string;
          fuel_limited: boolean;
          fwi: number;
          horizon_days: number;
          snapshot_id: string;
          staged_at: string;
        };
        Insert: {
          commune_id: string;
          components?: Json | null;
          danger_level: number;
          forecast_date: string;
          fuel_limited?: boolean;
          fwi: number;
          horizon_days: number;
          snapshot_id: string;
          staged_at?: string;
        };
        Update: {
          commune_id?: string;
          components?: Json | null;
          danger_level?: number;
          forecast_date?: string;
          fuel_limited?: boolean;
          fwi?: number;
          horizon_days?: number;
          snapshot_id?: string;
          staged_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "risk_forecast_staging_commune_id_fkey";
            columns: ["commune_id"];
            isOneToOne: false;
            referencedRelation: "admin_units";
            referencedColumns: ["id"];
          },
        ];
      };
      risk_publication_checkpoint: {
        Row: {
          base_date: string;
          coverage_status: string;
          key: string;
          published_at: string;
          scheduled_for: string;
          snapshot_id: string;
        };
        Insert: {
          base_date: string;
          coverage_status?: string;
          key: string;
          published_at: string;
          scheduled_for: string;
          snapshot_id: string;
        };
        Update: {
          base_date?: string;
          coverage_status?: string;
          key?: string;
          published_at?: string;
          scheduled_for?: string;
          snapshot_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "risk_publication_checkpoint_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "risk_publications";
            referencedColumns: ["snapshot_id"];
          },
        ];
      };
      risk_publications: {
        Row: {
          base_date: string;
          published_at: string;
          row_count: number;
          scheduled_for: string;
          snapshot_id: string;
        };
        Insert: {
          base_date: string;
          published_at: string;
          row_count: number;
          scheduled_for: string;
          snapshot_id: string;
        };
        Update: {
          base_date?: string;
          published_at?: string;
          row_count?: number;
          scheduled_for?: string;
          snapshot_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      hazard_reports: {
        Row: {
          created_at: string | null;
          id: string | null;
          kind: string | null;
          lat: number | null;
          lon: number | null;
          observed_at: string | null;
          sighting: string | null;
          status: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string | null;
          kind?: string | null;
          lat?: number | null;
          lon?: number | null;
          observed_at?: string | null;
          sighting?: string | null;
          status?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string | null;
          kind?: string | null;
          lat?: number | null;
          lon?: number | null;
          observed_at?: string | null;
          sighting?: string | null;
          status?: string | null;
        };
        Relationships: [];
      };
      official_incident_recall_daily: {
        Row: {
          communes: number | null;
          day: string | null;
          mentions: number | null;
          with_cluster: number | null;
        };
        Relationships: [];
      };
      source_health: {
        Row: {
          age_minutes: number | null;
          coverage_status: string | null;
          criticality: string | null;
          fallback_contract_key: string | null;
          family: string | null;
          freshness_basis: string | null;
          key: string | null;
          label: string | null;
          last_attempt_at: string | null;
          last_success_at: string | null;
          public_reason_code: string | null;
          published_at: string | null;
          records_accepted: number | null;
          records_expected: number | null;
          stale_after_minutes: number | null;
          state: string | null;
          valid_at: string | null;
          warning_after_minutes: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "source_checkpoints_fallback_contract_key_fkey";
            columns: ["fallback_contract_key"];
            isOneToOne: false;
            referencedRelation: "source_contracts";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "source_checkpoints_fallback_contract_key_fkey";
            columns: ["fallback_contract_key"];
            isOneToOne: false;
            referencedRelation: "source_health";
            referencedColumns: ["key"];
          },
        ];
      };
      source_watchdog: {
        Row: {
          contract_key: string | null;
          issue_code: string | null;
          job_id: string | null;
          lease_expires_at: string | null;
          observed_at: string | null;
          scheduled_for: string | null;
        };
        Relationships: [];
      };

      published_contribution_ideas: {
        Row: {
          id: string | null;
          lane: string | null;
          message: string | null;
          published_at: string | null;
          score: number | null;
        };
        Insert: {
          id?: string | null;
          lane?: string | null;
          message?: string | null;
          published_at?: string | null;
          score?: number | null;
        };
        Update: {
          id?: string | null;
          lane?: string | null;
          message?: string | null;
          published_at?: string | null;
          score?: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      claim_source_job: {
        Args: {
          _contract_key?: string;
          _execution_target: string;
          _now?: string;
          _worker_id: string;
        };
        Returns: {
          attempt_count: number;
          available_at: string;
          contract_key: string;
          contract_version: number;
          created_at: string;
          data_from: string;
          data_through: string;
          enqueued_by: string[];
          execution_target: string;
          finished_at: string | null;
          gap_id: string | null;
          id: string;
          idempotency_key: string;
          last_error_at: string | null;
          last_public_reason_code: string | null;
          max_attempts: number;
          retry_base_seconds: number;
          retry_until: string;
          scheduled_for: string;
          started_at: string | null;
          state: string;
          trigger_kind: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "source_jobs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      complete_source_job: {
        Args: {
          _attempt: number;
          _coverage_status: string;
          _data_from: string | null;
          _data_through: string | null;
          _finished_at: string;
          _job_id: string;
          _outcome: string;
          _private_diagnostic: string | null;
          _public_reason_code: string | null;
          _published_at: string | null;
          _quality_checks: Json;
          _records_expected: number | null;
          _records_inserted: number;
          _records_rejected: number;
          _records_seen: number;
          _records_updated: number;
          _retryable: boolean;
          _upstream_published_at: string | null;
          _validated_at: string | null;
          _worker_id: string;
        };
        Returns: {
          attempt_count: number;
          available_at: string;
          contract_key: string;
          contract_version: number;
          created_at: string;
          data_from: string;
          data_through: string;
          enqueued_by: string[];
          execution_target: string;
          finished_at: string | null;
          gap_id: string | null;
          id: string;
          idempotency_key: string;
          last_error_at: string | null;
          last_public_reason_code: string | null;
          max_attempts: number;
          retry_base_seconds: number;
          retry_until: string;
          scheduled_for: string;
          started_at: string | null;
          state: string;
          trigger_kind: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "source_jobs";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      consume_rate_limit: {
        Args: { _bucket: string; _limit: number; _window_seconds: number };
        Returns: boolean;
      };
      enqueue_due_source_jobs: {
        Args: { _enqueued_by: string; _observed_at: string };
        Returns: number;
      };
      enqueue_source_replay: {
        Args: { _gap_id: string; _requested_at?: string };
        Returns: string | null;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      record_source_run: {
        Args: {
          _contract_key: string;
          _coverage_status: string;
          _data_from: string | null;
          _data_through: string | null;
          _finished_at: string;
          _idempotency_key: string;
          _outcome: string;
          _private_diagnostic: string | null;
          _public_reason_code: string | null;
          _published_at: string | null;
          _quality_checks: Json;
          _records_expected: number | null;
          _records_inserted: number;
          _records_rejected: number;
          _records_seen: number;
          _records_updated: number;
          _scheduled_for: string;
          _started_at: string;
          _trigger_kind: string;
          _upstream_published_at: string | null;
          _validated_at: string | null;
        };
        Returns: string;
      };
      source_contract_is_backfilling: {
        Args: { _contract_key: string };
        Returns: boolean;
      };
      source_job_queue_has_pending: {
        Args: {
          _contract_key?: string;
          _execution_target: string;
          _now?: string;
        };
        Returns: boolean;
      };
      vote_on_idea: {
        Args: { _idea: string; _value: number; _voter: string };
        Returns: number;
      };

      begin_risk_forecast_snapshot: {
        Args: {
          _base_date: string;
          _scheduled_for: string;
          _snapshot_id: string;
          _stale_before: string;
        };
        Returns: number;
      };
      current_risk_forecasts: {
        Args: never;
        Returns: {
          admin_level: string;
          commune_code: string;
          commune_id: string;
          components: Json;
          created_at: string;
          danger_level: number;
          forecast_date: string;
          fuel_limited: boolean;
          fwi: number;
          horizon_days: number;
          id: string;
          name_ar: string;
          name_en: string;
          name_fr: string;
          snapshot_id: string;
          source: string;
        }[];
      };
      discard_risk_forecast_snapshot: {
        Args: {
          _base_date: string;
          _scheduled_for: string;
          _snapshot_id: string;
        };
        Returns: boolean;
      };
      list_contribution_ideas_for_moderation: {
        Args: never;
        Returns: {
          contact: string | null;
          created_at: string;
          id: string;
          lane: string;
          locale: string;
          message: string;
          moderated_by: string | null;
          moderation_note: string | null;
          published_at: string | null;
          score: number;
          status: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "contribution_ideas";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      list_translation_suggestions_for_moderation: {
        Args: never;
        Returns: {
          created_at: string;
          current_text: string;
          id: string;
          key_path: string;
          locale: string;
          moderated_by: string | null;
          moderation_note: string | null;
          note: string | null;
          reviewer_key: string;
          reviewer_name: string | null;
          source_text: string;
          status: string;
          suggestion: string | null;
          verdict: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "translation_suggestions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      moderate_contribution_idea: {
        Args: { _idea: string; _moderation_note?: string; _status: string };
        Returns: undefined;
      };
      moderate_translation_suggestion: {
        Args: {
          _moderation_note?: string;
          _status: string;
          _suggestion: string;
        };
        Returns: undefined;
      };
      publish_risk_forecast_snapshot: {
        Args: {
          _base_date: string;
          _scheduled_for: string;
          _snapshot_id: string;
        };
        Returns: Json;
      };
      set_broadcast_enabled: {
        Args: { _enabled: boolean };
        Returns: Json;
      };
      stage_risk_forecast_batch: {
        Args: { _rows: Json; _snapshot_id: string };
        Returns: number;
      };
    };
    Enums: {
      app_role: "admin" | "moderator" | "user";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const;
