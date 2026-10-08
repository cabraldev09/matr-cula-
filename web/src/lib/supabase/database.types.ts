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
      billing_profiles: {
        Row: {
          address: Json
          document: string
          email: string
          organization_id: string
          payer_name: string
          phone: string
          updated_at: string
        }
        Insert: {
          address?: Json
          document: string
          email: string
          organization_id: string
          payer_name: string
          phone: string
          updated_at?: string
        }
        Update: {
          address?: Json
          document?: string
          email?: string
          organization_id?: string
          payer_name?: string
          phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          created_at: string
          default_team_id: string | null
          enabled: boolean
          id: string
          name: string
          organization_id: string
          phone_number_id: string | null
          provider: string
        }
        Insert: {
          created_at?: string
          default_team_id?: string | null
          enabled?: boolean
          id?: string
          name: string
          organization_id: string
          phone_number_id?: string | null
          provider: string
        }
        Update: {
          created_at?: string
          default_team_id?: string | null
          enabled?: boolean
          id?: string
          name?: string
          organization_id?: string
          phone_number_id?: string | null
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_organization_id_default_team_id_fkey"
            columns: ["organization_id", "default_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "channels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          contact_id: string
          organization_id: string
          tag_id: string
        }
        Insert: {
          contact_id: string
          organization_id: string
          tag_id: string
        }
        Update: {
          contact_id?: string
          organization_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_organization_id_contact_id_fkey"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "contact_tags_organization_id_tag_id_fkey"
            columns: ["organization_id", "tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          custom_fields: Json
          email: string | null
          id: string
          name: string
          organization_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_fields?: Json
          email?: string | null
          id?: string
          name: string
          organization_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_fields?: Json
          email?: string | null
          id?: string
          name?: string
          organization_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_to: string | null
          channel_id: string | null
          contact_id: string
          created_at: string
          id: string
          organization_id: string
          status: string
          subject: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          channel_id?: string | null
          contact_id: string
          created_at?: string
          id?: string
          organization_id: string
          status?: string
          subject?: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          channel_id?: string | null
          contact_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          status?: string
          subject?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_channel_fk"
            columns: ["organization_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "conversations_organization_id_assigned_to_fkey"
            columns: ["organization_id", "assigned_to"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "conversations_organization_id_contact_id_fkey"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_organization_id_team_id_fkey"
            columns: ["organization_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      courses: {
        Row: {
          active: boolean
          created_at: string
          default_first_monthly_cents: number
          gross_monthly_cents: number
          id: string
          modality: string
          name: string
          organization_id: string
          semesters: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_first_monthly_cents: number
          gross_monthly_cents: number
          id?: string
          modality?: string
          name: string
          organization_id: string
          semesters: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_first_monthly_cents?: number
          gross_monthly_cents?: number
          id?: string
          modality?: string
          name?: string
          organization_id?: string
          semesters?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_charges: {
        Row: {
          amount_cents: number
          confirmed_by: string | null
          created_at: string
          efi_charge_id: number | null
          id: string
          lead_id: string
          method: string
          organization_id: string
          paid_at: string | null
          payment_url: string | null
          pix_payload: string | null
          proposal_id: string | null
          status: string
        }
        Insert: {
          amount_cents: number
          confirmed_by?: string | null
          created_at?: string
          efi_charge_id?: number | null
          id?: string
          lead_id: string
          method: string
          organization_id: string
          paid_at?: string | null
          payment_url?: string | null
          pix_payload?: string | null
          proposal_id?: string | null
          status?: string
        }
        Update: {
          amount_cents?: number
          confirmed_by?: string | null
          created_at?: string
          efi_charge_id?: number | null
          id?: string
          lead_id?: string
          method?: string
          organization_id?: string
          paid_at?: string | null
          payment_url?: string | null
          pix_payload?: string | null
          proposal_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_charges_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_charges_organization_id_lead_id_fkey"
            columns: ["organization_id", "lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "enrollment_charges_organization_id_proposal_id_fkey"
            columns: ["organization_id", "proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      internal_notes: {
        Row: {
          author_id: string
          body: string
          conversation_id: string
          created_at: string
          id: string
          organization_id: string
        }
        Insert: {
          author_id?: string
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          organization_id: string
        }
        Update: {
          author_id?: string
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_notes_organization_id_author_id_fkey"
            columns: ["organization_id", "author_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "internal_notes_organization_id_conversation_id_fkey"
            columns: ["organization_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string
          email: string
          expires_at: string
          id: string
          organization_id: string
          revoked_at: string | null
          role: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by: string
          email: string
          expires_at?: string
          id?: string
          organization_id: string
          revoked_at?: string | null
          role: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string
          email?: string
          expires_at?: string
          id?: string
          organization_id?: string
          revoked_at?: string | null
          role?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_created_by_fkey"
            columns: ["organization_id", "created_by"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_cents: number
          created_at: string
          description: string
          due_at: string
          efi_charge_id: number | null
          efi_txid: string | null
          id: string
          method: string
          organization_id: string
          paid_at: string | null
          payment_url: string | null
          period_end: string
          period_start: string
          pix_copy_paste: string | null
          plan_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          description?: string
          due_at: string
          efi_charge_id?: number | null
          efi_txid?: string | null
          id?: string
          method: string
          organization_id: string
          paid_at?: string | null
          payment_url?: string | null
          period_end: string
          period_start: string
          pix_copy_paste?: string | null
          plan_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string
          due_at?: string
          efi_charge_id?: number | null
          efi_txid?: string | null
          id?: string
          method?: string
          organization_id?: string
          paid_at?: string | null
          payment_url?: string | null
          period_end?: string
          period_start?: string
          pix_copy_paste?: string | null
          plan_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_events: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          kind: string
          lead_id: string
          organization_id: string
          payload: Json
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          kind: string
          lead_id: string
          organization_id: string
          payload?: Json
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          lead_id?: string
          organization_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_organization_id_lead_id_fkey"
            columns: ["organization_id", "lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      leads: {
        Row: {
          best_time: string | null
          city: string | null
          contact_id: string
          course_id: string | null
          created_at: string
          curricular_analysis_id: string | null
          education_level: string | null
          entry_type: string | null
          has_previous_studies: boolean | null
          id: string
          incoming_messages: number
          lost_reason: string | null
          modality: string | null
          notes: string
          organization_id: string
          owner_id: string | null
          proposal_id: string | null
          score: number
          source: string
          stage: string
          stage_changed_at: string
          start_term: string | null
          temperature: string
          updated_at: string
        }
        Insert: {
          best_time?: string | null
          city?: string | null
          contact_id: string
          course_id?: string | null
          created_at?: string
          curricular_analysis_id?: string | null
          education_level?: string | null
          entry_type?: string | null
          has_previous_studies?: boolean | null
          id?: string
          incoming_messages?: number
          lost_reason?: string | null
          modality?: string | null
          notes?: string
          organization_id: string
          owner_id?: string | null
          proposal_id?: string | null
          score?: number
          source?: string
          stage?: string
          stage_changed_at?: string
          start_term?: string | null
          temperature?: string
          updated_at?: string
        }
        Update: {
          best_time?: string | null
          city?: string | null
          contact_id?: string
          course_id?: string | null
          created_at?: string
          curricular_analysis_id?: string | null
          education_level?: string | null
          entry_type?: string | null
          has_previous_studies?: boolean | null
          id?: string
          incoming_messages?: number
          lost_reason?: string | null
          modality?: string | null
          notes?: string
          organization_id?: string
          owner_id?: string | null
          proposal_id?: string | null
          score?: number
          source?: string
          stage?: string
          stage_changed_at?: string
          start_term?: string | null
          temperature?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_organization_id_contact_id_fkey"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "leads_organization_id_course_id_fkey"
            columns: ["organization_id", "course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organization_id_owner_id_fkey"
            columns: ["organization_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "leads_proposal_fkey"
            columns: ["organization_id", "proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      memberships: {
        Row: {
          active: boolean
          created_at: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          organization_id: string
          role: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          channel_id: string
          conversation_id: string
          created_at: string
          direction: string
          error_code: string | null
          id: string
          occurred_at: string
          organization_id: string
          provider_message_id: string | null
          request_id: string | null
          sender_id: string | null
          status: string
        }
        Insert: {
          body: string
          channel_id: string
          conversation_id: string
          created_at?: string
          direction: string
          error_code?: string | null
          id?: string
          occurred_at?: string
          organization_id: string
          provider_message_id?: string | null
          request_id?: string | null
          sender_id?: string | null
          status: string
        }
        Update: {
          body?: string
          channel_id?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          error_code?: string | null
          id?: string
          occurred_at?: string
          organization_id?: string
          provider_message_id?: string | null
          request_id?: string | null
          sender_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_organization_id_channel_id_fkey"
            columns: ["organization_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "messages_organization_id_conversation_id_fkey"
            columns: ["organization_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "messages_organization_id_sender_id_fkey"
            columns: ["organization_id", "sender_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
        ]
      }
      modules: {
        Row: {
          code: string
          description: string
          name: string
          sort_order: number
        }
        Insert: {
          code: string
          description?: string
          name: string
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      organization_addons: {
        Row: {
          created_at: string
          expires_at: string | null
          module: string
          note: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          module: string
          note?: string
          organization_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          module?: string
          note?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_addons_module_fkey"
            columns: ["module"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "organization_addons_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          brand_color: string
          created_at: string
          email_domain: string | null
          id: string
          logo_path: string | null
          name: string
          slug: string | null
          timezone: string
        }
        Insert: {
          brand_color?: string
          created_at?: string
          email_domain?: string | null
          id?: string
          logo_path?: string | null
          name: string
          slug?: string | null
          timezone?: string
        }
        Update: {
          brand_color?: string
          created_at?: string
          email_domain?: string | null
          id?: string
          logo_path?: string | null
          name?: string
          slug?: string | null
          timezone?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          active: boolean
          billing_interval: string
          code: string
          created_at: string
          description: string
          efi_plan_id: number | null
          id: string
          is_public: boolean
          limits: Json
          modules: string[]
          name: string
          price_cents: number
          sort_order: number
          trial_days: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          billing_interval?: string
          code: string
          created_at?: string
          description?: string
          efi_plan_id?: number | null
          id?: string
          is_public?: boolean
          limits?: Json
          modules?: string[]
          name: string
          price_cents: number
          sort_order?: number
          trial_days?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          billing_interval?: string
          code?: string
          created_at?: string
          description?: string
          efi_plan_id?: number | null
          id?: string
          is_public?: boolean
          limits?: Json
          modules?: string[]
          name?: string
          price_cents?: number
          sort_order?: number
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      proposal_settings: {
        Row: {
          final_message: string
          institution_document: string
          institution_name: string
          logo_path: string | null
          logo_source: string
          organization_id: string
          pix_city: string | null
          pix_key: string | null
          pix_merchant_name: string | null
          projection_note: string
          rules: Json
          updated_at: string
        }
        Insert: {
          final_message?: string
          institution_document?: string
          institution_name?: string
          logo_path?: string | null
          logo_source?: string
          organization_id: string
          pix_city?: string | null
          pix_key?: string | null
          pix_merchant_name?: string | null
          projection_note?: string
          rules?: Json
          updated_at?: string
        }
        Update: {
          final_message?: string
          institution_document?: string
          institution_name?: string
          logo_path?: string | null
          logo_source?: string
          organization_id?: string
          pix_city?: string | null
          pix_key?: string | null
          pix_merchant_name?: string | null
          projection_note?: string
          rules?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          course_name: string
          created_at: string
          created_by: string | null
          enrollment_fee_cents: number
          first_monthly_cents: number
          gross_monthly_cents: number
          id: string
          lead_id: string | null
          modality: string
          number: number
          organization_id: string
          public_token: string
          semesters: number
          snapshot: Json
          start_term: string
          status: string
          student_name: string
        }
        Insert: {
          course_name: string
          created_at?: string
          created_by?: string | null
          enrollment_fee_cents: number
          first_monthly_cents: number
          gross_monthly_cents: number
          id?: string
          lead_id?: string | null
          modality?: string
          number?: number
          organization_id: string
          public_token?: string
          semesters: number
          snapshot?: Json
          start_term: string
          status?: string
          student_name: string
        }
        Update: {
          course_name?: string
          created_at?: string
          created_by?: string | null
          enrollment_fee_cents?: number
          first_monthly_cents?: number
          gross_monthly_cents?: number
          id?: string
          lead_id?: string | null
          modality?: string
          number?: number
          organization_id?: string
          public_token?: string
          semesters?: number
          snapshot?: Json
          start_term?: string
          status?: string
          student_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_organization_id_lead_id_fkey"
            columns: ["organization_id", "lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      quick_answers: {
        Row: {
          body: string
          created_at: string
          id: string
          organization_id: string
          shortcut: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          organization_id: string
          shortcut: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          organization_id?: string
          shortcut?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_answers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string
          current_period_start: string
          efi_subscription_id: number | null
          organization_id: string
          payment_method: string | null
          pending_plan_id: string | null
          plan_id: string
          status: string
          trial_used: boolean
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end: string
          current_period_start?: string
          efi_subscription_id?: number | null
          organization_id: string
          payment_method?: string | null
          pending_plan_id?: string | null
          plan_id: string
          status: string
          trial_used?: boolean
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          efi_subscription_id?: number | null
          organization_id?: string
          payment_method?: string | null
          pending_plan_id?: string | null
          plan_id?: string
          status?: string
          trial_used?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_pending_plan_id_fkey"
            columns: ["pending_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          color?: string
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          color?: string
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          organization_id: string
          team_id: string
          user_id: string
        }
        Insert: {
          organization_id: string
          team_id: string
          user_id: string
        }
        Update: {
          organization_id?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_organization_id_team_id_fkey"
            columns: ["organization_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "team_members_organization_id_user_id_fkey"
            columns: ["organization_id", "user_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
        ]
      }
      teams: {
        Row: {
          color: string
          created_at: string
          greeting_message: string
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          greeting_message?: string
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          color?: string
          created_at?: string
          greeting_message?: string
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_counters: {
        Row: {
          metric: string
          organization_id: string
          period_start: string
          used: number
        }
        Insert: {
          metric: string
          organization_id: string
          period_start: string
          used?: number
        }
        Update: {
          metric?: string
          organization_id?: string
          period_start?: string
          used?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: {
        Args: { display_name: string; invite_token: string }
        Returns: string
      }
      am_platform_admin: { Args: never; Returns: boolean }
      billing_apply_event: {
        Args: {
          amount: number
          efi_charge: number
          efi_subscription: number
          event_id: string
          kind: string
          occurred_at: string
          org: string
          payload: Json
        }
        Returns: boolean
      }
      claim_conversation: { Args: { conversation: string }; Returns: undefined }
      close_conversation: { Args: { conversation: string }; Returns: undefined }
      confirm_enrollment_charge: {
        Args: { charge?: string; efi_charge?: number }
        Returns: boolean
      }
      consume_quota: {
        Args: { amount?: number; metric: string; org: string }
        Returns: number
      }
      create_channel: {
        Args: {
          channel_name: string
          channel_provider: string
          org: string
          phone_id?: string
          team?: string
        }
        Returns: string
      }
      create_organization: {
        Args: { display_name: string; org_name: string }
        Returns: string
      }
      invite_member: {
        Args: { invite_email: string; invite_role: string; org: string }
        Returns: Json
      }
      my_entitlements: { Args: { org: string }; Returns: Json }
      queue_message: {
        Args: {
          conversation: string
          idempotency_key: string
          message_body: string
        }
        Returns: string
      }
      remove_member: {
        Args: { member: string; org: string }
        Returns: undefined
      }
      revoke_invitation: { Args: { invitation_id: string }; Returns: undefined }
      set_channel_enabled: {
        Args: { active: boolean; channel: string }
        Returns: undefined
      }
      set_member_role: {
        Args: { member: string; new_role: string; org: string }
        Returns: undefined
      }
      simulate_incoming: {
        Args: {
          channel: string
          contact_name: string
          event_id: string
          message_body: string
          phone: string
        }
        Returns: string
      }
      start_trial: {
        Args: { org: string; plan_code: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

