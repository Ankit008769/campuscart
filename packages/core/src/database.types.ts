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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_settings: {
        Row: { id: boolean; min_android_version_code: number; updated_at: string }
        Insert: { id?: boolean; min_android_version_code?: number; updated_at?: string }
        Update: { id?: boolean; min_android_version_code?: number; updated_at?: string }
        Relationships: []
      }
      allowed_logins: {
        Row: {
          created_at: string
          email: string
          note: string | null
          role: Database["public"]["Enums"]["user_role"]
          shop_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          note?: string | null
          role: Database["public"]["Enums"]["user_role"]
          shop_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          note?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          shop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "allowed_logins_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      app_events: {
        Row: {
          at: string
          id: number
          name: string
          shop_id: string | null
          user_id: string
        }
        Insert: {
          at?: string
          id?: never
          name: string
          shop_id?: string | null
          user_id?: string
        }
        Update: {
          at?: string
          id?: never
          name?: string
          shop_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      banners: {
        Row: {
          active: boolean
          batch: string | null
          body: string
          category_id: string | null
          created_at: string
          drop_point_id: string | null
          ends_at: string | null
          id: string
          shop_id: string | null
          starts_at: string
          title: string
        }
        Insert: {
          active?: boolean
          batch?: string | null
          body?: string
          category_id?: string | null
          created_at?: string
          drop_point_id?: string | null
          ends_at?: string | null
          id?: string
          shop_id?: string | null
          starts_at?: string
          title: string
        }
        Update: {
          active?: boolean
          batch?: string | null
          body?: string
          category_id?: string | null
          created_at?: string
          drop_point_id?: string | null
          ends_at?: string | null
          id?: string
          shop_id?: string | null
          starts_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "banners_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banners_drop_point_id_fkey"
            columns: ["drop_point_id"]
            isOneToOne: false
            referencedRelation: "drop_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banners_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_orders: {
        Row: {
          batch_id: string
          order_id: string
        }
        Insert: {
          batch_id: string
          order_id: string
        }
        Update: {
          batch_id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_orders_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          closed_at: string | null
          drop_point_id: string
          id: string
          opened_at: string
          rider_id: string
        }
        Insert: {
          closed_at?: string | null
          drop_point_id: string
          id?: string
          opened_at?: string
          rider_id: string
        }
        Update: {
          closed_at?: string | null
          drop_point_id?: string
          id?: string
          opened_at?: string
          rider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batches_drop_point_id_fkey"
            columns: ["drop_point_id"]
            isOneToOne: false
            referencedRelation: "drop_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          batch: string | null
          body: string
          drop_point_id: string | null
          id: string
          recipients: number
          sent_at: string
          sent_by: string
          title: string
        }
        Insert: {
          batch?: string | null
          body: string
          drop_point_id?: string | null
          id?: string
          recipients: number
          sent_at?: string
          sent_by: string
          title: string
        }
        Update: {
          batch?: string | null
          body?: string
          drop_point_id?: string | null
          id?: string
          recipients?: number
          sent_at?: string
          sent_by?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_drop_point_id_fkey"
            columns: ["drop_point_id"]
            isOneToOne: false
            referencedRelation: "drop_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string
          drop_point_id: string | null
          id: string
          mode: Database["public"]["Enums"]["order_mode"]
          student_id: string
          total_paise: number
        }
        Insert: {
          created_at?: string
          drop_point_id?: string | null
          id?: string
          mode: Database["public"]["Enums"]["order_mode"]
          student_id: string
          total_paise?: number
        }
        Update: {
          created_at?: string
          drop_point_id?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["order_mode"]
          student_id?: string
          total_paise?: number
        }
        Relationships: [
          {
            foreignKeyName: "carts_drop_point_id_fkey"
            columns: ["drop_point_id"]
            isOneToOne: false
            referencedRelation: "drop_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          icon: string | null
          id: string
          name: string
          sort: number
        }
        Insert: {
          icon?: string | null
          id?: string
          name: string
          sort?: number
        }
        Update: {
          icon?: string | null
          id?: string
          name?: string
          sort?: number
        }
        Relationships: []
      }
      collection_items: {
        Row: {
          collection_id: string
          master_product_id: string
          sort: number
        }
        Insert: {
          collection_id: string
          master_product_id: string
          sort?: number
        }
        Update: {
          collection_id?: string
          master_product_id?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_items_master_product_id_fkey"
            columns: ["master_product_id"]
            isOneToOne: false
            referencedRelation: "master_products"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          active: boolean
          created_at: string
          ends_at: string | null
          id: string
          sort: number
          starts_at: string
          subtitle: string
          title: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          ends_at?: string | null
          id?: string
          sort?: number
          starts_at?: string
          subtitle?: string
          title: string
        }
        Update: {
          active?: boolean
          created_at?: string
          ends_at?: string | null
          id?: string
          sort?: number
          starts_at?: string
          subtitle?: string
          title?: string
        }
        Relationships: []
      }
      coupon_redemptions: {
        Row: {
          at: string
          coupon_code: string
          discount_paise: number
          order_id: string
          student_id: string
        }
        Insert: {
          at?: string
          coupon_code: string
          discount_paise: number
          order_id: string
          student_id: string
        }
        Update: {
          at?: string
          coupon_code?: string
          discount_paise?: number
          order_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_code_fkey"
            columns: ["coupon_code"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string
          ends_at: string | null
          first_order_only: boolean
          funded_by: string
          kind: string
          listed: boolean
          max_discount_paise: number | null
          max_uses: number | null
          min_subtotal_paise: number
          per_student_limit: number
          shop_id: string | null
          starts_at: string
          value: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string
          ends_at?: string | null
          first_order_only?: boolean
          funded_by?: string
          kind: string
          listed?: boolean
          max_discount_paise?: number | null
          max_uses?: number | null
          min_subtotal_paise?: number
          per_student_limit?: number
          shop_id?: string | null
          starts_at?: string
          value: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string
          ends_at?: string | null
          first_order_only?: boolean
          funded_by?: string
          kind?: string
          listed?: boolean
          max_discount_paise?: number | null
          max_uses?: number | null
          min_subtotal_paise?: number
          per_student_limit?: number
          shop_id?: string | null
          starts_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          app: string
          expo_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app: string
          expo_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app?: string
          expo_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drop_points: {
        Row: {
          active: boolean
          extra_delivery_fee_paise: number
          gate_only: boolean
          id: string
          kind: Database["public"]["Enums"]["drop_point_kind"]
          lat: number | null
          lng: number | null
          name: string
        }
        Insert: {
          active?: boolean
          extra_delivery_fee_paise?: number
          gate_only?: boolean
          id?: string
          kind: Database["public"]["Enums"]["drop_point_kind"]
          lat?: number | null
          lng?: number | null
          name: string
        }
        Update: {
          active?: boolean
          extra_delivery_fee_paise?: number
          gate_only?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["drop_point_kind"]
          lat?: number | null
          lng?: number | null
          name?: string
        }
        Relationships: []
      }
      favourites: {
        Row: {
          created_at: string
          product_id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          product_id: string
          student_id?: string
        }
        Update: {
          created_at?: string
          product_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favourites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favourites_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_rules: {
        Row: {
          key: string
          value_paise: number
        }
        Insert: {
          key: string
          value_paise: number
        }
        Update: {
          key?: string
          value_paise?: number
        }
        Relationships: []
      }
      group_members: {
        Row: {
          display_name: string | null
          group_order_id: string
          items: Json
          joined_at: string
          paid: boolean
          share_paise: number | null
          student_id: string
        }
        Insert: {
          display_name?: string | null
          group_order_id: string
          items?: Json
          joined_at?: string
          paid?: boolean
          share_paise?: number | null
          student_id: string
        }
        Update: {
          display_name?: string | null
          group_order_id?: string
          items?: Json
          joined_at?: string
          paid?: boolean
          share_paise?: number | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_order_id_fkey"
            columns: ["group_order_id"]
            isOneToOne: false
            referencedRelation: "group_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_orders: {
        Row: {
          closes_at: string
          code: string
          created_at: string
          drop_point_id: string
          host_id: string
          id: string
          order_id: string | null
          problem: string | null
          room_note: string | null
          shop_id: string
          status: string
        }
        Insert: {
          closes_at: string
          code?: string
          created_at?: string
          drop_point_id: string
          host_id: string
          id?: string
          order_id?: string | null
          problem?: string | null
          room_note?: string | null
          shop_id: string
          status?: string
        }
        Update: {
          closes_at?: string
          code?: string
          created_at?: string
          drop_point_id?: string
          host_id?: string
          id?: string
          order_id?: string | null
          problem?: string | null
          room_note?: string | null
          shop_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_orders_drop_point_id_fkey"
            columns: ["drop_point_id"]
            isOneToOne: false
            referencedRelation: "drop_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_orders_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_orders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      item_pairs: {
        Row: {
          master_a: string
          master_b: string
          orders: number
          refreshed_at: string
        }
        Insert: {
          master_a: string
          master_b: string
          orders: number
          refreshed_at?: string
        }
        Update: {
          master_a?: string
          master_b?: string
          orders?: number
          refreshed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_pairs_master_a_fkey"
            columns: ["master_a"]
            isOneToOne: false
            referencedRelation: "master_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_pairs_master_b_fkey"
            columns: ["master_b"]
            isOneToOne: false
            referencedRelation: "master_products"
            referencedColumns: ["id"]
          },
        ]
      }
      master_aliases: {
        Row: {
          master_product_id: string
          match_key: string
        }
        Insert: {
          master_product_id: string
          match_key: string
        }
        Update: {
          master_product_id?: string
          match_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_aliases_master_product_id_fkey"
            columns: ["master_product_id"]
            isOneToOne: false
            referencedRelation: "master_products"
            referencedColumns: ["id"]
          },
        ]
      }
      master_products: {
        Row: {
          barcode: string | null
          brand: string | null
          category_id: string | null
          created_at: string
          id: string
          image_path: string | null
          match_key: string
          name: string
          photo_credit: string | null
          photo_source_url: string | null
          size: string
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          category_id?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          match_key: string
          name: string
          photo_credit?: string | null
          photo_source_url?: string | null
          size?: string
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          category_id?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          match_key?: string
          name?: string
          photo_credit?: string | null
          photo_source_url?: string | null
          size?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor: string
          actor_id: string | null
          at: string
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: number
          note: string | null
          order_id: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          actor: string
          actor_id?: string | null
          at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: never
          note?: string | null
          order_id: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          actor?: string
          actor_id?: string | null
          at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: never
          note?: string | null
          order_id?: string
          to_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          name_snapshot: string
          order_id: string
          price_paise_snapshot: number
          qty: number
          variant_id: string | null
        }
        Insert: {
          id?: string
          name_snapshot: string
          order_id: string
          price_paise_snapshot: number
          qty: number
          variant_id?: string | null
        }
        Update: {
          id?: string
          name_snapshot?: string
          order_id?: string
          price_paise_snapshot?: number
          qty?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_ratings: {
        Row: {
          at: string
          comment: string | null
          order_id: string
          rider_id: string | null
          rider_stars: number | null
          shop_id: string
          shop_stars: number
          student_id: string
        }
        Insert: {
          at?: string
          comment?: string | null
          order_id: string
          rider_id?: string | null
          rider_stars?: number | null
          shop_id: string
          shop_stars: number
          student_id: string
        }
        Update: {
          at?: string
          comment?: string | null
          order_id?: string
          rider_id?: string | null
          rider_stars?: number | null
          shop_id?: string
          shop_stars?: number
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_ratings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_ratings_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_ratings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_ratings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_secrets: {
        Row: {
          delivery_otp: string
          order_id: string
        }
        Insert: {
          delivery_otp: string
          order_id: string
        }
        Update: {
          delivery_otp?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_secrets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cart_id: string | null
          code: string
          completed_at: string | null
          coupon_code: string | null
          delivery_fee_paise: number
          discount_paise: number
          drop_point_id: string | null
          id: string
          mode: Database["public"]["Enums"]["order_mode"]
          out_at: string | null
          pay_method: Database["public"]["Enums"]["pay_method"]
          placed_at: string
          platform_fee_paise: number
          prep_minutes: number | null
          ready_at: string | null
          release_at: string | null
          released_at: string | null
          rider_assigned_at: string | null
          rider_cash_settled_at: string | null
          rider_cash_settled_by: string | null
          rider_id: string | null
          rider_payout_id: string | null
          rider_payout_paise: number
          room_note: string | null
          scheduled_for: string | null
          shop_id: string
          small_cart_fee_paise: number
          status: Database["public"]["Enums"]["order_status"]
          student_id: string
          subtotal_paise: number
          surcharge_paise: number
          token_no: number
          total_paise: number
        }
        Insert: {
          accepted_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cart_id?: string | null
          code: string
          completed_at?: string | null
          coupon_code?: string | null
          delivery_fee_paise?: number
          discount_paise?: number
          drop_point_id?: string | null
          id?: string
          mode: Database["public"]["Enums"]["order_mode"]
          out_at?: string | null
          pay_method: Database["public"]["Enums"]["pay_method"]
          placed_at?: string
          platform_fee_paise?: number
          prep_minutes?: number | null
          ready_at?: string | null
          release_at?: string | null
          released_at?: string | null
          rider_assigned_at?: string | null
          rider_cash_settled_at?: string | null
          rider_cash_settled_by?: string | null
          rider_id?: string | null
          rider_payout_id?: string | null
          rider_payout_paise?: number
          room_note?: string | null
          scheduled_for?: string | null
          shop_id: string
          small_cart_fee_paise?: number
          status?: Database["public"]["Enums"]["order_status"]
          student_id: string
          subtotal_paise: number
          surcharge_paise?: number
          token_no: number
          total_paise: number
        }
        Update: {
          accepted_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cart_id?: string | null
          code?: string
          completed_at?: string | null
          coupon_code?: string | null
          delivery_fee_paise?: number
          discount_paise?: number
          drop_point_id?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["order_mode"]
          out_at?: string | null
          pay_method?: Database["public"]["Enums"]["pay_method"]
          placed_at?: string
          platform_fee_paise?: number
          prep_minutes?: number | null
          ready_at?: string | null
          release_at?: string | null
          released_at?: string | null
          rider_assigned_at?: string | null
          rider_cash_settled_at?: string | null
          rider_cash_settled_by?: string | null
          rider_id?: string | null
          rider_payout_id?: string | null
          rider_payout_paise?: number
          room_note?: string | null
          scheduled_for?: string | null
          shop_id?: string
          small_cart_fee_paise?: number
          status?: Database["public"]["Enums"]["order_status"]
          student_id?: string
          subtotal_paise?: number
          surcharge_paise?: number
          token_no?: number
          total_paise?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_coupon_code_fkey"
            columns: ["coupon_code"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "orders_drop_point_id_fkey"
            columns: ["drop_point_id"]
            isOneToOne: false
            referencedRelation: "drop_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_rider_cash_settled_by_fkey"
            columns: ["rider_cash_settled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_rider_payout_id_fkey"
            columns: ["rider_payout_id"]
            isOneToOne: false
            referencedRelation: "rider_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      print_jobs: {
        Row: {
          color: boolean
          copies: number
          created_at: string
          double_sided: boolean
          file_deleted_at: string | null
          file_name: string
          file_path: string
          id: string
          order_id: string | null
          pages: number | null
          price_paise: number | null
          shop_id: string
          student_id: string
        }
        Insert: {
          color?: boolean
          copies?: number
          created_at?: string
          double_sided?: boolean
          file_deleted_at?: string | null
          file_name: string
          file_path: string
          id?: string
          order_id?: string | null
          pages?: number | null
          price_paise?: number | null
          shop_id: string
          student_id?: string
        }
        Update: {
          color?: boolean
          copies?: number
          created_at?: string
          double_sided?: boolean
          file_deleted_at?: string | null
          file_name?: string
          file_path?: string
          id?: string
          order_id?: string | null
          pages?: number | null
          price_paise?: number | null
          shop_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      print_settings: {
        Row: {
          active: boolean
          bw_page_paise: number
          color_page_paise: number
          max_pages: number
          shop_id: string
        }
        Insert: {
          active?: boolean
          bw_page_paise: number
          color_page_paise: number
          max_pages?: number
          shop_id: string
        }
        Update: {
          active?: boolean
          bw_page_paise?: number
          color_page_paise?: number
          max_pages?: number
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_settings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          availability_note: string | null
          category_id: string | null
          created_at: string
          description: string
          id: string
          image_path: string | null
          is_veg: boolean | null
          name: string
          photo_credit: string | null
          photo_source_url: string | null
          shop_id: string
        }
        Insert: {
          active?: boolean
          availability_note?: string | null
          category_id?: string | null
          created_at?: string
          description?: string
          id?: string
          image_path?: string | null
          is_veg?: boolean | null
          name: string
          photo_credit?: string | null
          photo_source_url?: string | null
          shop_id: string
        }
        Update: {
          active?: boolean
          availability_note?: string | null
          category_id?: string | null
          created_at?: string
          description?: string
          id?: string
          image_path?: string | null
          is_veg?: boolean | null
          name?: string
          photo_credit?: string | null
          photo_source_url?: string | null
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          blocked: boolean
          created_at: string
          default_drop_point_id: string | null
          deletion_requested_at: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          room_note: string | null
          terms_accepted_at: string | null
          terms_version: number
        }
        Insert: {
          blocked?: boolean
          created_at?: string
          default_drop_point_id?: string | null
          deletion_requested_at?: string | null
          email?: string | null
          id: string
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          room_note?: string | null
          terms_accepted_at?: string | null
          terms_version?: number
        }
        Update: {
          blocked?: boolean
          created_at?: string
          default_drop_point_id?: string | null
          deletion_requested_at?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          room_note?: string | null
          terms_accepted_at?: string | null
          terms_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_drop_point_id_fkey"
            columns: ["default_drop_point_id"]
            isOneToOne: false
            referencedRelation: "drop_points"
            referencedColumns: ["id"]
          },
        ]
      }
      push_outbox: {
        Row: {
          app: string
          body: string
          created_at: string
          data: Json
          id: number
          sent_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          app: string
          body: string
          created_at?: string
          data?: Json
          id?: never
          sent_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          app?: string
          body?: string
          created_at?: string
          data?: Json
          id?: never
          sent_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_outbox_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_payouts: {
        Row: {
          amount_paise: number
          created_at: string
          deliveries: number
          id: string
          paid_at: string | null
          reference: string | null
          rider_id: string
          week_start: string
        }
        Insert: {
          amount_paise: number
          created_at?: string
          deliveries: number
          id?: string
          paid_at?: string | null
          reference?: string | null
          rider_id: string
          week_start: string
        }
        Update: {
          amount_paise?: number
          created_at?: string
          deliveries?: number
          id?: string
          paid_at?: string | null
          reference?: string | null
          rider_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "rider_payouts_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      riders: {
        Row: {
          admin_note: string | null
          applied_at: string
          decided_at: string | null
          online: boolean
          profile_id: string
          status: Database["public"]["Enums"]["rider_status"]
          upi_vpa: string
        }
        Insert: {
          admin_note?: string | null
          applied_at?: string
          decided_at?: string | null
          online?: boolean
          profile_id: string
          status?: Database["public"]["Enums"]["rider_status"]
          upi_vpa: string
        }
        Update: {
          admin_note?: string | null
          applied_at?: string
          decided_at?: string | null
          online?: boolean
          profile_id?: string
          status?: Database["public"]["Enums"]["rider_status"]
          upi_vpa?: string
        }
        Relationships: [
          {
            foreignKeyName: "riders_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      search_logs: {
        Row: {
          at: string
          id: number
          query: string
          results: number
        }
        Insert: {
          at?: string
          id?: never
          query: string
          results: number
        }
        Update: {
          at?: string
          id?: never
          query?: string
          results?: number
        }
        Relationships: []
      }
      shop_daily_counters: {
        Row: {
          day: string
          last_token: number
          shop_id: string
        }
        Insert: {
          day: string
          last_token?: number
          shop_id: string
        }
        Update: {
          day?: string
          last_token?: number
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_daily_counters_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_staff: {
        Row: {
          profile_id: string
          role: Database["public"]["Enums"]["staff_role"]
          shop_id: string
        }
        Insert: {
          profile_id: string
          role?: Database["public"]["Enums"]["staff_role"]
          shop_id: string
        }
        Update: {
          profile_id?: string
          role?: Database["public"]["Enums"]["staff_role"]
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_staff_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_staff_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shops: {
        Row: {
          commission_bps: number
          created_at: string
          does_delivery: boolean
          does_pickup: boolean
          fssai_no: string | null
          gstin: string | null
          hours: Json
          id: string
          is_open: boolean
          kind: string
          name: string
          phone: string | null
          prep_minutes: number
          rush_extra_minutes: number
          rush_until: string | null
          upi_vpa: string | null
        }
        Insert: {
          commission_bps?: number
          created_at?: string
          does_delivery?: boolean
          does_pickup?: boolean
          fssai_no?: string | null
          gstin?: string | null
          hours?: Json
          id?: string
          is_open?: boolean
          kind?: string
          name: string
          phone?: string | null
          prep_minutes?: number
          rush_extra_minutes?: number
          rush_until?: string | null
          upi_vpa?: string | null
        }
        Update: {
          commission_bps?: number
          created_at?: string
          does_delivery?: boolean
          does_pickup?: boolean
          fssai_no?: string | null
          gstin?: string | null
          hours?: Json
          id?: string
          is_open?: boolean
          kind?: string
          name?: string
          phone?: string | null
          prep_minutes?: number
          rush_extra_minutes?: number
          rush_until?: string | null
          upi_vpa?: string | null
        }
        Relationships: []
      }
      suggestions: {
        Row: {
          body: string
          created_at: string
          id: string
          profile_id: string
          read_at: string | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          profile_id: string
          read_at?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          profile_id?: string
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suggestions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_alerts: {
        Row: {
          created_at: string
          student_id: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          student_id?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          student_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_alerts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_alerts_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      variants: {
        Row: {
          id: string
          in_stock: boolean
          label: string
          low_stock_at: number
          master_product_id: string | null
          mrp_paise: number
          price_paise: number
          product_id: string
          sort: number
          stock_qty: number | null
        }
        Insert: {
          id?: string
          in_stock?: boolean
          label?: string
          low_stock_at?: number
          master_product_id?: string | null
          mrp_paise: number
          price_paise: number
          product_id: string
          sort?: number
          stock_qty?: number | null
        }
        Update: {
          id?: string
          in_stock?: boolean
          label?: string
          low_stock_at?: number
          master_product_id?: string | null
          mrp_paise?: number
          price_paise?: number
          product_id?: string
          sort?: number
          stock_qty?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "variants_master_product_id_fkey"
            columns: ["master_product_id"]
            isOneToOne: false
            referencedRelation: "master_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      walk_times: {
        Row: {
          drop_point_id: string
          minutes: number
          shop_id: string
        }
        Insert: {
          drop_point_id: string
          minutes: number
          shop_id: string
        }
        Update: {
          drop_point_id?: string
          minutes?: number
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "walk_times_drop_point_id_fkey"
            columns: ["drop_point_id"]
            isOneToOne: false
            referencedRelation: "drop_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "walk_times_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_terms: {
        Args: { p_version: number }
        Returns: undefined
      }
      apply_as_rider: {
        Args: { p_upi_vpa: string }
        Returns: {
          admin_note: string | null
          applied_at: string
          decided_at: string | null
          online: boolean
          profile_id: string
          status: Database["public"]["Enums"]["rider_status"]
          upi_vpa: string
        }
        SetofOptions: {
          from: "*"
          to: "riders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_order_transition: {
        Args: {
          p_actor: string
          p_actor_id: string
          p_note: string
          p_order_id: string
          p_prep_minutes: number
          p_to: Database["public"]["Enums"]["order_status"]
        }
        Returns: {
          accepted_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cart_id: string | null
          code: string
          completed_at: string | null
          coupon_code: string | null
          delivery_fee_paise: number
          discount_paise: number
          drop_point_id: string | null
          id: string
          mode: Database["public"]["Enums"]["order_mode"]
          out_at: string | null
          pay_method: Database["public"]["Enums"]["pay_method"]
          placed_at: string
          platform_fee_paise: number
          prep_minutes: number | null
          ready_at: string | null
          release_at: string | null
          released_at: string | null
          rider_assigned_at: string | null
          rider_cash_settled_at: string | null
          rider_cash_settled_by: string | null
          rider_id: string | null
          rider_payout_id: string | null
          rider_payout_paise: number
          room_note: string | null
          scheduled_for: string | null
          shop_id: string
          small_cart_fee_paise: number
          status: Database["public"]["Enums"]["order_status"]
          student_id: string
          subtotal_paise: number
          surcharge_paise: number
          token_no: number
          total_paise: number
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      buy_again: {
        Args: never
        Returns: {
          image_path: string
          label: string
          last_ordered_at: string
          photo_credit: string
          photo_source_url: string
          price_paise: number
          product_id: string
          product_name: string
          shop_id: string
          shop_is_open: boolean
          shop_name: string
          variant_id: string
        }[]
      }
      calculate_bill: {
        Args: {
          p_mode: Database["public"]["Enums"]["order_mode"]
          p_subtotal_paise: number
        }
        Returns: {
          delivery_fee_paise: number
          platform_fee_paise: number
          small_cart_fee_paise: number
          subtotal_paise: number
          total_paise: number
        }[]
      }
      can_read_print_file: { Args: { p_name: string }; Returns: boolean }
      can_transition: {
        Args: {
          p_actor: string
          p_from: Database["public"]["Enums"]["order_status"]
          p_mode: Database["public"]["Enums"]["order_mode"]
          p_to: Database["public"]["Enums"]["order_status"]
        }
        Returns: boolean
      }
      can_use_tracking_channel: {
        Args: { p_send: boolean; p_topic: string }
        Returns: boolean
      }
      attach_shop_login: {
        Args: {
          p_profile_id: string
          p_shop_id: string
          p_staff_role: Database["public"]["Enums"]["staff_role"]
        }
        Returns: undefined
      }
      can_manage_shop_logins: {
        Args: {
          p_shop_id: string
          p_staff_role: Database["public"]["Enums"]["staff_role"]
        }
        Returns: boolean
      }
      can_watch_orders_channel: {
        Args: { p_topic: string }
        Returns: boolean
      }
      cancel_group_order: { Args: { p_group_id: string }; Returns: undefined }
      check_open_checkout_limit: {
        Args: { p_student: string }
        Returns: undefined
      }
      claim_batch: {
        Args: { p_drop_point_id: string; p_order_ids: string[] }
        Returns: number
      }
      claim_delivery: {
        Args: { p_order_id: string }
        Returns: {
          accepted_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cart_id: string | null
          code: string
          completed_at: string | null
          coupon_code: string | null
          delivery_fee_paise: number
          discount_paise: number
          drop_point_id: string | null
          id: string
          mode: Database["public"]["Enums"]["order_mode"]
          out_at: string | null
          pay_method: Database["public"]["Enums"]["pay_method"]
          placed_at: string
          platform_fee_paise: number
          prep_minutes: number | null
          ready_at: string | null
          release_at: string | null
          released_at: string | null
          rider_assigned_at: string | null
          rider_cash_settled_at: string | null
          rider_cash_settled_by: string | null
          rider_id: string | null
          rider_payout_id: string | null
          rider_payout_paise: number
          room_note: string | null
          scheduled_for: string | null
          shop_id: string
          small_cart_fee_paise: number
          status: Database["public"]["Enums"]["order_status"]
          student_id: string
          subtotal_paise: number
          surcharge_paise: number
          token_no: number
          total_paise: number
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_push_batch: {
        Args: { p_limit?: number }
        Returns: {
          app: string
          body: string
          data: Json
          expo_token: string
          outbox_id: number
          title: string
        }[]
      }
      close_shops_after_hours: { Args: { p_at?: string }; Returns: number }
      collection_products: {
        Args: never
        Returns: {
          collection_id: string
          image_path: string
          master_product_id: string
          min_price_paise: number
          name: string
          photo_credit: string
          photo_source_url: string
          size: string
          subtitle: string
          title: string
        }[]
      }
      complete_group_order: {
        Args: { p_group_id: string; p_system: boolean }
        Returns: {
          closes_at: string
          code: string
          created_at: string
          drop_point_id: string
          host_id: string
          id: string
          order_id: string | null
          problem: string | null
          room_note: string | null
          shop_id: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "group_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      coupon_discount: {
        Args: {
          p_code: string
          p_shop_id: string
          p_student: string
          p_subtotal: number
        }
        Returns: number
      }
      decide_rider: {
        Args: {
          p_note?: string
          p_profile_id: string
          p_status: Database["public"]["Enums"]["rider_status"]
        }
        Returns: undefined
      }
      delivery_surcharge: {
        Args: {
          p_at: string
          p_drop_point_id: string
          p_mode: Database["public"]["Enums"]["order_mode"]
        }
        Returns: number
      }
      expire_stale_orders: { Args: never; Returns: number }
      expired_print_files: {
        Args: never
        Returns: {
          file_path: string
          job_id: string
        }[]
      }
      find_or_create_master: {
        Args: {
          p_category_id: string
          p_image_path: string
          p_name: string
          p_photo_credit: string
          p_photo_source_url: string
          p_size: string
        }
        Returns: string
      }
      forget_device_tokens: { Args: { p_tokens: string[] }; Returns: undefined }
      format_rupees: { Args: { p_paise: number }; Returns: string }
      funnel_report: {
        Args: { p_from: string; p_to: string }
        Returns: {
          step: string
          students: number
        }[]
      }
      hook_before_user_created: { Args: { event: Json }; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      is_group_member: { Args: { p_group_id: string }; Returns: boolean }
      is_online_rider: { Args: never; Returns: boolean }
      is_shop_owner: { Args: { p_shop_id: string }; Returns: boolean }
      join_group_order: { Args: { p_code: string }; Returns: string }
      leave_group_order: { Args: { p_group_id: string }; Returns: undefined }
      list_batch_offers: {
        Args: never
        Returns: {
          drop_point_id: string
          drop_point_name: string
          order_ids: string[]
          orders: number
          payout_paise: number
          ready: number
          shop_names: string[]
        }[]
      }
      list_categories: {
        Args: never
        Returns: {
          id: string
          name: string
          product_count: number
        }[]
      }
      list_delivery_offers: {
        Args: never
        Returns: {
          accepted_at: string
          code: string
          drop_point_name: string
          gate_only: boolean
          id: string
          items: number
          payout_paise: number
          prep_minutes: number
          ready_at: string
          shop_name: string
          status: Database["public"]["Enums"]["order_status"]
        }[]
      }
      list_master_products: {
        Args: { p_query?: string }
        Returns: {
          barcode: string
          brand: string
          category_name: string
          id: string
          image_path: string
          listings: number
          max_price_paise: number
          min_price_paise: number
          name: string
          shops: number
          size: string
        }[]
      }
      log_search: {
        Args: { p_query: string; p_results: number }
        Returns: undefined
      }
      mark_payout_paid: {
        Args: { p_payout_id: string; p_reference: string }
        Returns: undefined
      }
      mark_print_files_deleted: {
        Args: { p_job_ids: string[] }
        Returns: undefined
      }
      master_match_key: {
        Args: { p_name: string; p_size: string }
        Returns: string
      }
      merge_master_products: {
        Args: { p_keep: string; p_merge: string }
        Returns: number
      }
      missed_demand: {
        Args: { p_from: string; p_to: string }
        Returns: {
          last_searched: string
          query: string
          searches: number
        }[]
      }
      my_banners: {
        Args: never
        Returns: {
          body: string
          category_id: string
          id: string
          shop_id: string
          title: string
        }[]
      }
      my_rider_cash: {
        Args: never
        Returns: {
          amount_paise: number
          limit_paise: number
          oldest_at: string
          orders: number
          shop_id: string
          shop_name: string
        }[]
      }
      my_shop_ids: { Args: never; Returns: string[] }
      open_group_order: {
        Args: {
          p_closes_in_minutes: number
          p_drop_point_id: string
          p_room_note?: string
          p_shop_id: string
        }
        Returns: {
          closes_at: string
          code: string
          created_at: string
          drop_point_id: string
          host_id: string
          id: string
          order_id: string | null
          problem: string | null
          room_note: string | null
          shop_id: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "group_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      place_cart: {
        Args: {
          p_coupon_code?: string
          p_drop_point_id?: string
          p_items: Json
          p_mode: Database["public"]["Enums"]["order_mode"]
          p_pay_method: Database["public"]["Enums"]["pay_method"]
          p_room_note?: string
        }
        Returns: {
          created_at: string
          drop_point_id: string | null
          id: string
          mode: Database["public"]["Enums"]["order_mode"]
          student_id: string
          total_paise: number
        }
        SetofOptions: {
          from: "*"
          to: "carts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      place_due_group_orders: { Args: never; Returns: number }
      place_group_order: {
        Args: { p_group_id: string }
        Returns: {
          closes_at: string
          code: string
          created_at: string
          drop_point_id: string
          host_id: string
          id: string
          order_id: string | null
          problem: string | null
          room_note: string | null
          shop_id: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "group_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      place_order: {
        Args: {
          p_coupon_code?: string
          p_drop_point_id?: string
          p_items: Json
          p_mode: Database["public"]["Enums"]["order_mode"]
          p_pay_method: Database["public"]["Enums"]["pay_method"]
          p_room_note?: string
          p_scheduled_for?: string
          p_shop_id: string
        }
        Returns: {
          accepted_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cart_id: string | null
          code: string
          completed_at: string | null
          coupon_code: string | null
          delivery_fee_paise: number
          discount_paise: number
          drop_point_id: string | null
          id: string
          mode: Database["public"]["Enums"]["order_mode"]
          out_at: string | null
          pay_method: Database["public"]["Enums"]["pay_method"]
          placed_at: string
          platform_fee_paise: number
          prep_minutes: number | null
          ready_at: string | null
          release_at: string | null
          released_at: string | null
          rider_assigned_at: string | null
          rider_cash_settled_at: string | null
          rider_cash_settled_by: string | null
          rider_id: string | null
          rider_payout_id: string | null
          rider_payout_paise: number
          room_note: string | null
          scheduled_for: string | null
          shop_id: string
          small_cart_fee_paise: number
          status: Database["public"]["Enums"]["order_status"]
          student_id: string
          subtotal_paise: number
          surcharge_paise: number
          token_no: number
          total_paise: number
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      place_print_order: {
        Args: {
          p_drop_point_id?: string
          p_job_id: string
          p_mode: Database["public"]["Enums"]["order_mode"]
          p_pay_method: Database["public"]["Enums"]["pay_method"]
          p_room_note?: string
        }
        Returns: {
          accepted_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cart_id: string | null
          code: string
          completed_at: string | null
          coupon_code: string | null
          delivery_fee_paise: number
          discount_paise: number
          drop_point_id: string | null
          id: string
          mode: Database["public"]["Enums"]["order_mode"]
          out_at: string | null
          pay_method: Database["public"]["Enums"]["pay_method"]
          placed_at: string
          platform_fee_paise: number
          prep_minutes: number | null
          ready_at: string | null
          release_at: string | null
          released_at: string | null
          rider_assigned_at: string | null
          rider_cash_settled_at: string | null
          rider_cash_settled_by: string | null
          rider_id: string | null
          rider_payout_id: string | null
          rider_payout_paise: number
          room_note: string | null
          scheduled_for: string | null
          shop_id: string
          small_cart_fee_paise: number
          status: Database["public"]["Enums"]["order_status"]
          student_id: string
          subtotal_paise: number
          surcharge_paise: number
          token_no: number
          total_paise: number
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      place_shop_order: {
        Args: {
          p_cart_id: string
          p_charge_fees: boolean
          p_coupon_code: string
          p_drop_point_id: string
          p_fee_basis_paise: number
          p_items: Json
          p_mode: Database["public"]["Enums"]["order_mode"]
          p_pay_method: Database["public"]["Enums"]["pay_method"]
          p_room_note: string
          p_scheduled_for: string
          p_shop_id: string
          p_student: string
        }
        Returns: {
          accepted_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cart_id: string | null
          code: string
          completed_at: string | null
          coupon_code: string | null
          delivery_fee_paise: number
          discount_paise: number
          drop_point_id: string | null
          id: string
          mode: Database["public"]["Enums"]["order_mode"]
          out_at: string | null
          pay_method: Database["public"]["Enums"]["pay_method"]
          placed_at: string
          platform_fee_paise: number
          prep_minutes: number | null
          ready_at: string | null
          release_at: string | null
          released_at: string | null
          rider_assigned_at: string | null
          rider_cash_settled_at: string | null
          rider_cash_settled_by: string | null
          rider_id: string | null
          rider_payout_id: string | null
          rider_payout_paise: number
          room_note: string | null
          scheduled_for: string | null
          shop_id: string
          small_cart_fee_paise: number
          status: Database["public"]["Enums"]["order_status"]
          student_id: string
          subtotal_paise: number
          surcharge_paise: number
          token_no: number
          total_paise: number
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_report: {
        Args: { p_from: string; p_to: string }
        Returns: {
          avg_accept_seconds: number
          commission_paise: number
          completed: number
          day: string
          dropped: number
          fees_paise: number
          new_students: number
          orders: number
          platform_discount_paise: number
          sales_paise: number
        }[]
      }
      prepare_rider_payouts: { Args: { p_week_start: string }; Returns: number }
      preview_coupon: {
        Args: { p_code: string; p_shop_id: string; p_subtotal_paise: number }
        Returns: number
      }
      rate_order: {
        Args: {
          p_comment?: string
          p_order_id: string
          p_rider_stars?: number
          p_shop_stars: number
        }
        Returns: undefined
      }
      refresh_smart_picks: { Args: never; Returns: number }
      register_device_token: {
        Args: { p_app: string; p_token: string }
        Returns: undefined
      }
      release_delivery: { Args: { p_order_id: string }; Returns: undefined }
      release_scheduled_orders: { Args: { p_at?: string }; Returns: number }
      remove_order_items: {
        Args: { p_item_ids: string[]; p_order_id: string }
        Returns: Database["public"]["Tables"]["orders"]["Row"]
      }
      request_account_deletion: { Args: never; Returns: undefined }
      rider_cash_due_paise: { Args: { p_rider_id: string }; Returns: number }
      rider_cash_limit_paise: { Args: never; Returns: number }
      rider_cash_report: {
        Args: never
        Returns: {
          amount_paise: number
          oldest_at: string
          orders: number
          rider_id: string
          rider_name: string
          rider_phone: string
          shop_id: string
          shop_name: string
        }[]
      }
      rider_payout_for: {
        Args: { p_order: Database["public"]["Tables"]["orders"]["Row"] }
        Returns: number
      }
      route_cart: {
        Args: {
          p_drop_point_id?: string
          p_items: Json
          p_mode: Database["public"]["Enums"]["order_mode"]
        }
        Returns: {
          line: number
          master_product_id: string
          price_paise: number
          problem: string
          product_name: string
          qty: number
          shop_id: string
          shop_name: string
          variant_id: string
        }[]
      }
      rupees_text: { Args: { p_paise: number }; Returns: string }
      save_product: {
        Args: {
          p_active?: boolean
          p_category_id?: string
          p_description?: string
          p_image_path?: string
          p_is_veg?: boolean
          p_name: string
          p_product_id?: string
          p_shop_id: string
          p_variants: Json
        }
        Returns: string
      }
      schedule_problem: {
        Args: {
          p_drop_point_id: string
          p_mode: Database["public"]["Enums"]["order_mode"]
          p_now: string
          p_shop_id: string
          p_slot: string
        }
        Returns: string
      }
      search_catalog: {
        Args: { p_category_id?: string; p_query?: string }
        Returns: {
          available: boolean
          category_name: string
          image_path: string
          master_product_id: string
          min_price_paise: number
          name: string
          photo_credit: string
          photo_source_url: string
          shops: number
          size: string
        }[]
      }
      search_orders: {
        Args: {
          p_from?: string
          p_query?: string
          p_shop_id?: string
          p_status?: Database["public"]["Enums"]["order_status"]
          p_to?: string
        }
        Returns: {
          code: string
          id: string
          mode: Database["public"]["Enums"]["order_mode"]
          placed_at: string
          shop_name: string
          status: Database["public"]["Enums"]["order_status"]
          student_email: string
          student_name: string
          student_phone: string
          total_paise: number
        }[]
      }
      search_products: {
        Args: { p_category_id?: string; p_query?: string }
        Returns: {
          category_name: string
          id: string
          image_path: string
          in_stock: boolean
          is_veg: boolean
          min_price_paise: number
          name: string
          photo_credit: string
          photo_source_url: string
          shop_id: string
          shop_is_open: boolean
          shop_name: string
        }[]
      }
      send_campaign: {
        Args: {
          p_batch?: string
          p_body: string
          p_drop_point_id?: string
          p_title: string
        }
        Returns: number
      }
      set_category_in_stock: {
        Args: { p_category_id?: string; p_in_stock: boolean; p_shop_id: string }
        Returns: number
      }
      set_group_items: {
        Args: { p_group_id: string; p_items: Json }
        Returns: undefined
      }
      set_group_paid: {
        Args: { p_group_id: string; p_paid: boolean; p_student_id: string }
        Returns: undefined
      }
      set_print_pages: {
        Args: { p_job_id: string; p_pages: number }
        Returns: {
          color: boolean
          copies: number
          created_at: string
          double_sided: boolean
          file_deleted_at: string | null
          file_name: string
          file_path: string
          id: string
          order_id: string | null
          pages: number | null
          price_paise: number | null
          shop_id: string
          student_id: string
        }
        SetofOptions: {
          from: "*"
          to: "print_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_rider_online: { Args: { p_online: boolean }; Returns: undefined }
      settle_rider_cash: {
        Args: { p_rider_id: string; p_shop_id: string }
        Returns: number
      }
      list_suggestions: {
        Args: { p_limit?: number }
        Returns: {
          body: string
          created_at: string
          email: string
          id: string
          name: string
          phone: string
          read_at: string
          role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      shop_ratings: {
        Args: never
        Returns: {
          average: number
          ratings: number
          shop_id: string
        }[]
      }
      shop_month_orders: {
        Args: { p_month: string; p_shop_id: string }
        Returns: {
          code: string
          completed_at: string
          item_sales_paise: number
          mode: Database["public"]["Enums"]["order_mode"]
          order_id: string
          pay_method: Database["public"]["Enums"]["pay_method"]
          platform_fee_paise: number
          token_no: number
          total_paise: number
        }[]
      }
      shop_monthly_bills: {
        Args: { p_month: string }
        Returns: {
          delivery_paise: number
          item_sales_paise: number
          orders: number
          platform_fee_paise: number
          shop_id: string
          shop_name: string
        }[]
      }
      shop_report: {
        Args: { p_from: string; p_shop_id: string; p_to: string }
        Returns: {
          avg_accept_seconds: number
          commission_paise: number
          completed: number
          day: string
          dropped: number
          orders: number
          sales_paise: number
        }[]
      }
      shop_rider_cash: {
        Args: { p_shop_id: string }
        Returns: {
          amount_paise: number
          oldest_at: string
          orders: number
          rider_id: string
          rider_name: string
          rider_phone: string
        }[]
      }
      shop_top_items: {
        Args: { p_from: string; p_shop_id: string; p_to: string }
        Returns: {
          name: string
          qty: number
          sales_paise: number
        }[]
      }
      smart_picks: {
        Args: { p_master_ids?: string[]; p_variant_ids?: string[] }
        Returns: {
          image_path: string
          master_product_id: string
          min_price_paise: number
          name: string
          photo_credit: string
          photo_source_url: string
          size: string
          together: number
        }[]
      }
      student_batch: { Args: { p_email: string }; Returns: string }
      transition_order: {
        Args: {
          p_code?: string
          p_note?: string
          p_order_id: string
          p_prep_minutes?: number
          p_to: Database["public"]["Enums"]["order_status"]
        }
        Returns: {
          accepted_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cart_id: string | null
          code: string
          completed_at: string | null
          coupon_code: string | null
          delivery_fee_paise: number
          discount_paise: number
          drop_point_id: string | null
          id: string
          mode: Database["public"]["Enums"]["order_mode"]
          out_at: string | null
          pay_method: Database["public"]["Enums"]["pay_method"]
          placed_at: string
          platform_fee_paise: number
          prep_minutes: number | null
          ready_at: string | null
          release_at: string | null
          released_at: string | null
          rider_assigned_at: string | null
          rider_cash_settled_at: string | null
          rider_cash_settled_by: string | null
          rider_id: string | null
          rider_payout_id: string | null
          rider_payout_paise: number
          room_note: string | null
          scheduled_for: string | null
          shop_id: string
          small_cart_fee_paise: number
          status: Database["public"]["Enums"]["order_status"]
          student_id: string
          subtotal_paise: number
          surcharge_paise: number
          token_no: number
          total_paise: number
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      valid_shop_hours: { Args: { p_hours: Json }; Returns: boolean }
      walk_minutes: {
        Args: {
          p_drop_point_id: string
          p_mode: Database["public"]["Enums"]["order_mode"]
          p_shop_id: string
        }
        Returns: number
      }
      within_shop_hours: {
        Args: { p_at: string; p_hours: Json }
        Returns: boolean
      }
    }
    Enums: {
      drop_point_kind: "hostel" | "department" | "other"
      order_mode: "delivery" | "pickup"
      order_status:
        | "scheduled"
        | "placed"
        | "accepted"
        | "ready"
        | "out_for_delivery"
        | "delivered"
        | "collected"
        | "rejected"
        | "cancelled"
        | "expired"
      pay_method: "cash" | "upi_at_handover"
      rider_status: "applied" | "approved" | "rejected" | "suspended"
      staff_role: "owner" | "counter"
      user_role:
        | "student"
        | "merchant_owner"
        | "merchant_staff"
        | "rider"
        | "admin"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      drop_point_kind: ["hostel", "department", "other"],
      order_mode: ["delivery", "pickup"],
      order_status: [
        "scheduled",
        "placed",
        "accepted",
        "ready",
        "out_for_delivery",
        "delivered",
        "collected",
        "rejected",
        "cancelled",
        "expired",
      ],
      pay_method: ["cash", "upi_at_handover"],
      rider_status: ["applied", "approved", "rejected", "suspended"],
      staff_role: ["owner", "counter"],
      user_role: [
        "student",
        "merchant_owner",
        "merchant_staff",
        "rider",
        "admin",
      ],
    },
  },
} as const
