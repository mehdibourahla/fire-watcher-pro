export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
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
    };
    Functions: {
      consume_rate_limit: {
        Args: { _bucket: string; _limit: number; _window_seconds: number };
        Returns: boolean;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      vote_on_idea: {
        Args: { _idea: string; _value: number; _voter: string };
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
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const;
