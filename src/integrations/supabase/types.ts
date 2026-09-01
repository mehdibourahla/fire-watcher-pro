export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      admin_units: {
        Row: {
          code: string
          created_at: string
          forest_fraction: number
          geom: Json | null
          id: string
          landcover: Json | null
          lat: number
          level: string
          lon: number
          name_ar: string
          name_en: string
          name_fr: string
          name_kab: string | null
          parent_id: string | null
          population: number | null
          terrain: Json | null
        }
        Insert: {
          code: string
          created_at?: string
          forest_fraction?: number
          geom?: Json | null
          id?: string
          landcover?: Json | null
          lat: number
          level: string
          lon: number
          name_ar: string
          name_en: string
          name_fr: string
          name_kab?: string | null
          parent_id?: string | null
          population?: number | null
          terrain?: Json | null
        }
        Update: {
          code?: string
          created_at?: string
          forest_fraction?: number
          geom?: Json | null
          id?: string
          landcover?: Json | null
          lat?: number
          level?: string
          lon?: number
          name_ar?: string
          name_en?: string
          name_fr?: string
          name_kab?: string | null
          parent_id?: string | null
          population?: number | null
          terrain?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_units_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "admin_units"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          body: string
          cap_alert_id: string | null
          cluster_id: string | null
          commune_id: string | null
          created_at: string
          dedupe_key: string
          delivered_email: boolean
          delivered_webhook: boolean
          distance_km: number | null
          id: string
          kind: string
          payload: Json | null
          read_at: string | null
          severity: number
          title: string
          user_id: string
          zone_id: string | null
        }
        Insert: {
          body: string
          cap_alert_id?: string | null
          cluster_id?: string | null
          commune_id?: string | null
          created_at?: string
          dedupe_key: string
          delivered_email?: boolean
          delivered_webhook?: boolean
          distance_km?: number | null
          id?: string
          kind: string
          payload?: Json | null
          read_at?: string | null
          severity?: number
          title: string
          user_id: string
          zone_id?: string | null
        }
        Update: {
          body?: string
          cap_alert_id?: string | null
          cluster_id?: string | null
          commune_id?: string | null
          created_at?: string
          dedupe_key?: string
          delivered_email?: boolean
          delivered_webhook?: boolean
          distance_km?: number | null
          id?: string
          kind?: string
          payload?: Json | null
          read_at?: string | null
          severity?: number
          title?: string
          user_id?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_cap_alert_id_fkey"
            columns: ["cap_alert_id"]
            isOneToOne: false
            referencedRelation: "cap_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "fire_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_commune_id_fkey"
            columns: ["commune_id"]
            isOneToOne: false
            referencedRelation: "admin_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      authority_warnings: {
        Row: {
          body: string
          commune_codes: string[] | null
          created_at: string
          created_by: string | null
          id: string
          received_via: string
          severity: string
          source: string
          wilaya_id: string | null
        }
        Insert: {
          body: string
          commune_codes?: string[] | null
          created_at?: string
          created_by?: string | null
          id?: string
          received_via: string
          severity: string
          source: string
          wilaya_id?: string | null
        }
        Update: {
          body?: string
          commune_codes?: string[] | null
          created_at?: string
          created_by?: string | null
          id?: string
          received_via?: string
          severity?: string
          source?: string
          wilaya_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "authority_warnings_wilaya_id_fkey"
            columns: ["wilaya_id"]
            isOneToOne: false
            referencedRelation: "admin_units"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_audit: {
        Row: {
          action: string
          actor_id: string | null
          at: string
          cluster_id: string | null
          commune_codes: string[] | null
          id: string
          kind: string | null
          onm_vigilance_id: string | null
          payload: Json | null
          phase: string | null
          reason: string
          severity: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          at?: string
          cluster_id?: string | null
          commune_codes?: string[] | null
          id?: string
          kind?: string | null
          onm_vigilance_id?: string | null
          payload?: Json | null
          phase?: string | null
          reason: string
          severity?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          at?: string
          cluster_id?: string | null
          commune_codes?: string[] | null
          id?: string
          kind?: string | null
          onm_vigilance_id?: string | null
          payload?: Json | null
          phase?: string | null
          reason?: string
          severity?: string | null
        }
        Relationships: []
      }
      broadcast_settings: {
        Row: {
          enabled: boolean
          id: boolean
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          id?: boolean
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      broadcasts: {
        Row: {
          authority_warning_id: string | null
          cap_alert_id: string | null
          cluster_id: string | null
          commune_codes: string[]
          created_at: string
          fcm_delivered_at: string | null
          fcm_topics: number | null
          id: string
          kind: string
          onm_vigilance_id: string | null
          phase: string
          severity: string
          telegram_channels: number | null
          telegram_delivered_at: string | null
        }
        Insert: {
          authority_warning_id?: string | null
          cap_alert_id?: string | null
          cluster_id?: string | null
          commune_codes: string[]
          created_at?: string
          fcm_delivered_at?: string | null
          fcm_topics?: number | null
          id?: string
          kind: string
          onm_vigilance_id?: string | null
          phase?: string
          severity: string
          telegram_channels?: number | null
          telegram_delivered_at?: string | null
        }
        Update: {
          authority_warning_id?: string | null
          cap_alert_id?: string | null
          cluster_id?: string | null
          commune_codes?: string[]
          created_at?: string
          fcm_delivered_at?: string | null
          fcm_topics?: number | null
          id?: string
          kind?: string
          onm_vigilance_id?: string | null
          phase?: string
          severity?: string
          telegram_channels?: number | null
          telegram_delivered_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_authority_warning_id_fkey"
            columns: ["authority_warning_id"]
            isOneToOne: false
            referencedRelation: "authority_warnings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_cap_alert_id_fkey"
            columns: ["cap_alert_id"]
            isOneToOne: false
            referencedRelation: "cap_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "fire_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_onm_vigilance_id_fkey"
            columns: ["onm_vigilance_id"]
            isOneToOne: false
            referencedRelation: "onm_vigilance"
            referencedColumns: ["id"]
          },
        ]
      }
      cap_alerts: {
        Row: {
          cap_references: string | null
          cluster_id: string | null
          created_at: string
          id: string
          identifier: string
          info: Json
          msg_type: string
          scope: string
          sender: string
          sent: string
          status: string
        }
        Insert: {
          cap_references?: string | null
          cluster_id?: string | null
          created_at?: string
          id?: string
          identifier: string
          info: Json
          msg_type: string
          scope: string
          sender: string
          sent: string
          status: string
        }
        Update: {
          cap_references?: string | null
          cluster_id?: string | null
          created_at?: string
          id?: string
          identifier?: string
          info?: Json
          msg_type?: string
          scope?: string
          sender?: string
          sent?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cap_alerts_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "fire_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      citizen_reports: {
        Row: {
          cluster_id: string | null
          commune_id: string | null
          created_at: string
          id: string
          kind: string
          lat: number
          lon: number
          moderation_note: string | null
          note: string | null
          observed_at: string
          photo_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sighting: string
          size_hint: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cluster_id?: string | null
          commune_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          lat: number
          lon: number
          moderation_note?: string | null
          note?: string | null
          observed_at?: string
          photo_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sighting?: string
          size_hint?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cluster_id?: string | null
          commune_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          lat?: number
          lon?: number
          moderation_note?: string | null
          note?: string | null
          observed_at?: string
          photo_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sighting?: string
          size_hint?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "citizen_reports_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "fire_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citizen_reports_commune_id_fkey"
            columns: ["commune_id"]
            isOneToOne: false
            referencedRelation: "admin_units"
            referencedColumns: ["id"]
          },
        ]
      }
      cluster_events: {
        Row: {
          at: string
          cluster_id: string
          event: string
          id: string
          payload: Json | null
        }
        Insert: {
          at?: string
          cluster_id: string
          event: string
          id?: string
          payload?: Json | null
        }
        Update: {
          at?: string
          cluster_id?: string
          event?: string
          id?: string
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "cluster_events_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "fire_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      contribution_idea_votes: {
        Row: {
          created_at: string
          idea_id: string
          value: number
          voter_key: string
        }
        Insert: {
          created_at?: string
          idea_id: string
          value: number
          voter_key: string
        }
        Update: {
          created_at?: string
          idea_id?: string
          value?: number
          voter_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "contribution_idea_votes_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "contribution_ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contribution_idea_votes_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "published_contribution_ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      contribution_ideas: {
        Row: {
          contact: string | null
          created_at: string
          id: string
          lane: string
          locale: string
          message: string
          moderated_by: string | null
          moderation_note: string | null
          published_at: string | null
          score: number
          status: string
        }
        Insert: {
          contact?: string | null
          created_at?: string
          id?: string
          lane?: string
          locale?: string
          message: string
          moderated_by?: string | null
          moderation_note?: string | null
          published_at?: string | null
          score?: number
          status?: string
        }
        Update: {
          contact?: string | null
          created_at?: string
          id?: string
          lane?: string
          locale?: string
          message?: string
          moderated_by?: string | null
          moderation_note?: string | null
          published_at?: string | null
          score?: number
          status?: string
        }
        Relationships: []
      }
      data_sources: {
        Row: {
          id: string
          label: string
          last_ok_at: string | null
          name: string
          note: string | null
          status: string
          updated_at: string
        }
        Insert: {
          id?: string
          label: string
          last_ok_at?: string | null
          name: string
          note?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          id?: string
          label?: string
          last_ok_at?: string | null
          name?: string
          note?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      detections: {
        Row: {
          cluster_id: string | null
          confidence_raw: number
          created_at: string
          daynight: string | null
          detected_at: string
          fp_reason: string | null
          frp_mw: number | null
          id: string
          lat: number
          lon: number
          natural_key: string
          raw: Json | null
          sensor: string
          source: string
        }
        Insert: {
          cluster_id?: string | null
          confidence_raw: number
          created_at?: string
          daynight?: string | null
          detected_at: string
          fp_reason?: string | null
          frp_mw?: number | null
          id?: string
          lat: number
          lon: number
          natural_key: string
          raw?: Json | null
          sensor: string
          source: string
        }
        Update: {
          cluster_id?: string | null
          confidence_raw?: number
          created_at?: string
          daynight?: string | null
          detected_at?: string
          fp_reason?: string | null
          frp_mw?: number | null
          id?: string
          lat?: number
          lon?: number
          natural_key?: string
          raw?: Json | null
          sensor?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "detections_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "fire_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      effis_danger: {
        Row: {
          commune_id: string
          created_at: string
          danger_class: string
          date: string
          id: string
        }
        Insert: {
          commune_id: string
          created_at?: string
          danger_class: string
          date: string
          id?: string
        }
        Update: {
          commune_id?: string
          created_at?: string
          danger_class?: string
          date?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "effis_danger_commune_id_fkey"
            columns: ["commune_id"]
            isOneToOne: false
            referencedRelation: "admin_units"
            referencedColumns: ["id"]
          },
        ]
      }
      fire_clusters: {
        Row: {
          commune_id: string | null
          confidence: number
          created_at: string
          detection_count: number
          est_area_ha: number | null
          first_detected_at: string
          hull: Json | null
          id: string
          last_detected_at: string
          lat: number
          lon: number
          max_frp_mw: number | null
          nearest_settlement_id: string | null
          nearest_settlement_km: number | null
          resolution_note: string | null
          resolution_reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          short_id: string
          sources: string[]
          spread_bearing_deg: number | null
          state: string
          suspected_persistent_source: boolean
          updated_at: string
          wilaya_id: string | null
          wind_dir_deg: number | null
          wind_speed_kmh: number | null
        }
        Insert: {
          commune_id?: string | null
          confidence?: number
          created_at?: string
          detection_count?: number
          est_area_ha?: number | null
          first_detected_at: string
          hull?: Json | null
          id?: string
          last_detected_at: string
          lat: number
          lon: number
          max_frp_mw?: number | null
          nearest_settlement_id?: string | null
          nearest_settlement_km?: number | null
          resolution_note?: string | null
          resolution_reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          short_id: string
          sources?: string[]
          spread_bearing_deg?: number | null
          state?: string
          suspected_persistent_source?: boolean
          updated_at?: string
          wilaya_id?: string | null
          wind_dir_deg?: number | null
          wind_speed_kmh?: number | null
        }
        Update: {
          commune_id?: string | null
          confidence?: number
          created_at?: string
          detection_count?: number
          est_area_ha?: number | null
          first_detected_at?: string
          hull?: Json | null
          id?: string
          last_detected_at?: string
          lat?: number
          lon?: number
          max_frp_mw?: number | null
          nearest_settlement_id?: string | null
          nearest_settlement_km?: number | null
          resolution_note?: string | null
          resolution_reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          short_id?: string
          sources?: string[]
          spread_bearing_deg?: number | null
          state?: string
          suspected_persistent_source?: boolean
          updated_at?: string
          wilaya_id?: string | null
          wind_dir_deg?: number | null
          wind_speed_kmh?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fire_clusters_commune_id_fkey"
            columns: ["commune_id"]
            isOneToOne: false
            referencedRelation: "admin_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fire_clusters_nearest_settlement_id_fkey"
            columns: ["nearest_settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fire_clusters_wilaya_id_fkey"
            columns: ["wilaya_id"]
            isOneToOne: false
            referencedRelation: "admin_units"
            referencedColumns: ["id"]
          },
        ]
      }
      fwi_state: {
        Row: {
          commune_id: string
          date: string
          dc: number
          dmc: number
          ffmc: number
          inputs: string
          updated_at: string
        }
        Insert: {
          commune_id: string
          date: string
          dc: number
          dmc: number
          ffmc: number
          inputs?: string
          updated_at?: string
        }
        Update: {
          commune_id?: string
          date?: string
          dc?: number
          dmc?: number
          ffmc?: number
          inputs?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fwi_state_commune_id_fkey"
            columns: ["commune_id"]
            isOneToOne: false
            referencedRelation: "admin_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ingest_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          records_in: number
          records_new: number
          source: string
          started_at: string
          status: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          records_in?: number
          records_new?: number
          source: string
          started_at?: string
          status?: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          records_in?: number
          records_new?: number
          source?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      onm_vigilance: {
        Row: {
          area_desc: string
          cap_id: string
          cap_url: string | null
          certainty: string
          created_at: string
          event: string
          expires: string | null
          headline_fr: string | null
          id: string
          instruction_fr: string | null
          onset: string | null
          polygon: Json | null
          sent: string
          severity: string
          title: string
          urgency: string
          wilaya_id: string | null
        }
        Insert: {
          area_desc: string
          cap_id: string
          cap_url?: string | null
          certainty: string
          created_at?: string
          event: string
          expires?: string | null
          headline_fr?: string | null
          id?: string
          instruction_fr?: string | null
          onset?: string | null
          polygon?: Json | null
          sent: string
          severity: string
          title: string
          urgency: string
          wilaya_id?: string | null
        }
        Update: {
          area_desc?: string
          cap_id?: string
          cap_url?: string | null
          certainty?: string
          created_at?: string
          event?: string
          expires?: string | null
          headline_fr?: string | null
          id?: string
          instruction_fr?: string | null
          onset?: string | null
          polygon?: Json | null
          sent?: string
          severity?: string
          title?: string
          urgency?: string
          wilaya_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onm_vigilance_wilaya_id_fkey"
            columns: ["wilaya_id"]
            isOneToOne: false
            referencedRelation: "admin_units"
            referencedColumns: ["id"]
          },
        ]
      }
      open_areas: {
        Row: {
          area_type: string
          commune_id: string | null
          created_at: string
          id: string
          lat: number
          lon: number
          name: string
          name_ar: string | null
          osm_id: number | null
          osm_type: string | null
          source: string
          verified_at: string | null
          verified_by: string | null
          verified_note: string | null
        }
        Insert: {
          area_type: string
          commune_id?: string | null
          created_at?: string
          id?: string
          lat: number
          lon: number
          name: string
          name_ar?: string | null
          osm_id?: number | null
          osm_type?: string | null
          source?: string
          verified_at?: string | null
          verified_by?: string | null
          verified_note?: string | null
        }
        Update: {
          area_type?: string
          commune_id?: string | null
          created_at?: string
          id?: string
          lat?: number
          lon?: number
          name?: string
          name_ar?: string | null
          osm_id?: number | null
          osm_type?: string | null
          source?: string
          verified_at?: string | null
          verified_by?: string | null
          verified_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "open_areas_commune_id_fkey"
            columns: ["commune_id"]
            isOneToOne: false
            referencedRelation: "admin_units"
            referencedColumns: ["id"]
          },
        ]
      }
      persistent_sources: {
        Row: {
          active_days: number
          created_at: string
          detection_count: number
          first_seen: string
          frp_p50: number | null
          frp_p90: number | null
          id: string
          jul_aug_share: number | null
          last_seen: string
          lat: number
          lon: number
          observation_days: number
          site_id: string
          site_name: string | null
          static_share: number
        }
        Insert: {
          active_days: number
          created_at?: string
          detection_count: number
          first_seen: string
          frp_p50?: number | null
          frp_p90?: number | null
          id?: string
          jul_aug_share?: number | null
          last_seen: string
          lat: number
          lon: number
          observation_days: number
          site_id: string
          site_name?: string | null
          static_share: number
        }
        Update: {
          active_days?: number
          created_at?: string
          detection_count?: number
          first_seen?: string
          frp_p50?: number | null
          frp_p90?: number | null
          id?: string
          jul_aug_share?: number | null
          last_seen?: string
          lat?: number
          lon?: number
          observation_days?: number
          site_id?: string
          site_name?: string | null
          static_share?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          alert_email: boolean
          alert_push: boolean
          created_at: string
          display_name: string | null
          id: string
          locale: string
          min_confidence: number
          min_danger_level: number
          phone: string | null
          quiet_hours_end: number | null
          quiet_hours_start: number | null
          updated_at: string
        }
        Insert: {
          alert_email?: boolean
          alert_push?: boolean
          created_at?: string
          display_name?: string | null
          id: string
          locale?: string
          min_confidence?: number
          min_danger_level?: number
          phone?: string | null
          quiet_hours_end?: number | null
          quiet_hours_start?: number | null
          updated_at?: string
        }
        Update: {
          alert_email?: boolean
          alert_push?: boolean
          created_at?: string
          display_name?: string | null
          id?: string
          locale?: string
          min_confidence?: number
          min_danger_level?: number
          phone?: string | null
          quiet_hours_end?: number | null
          quiet_hours_start?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      risk_forecast_snapshot_runs: {
        Row: {
          base_date: string
          created_at: string
          finished_at: string | null
          heartbeat_at: string
          scheduled_for: string
          snapshot_id: string
          status: string
        }
        Insert: {
          base_date: string
          created_at?: string
          finished_at?: string | null
          heartbeat_at?: string
          scheduled_for: string
          snapshot_id: string
          status?: string
        }
        Update: {
          base_date?: string
          created_at?: string
          finished_at?: string | null
          heartbeat_at?: string
          scheduled_for?: string
          snapshot_id?: string
          status?: string
        }
        Relationships: []
      }
      risk_forecast_staging: {
        Row: {
          commune_id: string
          components: Json | null
          danger_level: number
          forecast_date: string
          fuel_limited: boolean
          fwi: number
          horizon_days: number
          snapshot_id: string
          staged_at: string
        }
        Insert: {
          commune_id: string
          components?: Json | null
          danger_level: number
          forecast_date: string
          fuel_limited?: boolean
          fwi: number
          horizon_days: number
          snapshot_id: string
          staged_at?: string
        }
        Update: {
          commune_id?: string
          components?: Json | null
          danger_level?: number
          forecast_date?: string
          fuel_limited?: boolean
          fwi?: number
          horizon_days?: number
          snapshot_id?: string
          staged_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_forecast_staging_commune_id_fkey"
            columns: ["commune_id"]
            isOneToOne: false
            referencedRelation: "admin_units"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_forecasts: {
        Row: {
          commune_id: string
          components: Json | null
          created_at: string
          danger_level: number
          forecast_date: string
          fuel_limited: boolean
          fwi: number
          horizon_days: number
          id: string
          snapshot_id: string | null
          source: string
        }
        Insert: {
          commune_id: string
          components?: Json | null
          created_at?: string
          danger_level: number
          forecast_date: string
          fuel_limited?: boolean
          fwi: number
          horizon_days: number
          id?: string
          snapshot_id?: string | null
          source: string
        }
        Update: {
          commune_id?: string
          components?: Json | null
          created_at?: string
          danger_level?: number
          forecast_date?: string
          fuel_limited?: boolean
          fwi?: number
          horizon_days?: number
          id?: string
          snapshot_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_forecasts_commune_id_fkey"
            columns: ["commune_id"]
            isOneToOne: false
            referencedRelation: "admin_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_forecasts_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "risk_publications"
            referencedColumns: ["snapshot_id"]
          },
        ]
      }
      risk_publication_checkpoint: {
        Row: {
          base_date: string
          coverage_status: string
          key: string
          published_at: string
          scheduled_for: string
          snapshot_id: string
        }
        Insert: {
          base_date: string
          coverage_status?: string
          key: string
          published_at: string
          scheduled_for: string
          snapshot_id: string
        }
        Update: {
          base_date?: string
          coverage_status?: string
          key?: string
          published_at?: string
          scheduled_for?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_publication_checkpoint_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "risk_publications"
            referencedColumns: ["snapshot_id"]
          },
        ]
      }
      risk_publications: {
        Row: {
          base_date: string
          published_at: string
          row_count: number
          scheduled_for: string
          snapshot_id: string
        }
        Insert: {
          base_date: string
          published_at: string
          row_count: number
          scheduled_for: string
          snapshot_id: string
        }
        Update: {
          base_date?: string
          published_at?: string
          row_count?: number
          scheduled_for?: string
          snapshot_id?: string
        }
        Relationships: []
      }
      settlements: {
        Row: {
          commune_id: string | null
          created_at: string
          id: string
          lat: number
          lon: number
          name: string
          name_ar: string | null
          osm_id: number | null
          place_type: string
          population: number | null
        }
        Insert: {
          commune_id?: string | null
          created_at?: string
          id?: string
          lat: number
          lon: number
          name: string
          name_ar?: string | null
          osm_id?: number | null
          place_type?: string
          population?: number | null
        }
        Update: {
          commune_id?: string | null
          created_at?: string
          id?: string
          lat?: number
          lon?: number
          name?: string
          name_ar?: string | null
          osm_id?: number | null
          place_type?: string
          population?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "settlements_commune_id_fkey"
            columns: ["commune_id"]
            isOneToOne: false
            referencedRelation: "admin_units"
            referencedColumns: ["id"]
          },
        ]
      }
      source_checkpoints: {
        Row: {
          consecutive_failures: number
          contract_key: string
          coverage_status: string
          data_from: string | null
          data_through: string | null
          fallback_contract_key: string | null
          last_attempt_at: string | null
          last_public_reason_code: string | null
          last_scheduled_for: string | null
          last_success_at: string | null
          published_at: string | null
          records_accepted: number
          records_expected: number | null
          replay_cursor: Json | null
          schema_fingerprint: string | null
          updated_at: string
          upstream_published_at: string | null
          validated_at: string | null
        }
        Insert: {
          consecutive_failures?: number
          contract_key: string
          coverage_status?: string
          data_from?: string | null
          data_through?: string | null
          fallback_contract_key?: string | null
          last_attempt_at?: string | null
          last_public_reason_code?: string | null
          last_scheduled_for?: string | null
          last_success_at?: string | null
          published_at?: string | null
          records_accepted?: number
          records_expected?: number | null
          replay_cursor?: Json | null
          schema_fingerprint?: string | null
          updated_at?: string
          upstream_published_at?: string | null
          validated_at?: string | null
        }
        Update: {
          consecutive_failures?: number
          contract_key?: string
          coverage_status?: string
          data_from?: string | null
          data_through?: string | null
          fallback_contract_key?: string | null
          last_attempt_at?: string | null
          last_public_reason_code?: string | null
          last_scheduled_for?: string | null
          last_success_at?: string | null
          published_at?: string | null
          records_accepted?: number
          records_expected?: number | null
          replay_cursor?: Json | null
          schema_fingerprint?: string | null
          updated_at?: string
          upstream_published_at?: string | null
          validated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "source_checkpoints_contract_key_fkey"
            columns: ["contract_key"]
            isOneToOne: true
            referencedRelation: "source_contracts"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "source_checkpoints_contract_key_fkey"
            columns: ["contract_key"]
            isOneToOne: true
            referencedRelation: "source_health"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "source_checkpoints_fallback_contract_key_fkey"
            columns: ["fallback_contract_key"]
            isOneToOne: false
            referencedRelation: "source_contracts"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "source_checkpoints_fallback_contract_key_fkey"
            columns: ["fallback_contract_key"]
            isOneToOne: false
            referencedRelation: "source_health"
            referencedColumns: ["key"]
          },
        ]
      }
      source_contracts: {
        Row: {
          attribution: string
          cadence_minutes: number
          created_at: string
          criticality: string
          dependency_keys: string[]
          enabled: boolean
          execution_target: string
          expected_coverage: Json
          family: string
          freshness_basis: string
          key: string
          label: string
          lease_seconds: number
          licence: string
          max_attempts: number
          max_fallback_age_minutes: number | null
          overlap_minutes: number
          owner: string
          parser_version: string
          replay_capability: string
          replay_window_minutes: number | null
          retry_base_seconds: number
          retry_window_minutes: number
          runbook_url: string | null
          schedule_enabled: boolean
          schedule_offset_minutes: number
          stale_after_minutes: number
          updated_at: string
          version: number
          warning_after_minutes: number
        }
        Insert: {
          attribution: string
          cadence_minutes: number
          created_at?: string
          criticality: string
          dependency_keys?: string[]
          enabled?: boolean
          execution_target?: string
          expected_coverage?: Json
          family: string
          freshness_basis: string
          key: string
          label: string
          lease_seconds?: number
          licence: string
          max_attempts?: number
          max_fallback_age_minutes?: number | null
          overlap_minutes?: number
          owner: string
          parser_version: string
          replay_capability?: string
          replay_window_minutes?: number | null
          retry_base_seconds?: number
          retry_window_minutes?: number
          runbook_url?: string | null
          schedule_enabled?: boolean
          schedule_offset_minutes?: number
          stale_after_minutes: number
          updated_at?: string
          version: number
          warning_after_minutes: number
        }
        Update: {
          attribution?: string
          cadence_minutes?: number
          created_at?: string
          criticality?: string
          dependency_keys?: string[]
          enabled?: boolean
          execution_target?: string
          expected_coverage?: Json
          family?: string
          freshness_basis?: string
          key?: string
          label?: string
          lease_seconds?: number
          licence?: string
          max_attempts?: number
          max_fallback_age_minutes?: number | null
          overlap_minutes?: number
          owner?: string
          parser_version?: string
          replay_capability?: string
          replay_window_minutes?: number | null
          retry_base_seconds?: number
          retry_window_minutes?: number
          runbook_url?: string | null
          schedule_enabled?: boolean
          schedule_offset_minutes?: number
          stale_after_minutes?: number
          updated_at?: string
          version?: number
          warning_after_minutes?: number
        }
        Relationships: []
      }
      source_gaps: {
        Row: {
          contract_key: string
          data_from: string
          data_through: string
          detected_at: string
          id: string
          public_reason_code: string | null
          replay_count: number
          resolved_at: string | null
          resolved_by_run_id: string | null
          state: string
          updated_at: string
        }
        Insert: {
          contract_key: string
          data_from: string
          data_through: string
          detected_at?: string
          id?: string
          public_reason_code?: string | null
          replay_count?: number
          resolved_at?: string | null
          resolved_by_run_id?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          contract_key?: string
          data_from?: string
          data_through?: string
          detected_at?: string
          id?: string
          public_reason_code?: string | null
          replay_count?: number
          resolved_at?: string | null
          resolved_by_run_id?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_gaps_contract_key_fkey"
            columns: ["contract_key"]
            isOneToOne: false
            referencedRelation: "source_contracts"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "source_gaps_contract_key_fkey"
            columns: ["contract_key"]
            isOneToOne: false
            referencedRelation: "source_health"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "source_gaps_resolved_by_run_id_fkey"
            columns: ["resolved_by_run_id"]
            isOneToOne: false
            referencedRelation: "source_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      source_job_leases: {
        Row: {
          attempt: number
          contract_key: string
          job_id: string
          lease_expires_at: string
          leased_at: string
          worker_id: string
        }
        Insert: {
          attempt: number
          contract_key: string
          job_id: string
          lease_expires_at: string
          leased_at: string
          worker_id: string
        }
        Update: {
          attempt?: number
          contract_key?: string
          job_id?: string
          lease_expires_at?: string
          leased_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_job_leases_contract_key_fkey"
            columns: ["contract_key"]
            isOneToOne: true
            referencedRelation: "source_contracts"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "source_job_leases_contract_key_fkey"
            columns: ["contract_key"]
            isOneToOne: true
            referencedRelation: "source_health"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "source_job_leases_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "source_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      source_jobs: {
        Row: {
          attempt_count: number
          available_at: string
          contract_key: string
          contract_version: number
          created_at: string
          data_from: string
          data_through: string
          enqueued_by: string[]
          execution_target: string
          finished_at: string | null
          gap_id: string | null
          id: string
          idempotency_key: string
          last_error_at: string | null
          last_public_reason_code: string | null
          max_attempts: number
          retry_base_seconds: number
          retry_until: string
          scheduled_for: string
          started_at: string | null
          state: string
          trigger_kind: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          contract_key: string
          contract_version: number
          created_at?: string
          data_from: string
          data_through: string
          enqueued_by?: string[]
          execution_target: string
          finished_at?: string | null
          gap_id?: string | null
          id?: string
          idempotency_key: string
          last_error_at?: string | null
          last_public_reason_code?: string | null
          max_attempts: number
          retry_base_seconds: number
          retry_until: string
          scheduled_for: string
          started_at?: string | null
          state?: string
          trigger_kind: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          contract_key?: string
          contract_version?: number
          created_at?: string
          data_from?: string
          data_through?: string
          enqueued_by?: string[]
          execution_target?: string
          finished_at?: string | null
          gap_id?: string | null
          id?: string
          idempotency_key?: string
          last_error_at?: string | null
          last_public_reason_code?: string | null
          max_attempts?: number
          retry_base_seconds?: number
          retry_until?: string
          scheduled_for?: string
          started_at?: string | null
          state?: string
          trigger_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_jobs_contract_key_fkey"
            columns: ["contract_key"]
            isOneToOne: false
            referencedRelation: "source_contracts"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "source_jobs_contract_key_fkey"
            columns: ["contract_key"]
            isOneToOne: false
            referencedRelation: "source_health"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "source_jobs_gap_id_fkey"
            columns: ["gap_id"]
            isOneToOne: false
            referencedRelation: "source_gaps"
            referencedColumns: ["id"]
          },
        ]
      }
      source_runs: {
        Row: {
          attempt: number | null
          contract_key: string
          contract_version: number
          coverage_status: string
          created_at: string
          data_from: string | null
          data_through: string | null
          finished_at: string | null
          id: string
          idempotency_key: string | null
          job_id: string | null
          outcome: string
          private_diagnostic: string | null
          public_reason_code: string | null
          published_at: string | null
          quality_checks: Json
          records_expected: number | null
          records_inserted: number
          records_rejected: number
          records_seen: number
          records_updated: number
          scheduled_for: string
          started_at: string
          trigger_kind: string
          upstream_published_at: string | null
          validated_at: string | null
        }
        Insert: {
          attempt?: number | null
          contract_key: string
          contract_version: number
          coverage_status?: string
          created_at?: string
          data_from?: string | null
          data_through?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          job_id?: string | null
          outcome: string
          private_diagnostic?: string | null
          public_reason_code?: string | null
          published_at?: string | null
          quality_checks?: Json
          records_expected?: number | null
          records_inserted?: number
          records_rejected?: number
          records_seen?: number
          records_updated?: number
          scheduled_for: string
          started_at: string
          trigger_kind: string
          upstream_published_at?: string | null
          validated_at?: string | null
        }
        Update: {
          attempt?: number | null
          contract_key?: string
          contract_version?: number
          coverage_status?: string
          created_at?: string
          data_from?: string | null
          data_through?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          job_id?: string | null
          outcome?: string
          private_diagnostic?: string | null
          public_reason_code?: string | null
          published_at?: string | null
          quality_checks?: Json
          records_expected?: number | null
          records_inserted?: number
          records_rejected?: number
          records_seen?: number
          records_updated?: number
          scheduled_for?: string
          started_at?: string
          trigger_kind?: string
          upstream_published_at?: string | null
          validated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "source_runs_contract_key_fkey"
            columns: ["contract_key"]
            isOneToOne: false
            referencedRelation: "source_contracts"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "source_runs_contract_key_fkey"
            columns: ["contract_key"]
            isOneToOne: false
            referencedRelation: "source_health"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "source_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "source_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      telegram_channels: {
        Row: {
          chat_id: string
          created_at: string
          wilaya_id: string
        }
        Insert: {
          chat_id: string
          created_at?: string
          wilaya_id: string
        }
        Update: {
          chat_id?: string
          created_at?: string
          wilaya_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_channels_wilaya_id_fkey"
            columns: ["wilaya_id"]
            isOneToOne: true
            referencedRelation: "admin_units"
            referencedColumns: ["id"]
          },
        ]
      }
      translation_suggestions: {
        Row: {
          created_at: string
          current_text: string
          id: string
          key_path: string
          locale: string
          moderated_by: string | null
          moderation_note: string | null
          note: string | null
          reviewer_key: string
          reviewer_name: string | null
          source_text: string
          status: string
          suggestion: string | null
          verdict: string
        }
        Insert: {
          created_at?: string
          current_text: string
          id?: string
          key_path: string
          locale: string
          moderated_by?: string | null
          moderation_note?: string | null
          note?: string | null
          reviewer_key: string
          reviewer_name?: string | null
          source_text: string
          status?: string
          suggestion?: string | null
          verdict: string
        }
        Update: {
          created_at?: string
          current_text?: string
          id?: string
          key_path?: string
          locale?: string
          moderated_by?: string | null
          moderation_note?: string | null
          note?: string | null
          reviewer_key?: string
          reviewer_name?: string | null
          source_text?: string
          status?: string
          suggestion?: string | null
          verdict?: string
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
      webhook_deliveries: {
        Row: {
          alert_id: string | null
          created_at: string
          endpoint_id: string
          error: string | null
          id: string
          ok: boolean
          status_code: number | null
          user_id: string
        }
        Insert: {
          alert_id?: string | null
          created_at?: string
          endpoint_id: string
          error?: string | null
          id?: string
          ok?: boolean
          status_code?: number | null
          user_id: string
        }
        Update: {
          alert_id?: string | null
          created_at?: string
          endpoint_id?: string
          error?: string | null
          id?: string
          ok?: boolean
          status_code?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kinds: string[]
          label: string
          last_attempt_at: string | null
          last_error: string | null
          last_status: number | null
          min_severity: number
          secret: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kinds?: string[]
          label: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_status?: number | null
          min_severity?: number
          secret?: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kinds?: string[]
          label?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_status?: number | null
          min_severity?: number
          secret?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      zones: {
        Row: {
          active: boolean
          commune_id: string | null
          created_at: string
          id: string
          lat: number
          lon: number
          min_danger_level: number
          name: string
          notify_fires: boolean
          notify_risk: boolean
          radius_km: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          commune_id?: string | null
          created_at?: string
          id?: string
          lat: number
          lon: number
          min_danger_level?: number
          name: string
          notify_fires?: boolean
          notify_risk?: boolean
          radius_km?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          commune_id?: string | null
          created_at?: string
          id?: string
          lat?: number
          lon?: number
          min_danger_level?: number
          name?: string
          notify_fires?: boolean
          notify_risk?: boolean
          radius_km?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zones_commune_id_fkey"
            columns: ["commune_id"]
            isOneToOne: false
            referencedRelation: "admin_units"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      hazard_reports: {
        Row: {
          created_at: string | null
          id: string | null
          kind: string | null
          lat: number | null
          lon: number | null
          observed_at: string | null
          sighting: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          kind?: string | null
          lat?: number | null
          lon?: number | null
          observed_at?: string | null
          sighting?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          kind?: string | null
          lat?: number | null
          lon?: number | null
          observed_at?: string | null
          sighting?: string | null
          status?: string | null
        }
        Relationships: []
      }
      published_contribution_ideas: {
        Row: {
          id: string | null
          lane: string | null
          message: string | null
          published_at: string | null
          score: number | null
        }
        Insert: {
          id?: string | null
          lane?: string | null
          message?: string | null
          published_at?: string | null
          score?: number | null
        }
        Update: {
          id?: string | null
          lane?: string | null
          message?: string | null
          published_at?: string | null
          score?: number | null
        }
        Relationships: []
      }
      source_health: {
        Row: {
          age_minutes: number | null
          coverage_status: string | null
          criticality: string | null
          fallback_contract_key: string | null
          family: string | null
          freshness_basis: string | null
          key: string | null
          label: string | null
          last_attempt_at: string | null
          last_success_at: string | null
          public_reason_code: string | null
          published_at: string | null
          records_accepted: number | null
          records_expected: number | null
          stale_after_minutes: number | null
          state: string | null
          valid_at: string | null
          warning_after_minutes: number | null
        }
        Relationships: [
          {
            foreignKeyName: "source_checkpoints_fallback_contract_key_fkey"
            columns: ["fallback_contract_key"]
            isOneToOne: false
            referencedRelation: "source_contracts"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "source_checkpoints_fallback_contract_key_fkey"
            columns: ["fallback_contract_key"]
            isOneToOne: false
            referencedRelation: "source_health"
            referencedColumns: ["key"]
          },
        ]
      }
      source_watchdog: {
        Row: {
          contract_key: string | null
          issue_code: string | null
          job_id: string | null
          lease_expires_at: string | null
          observed_at: string | null
          scheduled_for: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      begin_risk_forecast_snapshot: {
        Args: {
          _base_date: string
          _scheduled_for: string
          _snapshot_id: string
          _stale_before: string
        }
        Returns: number
      }
      claim_source_job: {
        Args: {
          _contract_key?: string
          _execution_target: string
          _now?: string
          _worker_id: string
        }
        Returns: {
          attempt_count: number
          available_at: string
          contract_key: string
          contract_version: number
          created_at: string
          data_from: string
          data_through: string
          enqueued_by: string[]
          execution_target: string
          finished_at: string | null
          gap_id: string | null
          id: string
          idempotency_key: string
          last_error_at: string | null
          last_public_reason_code: string | null
          max_attempts: number
          retry_base_seconds: number
          retry_until: string
          scheduled_for: string
          started_at: string | null
          state: string
          trigger_kind: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "source_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_source_job: {
        Args: {
          _attempt: number
          _coverage_status: string
          _data_from: string
          _data_through: string
          _finished_at: string
          _job_id: string
          _outcome: string
          _private_diagnostic: string
          _public_reason_code: string
          _published_at: string
          _quality_checks: Json
          _records_expected: number
          _records_inserted: number
          _records_rejected: number
          _records_seen: number
          _records_updated: number
          _retryable: boolean
          _upstream_published_at: string
          _validated_at: string
          _worker_id: string
        }
        Returns: {
          attempt_count: number
          available_at: string
          contract_key: string
          contract_version: number
          created_at: string
          data_from: string
          data_through: string
          enqueued_by: string[]
          execution_target: string
          finished_at: string | null
          gap_id: string | null
          id: string
          idempotency_key: string
          last_error_at: string | null
          last_public_reason_code: string | null
          max_attempts: number
          retry_base_seconds: number
          retry_until: string
          scheduled_for: string
          started_at: string | null
          state: string
          trigger_kind: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "source_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      consume_rate_limit: {
        Args: { _bucket: string; _limit: number; _window_seconds: number }
        Returns: boolean
      }
      current_risk_forecasts: {
        Args: never
        Returns: {
          admin_level: string
          commune_code: string
          commune_id: string
          components: Json
          created_at: string
          danger_level: number
          forecast_date: string
          fuel_limited: boolean
          fwi: number
          horizon_days: number
          id: string
          name_ar: string
          name_en: string
          name_fr: string
          snapshot_id: string
          source: string
        }[]
      }
      dearmor: { Args: { "": string }; Returns: string }
      disablelongtransactions: { Args: never; Returns: string }
      discard_risk_forecast_snapshot: {
        Args: {
          _base_date: string
          _scheduled_for: string
          _snapshot_id: string
        }
        Returns: boolean
      }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      enqueue_due_source_jobs: {
        Args: { _enqueued_by: string; _observed_at: string }
        Returns: number
      }
      enqueue_source_replay: {
        Args: { _gap_id: string; _requested_at?: string }
        Returns: string
      }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      gen_random_uuid: { Args: never; Returns: string }
      gen_salt: { Args: { "": string }; Returns: string }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      gettransactionid: { Args: never; Returns: unknown }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_contribution_ideas_for_moderation: {
        Args: never
        Returns: {
          contact: string | null
          created_at: string
          id: string
          lane: string
          locale: string
          message: string
          moderated_by: string | null
          moderation_note: string | null
          published_at: string | null
          score: number
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "contribution_ideas"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_translation_suggestions_for_moderation: {
        Args: never
        Returns: {
          created_at: string
          current_text: string
          id: string
          key_path: string
          locale: string
          moderated_by: string | null
          moderation_note: string | null
          note: string | null
          reviewer_key: string
          reviewer_name: string | null
          source_text: string
          status: string
          suggestion: string | null
          verdict: string
        }[]
        SetofOptions: {
          from: "*"
          to: "translation_suggestions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      moderate_contribution_idea: {
        Args: { _idea: string; _moderation_note?: string; _status: string }
        Returns: undefined
      }
      moderate_translation_suggestion: {
        Args: {
          _moderation_note?: string
          _status: string
          _suggestion: string
        }
        Returns: undefined
      }
      pgp_armor_headers: {
        Args: { "": string }
        Returns: Record<string, unknown>[]
      }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      publish_risk_forecast_snapshot: {
        Args: {
          _base_date: string
          _scheduled_for: string
          _snapshot_id: string
        }
        Returns: Json
      }
      record_source_run: {
        Args: {
          _contract_key: string
          _coverage_status: string
          _data_from: string
          _data_through: string
          _finished_at: string
          _idempotency_key: string
          _outcome: string
          _private_diagnostic: string
          _public_reason_code: string
          _published_at: string
          _quality_checks: Json
          _records_expected: number
          _records_inserted: number
          _records_rejected: number
          _records_seen: number
          _records_updated: number
          _scheduled_for: string
          _started_at: string
          _trigger_kind: string
          _upstream_published_at: string
          _validated_at: string
        }
        Returns: string
      }
      set_broadcast_enabled: { Args: { _enabled: boolean }; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      source_contract_is_backfilling: {
        Args: { _contract_key: string }
        Returns: boolean
      }
      source_job_queue_has_pending: {
        Args: {
          _contract_key?: string
          _execution_target: string
          _now?: string
        }
        Returns: boolean
      }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      stage_risk_forecast_batch: {
        Args: { _rows: Json; _snapshot_id: string }
        Returns: number
      }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      uuid_generate_v1: { Args: never; Returns: string }
      uuid_generate_v1mc: { Args: never; Returns: string }
      uuid_generate_v3: {
        Args: { name: string; namespace: string }
        Returns: string
      }
      uuid_generate_v4: { Args: never; Returns: string }
      uuid_generate_v5: {
        Args: { name: string; namespace: string }
        Returns: string
      }
      uuid_nil: { Args: never; Returns: string }
      uuid_ns_dns: { Args: never; Returns: string }
      uuid_ns_oid: { Args: never; Returns: string }
      uuid_ns_url: { Args: never; Returns: string }
      uuid_ns_x500: { Args: never; Returns: string }
      vote_on_idea: {
        Args: { _idea: string; _value: number; _voter: string }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const

