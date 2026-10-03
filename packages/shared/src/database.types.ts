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
      ai_analysis: {
        Row: {
          created_at: string
          grau_confianca_explicacao: string | null
          grau_confianca_ia: number | null
          icp_score: number | null
          id: string
          ipr_breakdown: Json | null
          ipr_score: number | null
          lead_id: string
          model: string
          motivacao_principal: string | null
          perfil_comercial:
            | Database["public"]["Enums"]["perfil_comercial_enum"]
            | null
          perfil_motivo: string | null
          perfil_sugerido_ia: string | null
          pontos_atencao: string[] | null
          pontos_fortes: string[] | null
          potencial_empreendedor: string | null
          probabilidade_sucesso: number | null
          proxima_acao: string | null
          recomendacao: Database["public"]["Enums"]["recomendacao_enum"] | null
          resumo: string | null
          resumo_comercial: string | null
          resumo_comportamental: string | null
          resumo_executivo: string | null
          resumo_motivacional: string | null
          sentimento: string | null
        }
        Insert: {
          created_at?: string
          grau_confianca_explicacao?: string | null
          grau_confianca_ia?: number | null
          icp_score?: number | null
          id?: string
          ipr_breakdown?: Json | null
          ipr_score?: number | null
          lead_id: string
          model?: string
          motivacao_principal?: string | null
          perfil_comercial?:
            | Database["public"]["Enums"]["perfil_comercial_enum"]
            | null
          perfil_motivo?: string | null
          perfil_sugerido_ia?: string | null
          pontos_atencao?: string[] | null
          pontos_fortes?: string[] | null
          potencial_empreendedor?: string | null
          probabilidade_sucesso?: number | null
          proxima_acao?: string | null
          recomendacao?: Database["public"]["Enums"]["recomendacao_enum"] | null
          resumo?: string | null
          resumo_comercial?: string | null
          resumo_comportamental?: string | null
          resumo_executivo?: string | null
          resumo_motivacional?: string | null
          sentimento?: string | null
        }
        Update: {
          created_at?: string
          grau_confianca_explicacao?: string | null
          grau_confianca_ia?: number | null
          icp_score?: number | null
          id?: string
          ipr_breakdown?: Json | null
          ipr_score?: number | null
          lead_id?: string
          model?: string
          motivacao_principal?: string | null
          perfil_comercial?:
            | Database["public"]["Enums"]["perfil_comercial_enum"]
            | null
          perfil_motivo?: string | null
          perfil_sugerido_ia?: string | null
          pontos_atencao?: string[] | null
          pontos_fortes?: string[] | null
          potencial_empreendedor?: string | null
          probabilidade_sucesso?: number | null
          proxima_acao?: string | null
          recomendacao?: Database["public"]["Enums"]["recomendacao_enum"] | null
          resumo?: string | null
          resumo_comercial?: string | null
          resumo_comportamental?: string | null
          resumo_executivo?: string | null
          resumo_motivacional?: string | null
          sentimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_analysis_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      answers: {
        Row: {
          answer_value: string | null
          created_at: string
          id: string
          lead_id: string | null
          question_key: string
          question_label: string
          session_id: string
        }
        Insert: {
          answer_value?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          question_key: string
          question_label: string
          session_id: string
        }
        Update: {
          answer_value?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          question_key?: string
          question_label?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "answers_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          ativa: boolean
          created_at: string
          id: string
          nome: string
          origem: string
          utm_campaign: string | null
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome: string
          origem?: string
          utm_campaign?: string | null
        }
        Update: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome?: string
          origem?: string
          utm_campaign?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          completed_at: string | null
          current_step: string | null
          id: string
          lead_id: string | null
          session_id: string
          started_at: string
          status: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          completed_at?: string | null
          current_step?: string | null
          id?: string
          lead_id?: string | null
          session_id: string
          started_at?: string
          status?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          completed_at?: string | null
          current_step?: string | null
          id?: string
          lead_id?: string | null
          session_id?: string
          started_at?: string
          status?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          ativada_em: string | null
          campanha: string | null
          cidade: string | null
          client_ip: string | null
          client_user_agent: string | null
          conversation_id: string | null
          created_at: string
          empresa_atual: string | null
          estabilidade_profissional:
            | Database["public"]["Enums"]["estabilidade_profissional_enum"]
            | null
          etapa_pos_aprovacao:
            | Database["public"]["Enums"]["etapa_pos_aprovacao_enum"]
            | null
          experiencia_vendas: boolean | null
          fbc: string | null
          fbclid: string | null
          fbp: string | null
          id: string
          idade: number | null
          instagram: string | null
          ipr: number
          meta_lead_sent_at: string | null
          nome: string
          objetivo: string | null
          observacoes: string | null
          origem: string | null
          perfil_comercial:
            | Database["public"]["Enums"]["perfil_comercial_enum"]
            | null
          profissao: string | null
          resumo_ia: string | null
          status: Database["public"]["Enums"]["lead_status"]
          tania_notificada_em: string | null
          telefone: string
          tempo_disponivel: string | null
          trabalha: boolean | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          whatsapp: boolean | null
          whatsapp_automatico_enviado_em: string | null
        }
        Insert: {
          ativada_em?: string | null
          campanha?: string | null
          cidade?: string | null
          client_ip?: string | null
          client_user_agent?: string | null
          conversation_id?: string | null
          created_at?: string
          empresa_atual?: string | null
          estabilidade_profissional?:
            | Database["public"]["Enums"]["estabilidade_profissional_enum"]
            | null
          etapa_pos_aprovacao?:
            | Database["public"]["Enums"]["etapa_pos_aprovacao_enum"]
            | null
          experiencia_vendas?: boolean | null
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          id?: string
          idade?: number | null
          instagram?: string | null
          ipr?: number
          meta_lead_sent_at?: string | null
          nome: string
          objetivo?: string | null
          observacoes?: string | null
          origem?: string | null
          perfil_comercial?:
            | Database["public"]["Enums"]["perfil_comercial_enum"]
            | null
          profissao?: string | null
          resumo_ia?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          tania_notificada_em?: string | null
          telefone: string
          tempo_disponivel?: string | null
          trabalha?: boolean | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          whatsapp?: boolean | null
          whatsapp_automatico_enviado_em?: string | null
        }
        Update: {
          ativada_em?: string | null
          campanha?: string | null
          cidade?: string | null
          client_ip?: string | null
          client_user_agent?: string | null
          conversation_id?: string | null
          created_at?: string
          empresa_atual?: string | null
          estabilidade_profissional?:
            | Database["public"]["Enums"]["estabilidade_profissional_enum"]
            | null
          etapa_pos_aprovacao?:
            | Database["public"]["Enums"]["etapa_pos_aprovacao_enum"]
            | null
          experiencia_vendas?: boolean | null
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          id?: string
          idade?: number | null
          instagram?: string | null
          ipr?: number
          meta_lead_sent_at?: string | null
          nome?: string
          objetivo?: string | null
          observacoes?: string | null
          origem?: string | null
          perfil_comercial?:
            | Database["public"]["Enums"]["perfil_comercial_enum"]
            | null
          profissao?: string | null
          resumo_ia?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          tania_notificada_em?: string | null
          telefone?: string
          tempo_disponivel?: string | null
          trabalha?: boolean | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          whatsapp?: boolean | null
          whatsapp_automatico_enviado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_ficha: {
        Row: {
          conjuge_nome: string | null
          conjuge_telefone: string | null
          conjuge_trabalha: boolean | null
          conjuge_trabalho_local: string | null
          conjuge_trabalho_telefone: string | null
          contato_manual_em: string | null
          criado_em: string
          endereco_bairro: string | null
          endereco_cep: string | null
          endereco_cidade: string | null
          endereco_numero: string | null
          endereco_rua: string | null
          id: string
          lead_id: string
          lembrete_enviado_em: string | null
          nome_mae: string | null
          nome_pai: string | null
          preenchido_em: string | null
          ref_comercial_nome: string | null
          ref_comercial_o_que_vende: string | null
          ref_comercial_telefone: string | null
          ref1_nome: string | null
          ref1_telefone: string | null
          ref2_nome: string | null
          ref2_telefone: string | null
          ref3_nome: string | null
          ref3_telefone: string | null
          tem_conjuge: boolean | null
          token: string
          trabalha_atualmente: boolean | null
          trabalho_endereco: string | null
          casa_propria: string | null
          documentos: Json
          filhos_quantidade: number | null
          instagram_profissional: string | null
          restricao_cpf: string | null
          trabalho_horario: string | null
          trabalho_telefone: string | null
          whatsapp_enviado_em: string | null
        }
        Insert: {
          conjuge_nome?: string | null
          conjuge_telefone?: string | null
          conjuge_trabalha?: boolean | null
          conjuge_trabalho_local?: string | null
          conjuge_trabalho_telefone?: string | null
          contato_manual_em?: string | null
          criado_em?: string
          endereco_bairro?: string | null
          endereco_cep?: string | null
          endereco_cidade?: string | null
          endereco_numero?: string | null
          endereco_rua?: string | null
          id?: string
          lead_id: string
          lembrete_enviado_em?: string | null
          nome_mae?: string | null
          nome_pai?: string | null
          preenchido_em?: string | null
          ref_comercial_nome?: string | null
          ref_comercial_o_que_vende?: string | null
          ref_comercial_telefone?: string | null
          ref1_nome?: string | null
          ref1_telefone?: string | null
          ref2_nome?: string | null
          ref2_telefone?: string | null
          ref3_nome?: string | null
          ref3_telefone?: string | null
          tem_conjuge?: boolean | null
          token?: string
          trabalha_atualmente?: boolean | null
          trabalho_endereco?: string | null
          casa_propria?: string | null
          documentos?: Json
          filhos_quantidade?: number | null
          instagram_profissional?: string | null
          restricao_cpf?: string | null
          trabalho_horario?: string | null
          trabalho_telefone?: string | null
          whatsapp_enviado_em?: string | null
        }
        Update: {
          conjuge_nome?: string | null
          conjuge_telefone?: string | null
          conjuge_trabalha?: boolean | null
          conjuge_trabalho_local?: string | null
          conjuge_trabalho_telefone?: string | null
          contato_manual_em?: string | null
          criado_em?: string
          endereco_bairro?: string | null
          endereco_cep?: string | null
          endereco_cidade?: string | null
          endereco_numero?: string | null
          endereco_rua?: string | null
          id?: string
          lead_id?: string
          lembrete_enviado_em?: string | null
          nome_mae?: string | null
          nome_pai?: string | null
          preenchido_em?: string | null
          ref_comercial_nome?: string | null
          ref_comercial_o_que_vende?: string | null
          ref_comercial_telefone?: string | null
          ref1_nome?: string | null
          ref1_telefone?: string | null
          ref2_nome?: string | null
          ref2_telefone?: string | null
          ref3_nome?: string | null
          ref3_telefone?: string | null
          tem_conjuge?: boolean | null
          token?: string
          trabalha_atualmente?: boolean | null
          trabalho_endereco?: string | null
          casa_propria?: string | null
          documentos?: Json
          filhos_quantidade?: number | null
          instagram_profissional?: string | null
          restricao_cpf?: string | null
          trabalho_horario?: string | null
          trabalho_telefone?: string | null
          whatsapp_enviado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_ficha_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      logs: {
        Row: {
          campanha: string | null
          created_at: string
          id: string
          lead_id: string | null
          metadata: Json | null
          origem: string | null
          session_id: string | null
          tipo_evento: Database["public"]["Enums"]["evento_funil"]
        }
        Insert: {
          campanha?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          origem?: string | null
          session_id?: string | null
          tipo_evento: Database["public"]["Enums"]["evento_funil"]
        }
        Update: {
          campanha?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          origem?: string | null
          session_id?: string | null
          tipo_evento?: Database["public"]["Enums"]["evento_funil"]
        }
        Relationships: [
          {
            foreignKeyName: "logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string | null
          papel: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          nome?: string | null
          papel?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
          papel?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          chave: string
          descricao: string | null
          id: string
          updated_at: string
          valor: Json
        }
        Insert: {
          chave: string
          descricao?: string | null
          id?: string
          updated_at?: string
          valor: Json
        }
        Update: {
          chave?: string
          descricao?: string | null
          id?: string
          updated_at?: string
          valor?: Json
        }
        Relationships: []
      }
      whatsapp_contacts: {
        Row: {
          created_at: string
          last_message_at: string
          nome: string | null
          telefone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          last_message_at?: string
          nome?: string | null
          telefone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          last_message_at?: string
          nome?: string | null
          telefone?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          body: string | null
          created_at: string
          delivered_at: string | null
          direction: string
          error_code: string | null
          error_message: string | null
          error_title: string | null
          failed_at: string | null
          id: string
          lead_id: string | null
          message_purpose: string | null
          message_type: string
          meta_message_id: string
          raw_payload: Json | null
          read_at: string | null
          sent_at: string | null
          status: string | null
          telefone: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          delivered_at?: string | null
          direction: string
          error_code?: string | null
          error_message?: string | null
          error_title?: string | null
          failed_at?: string | null
          id?: string
          lead_id?: string | null
          message_purpose?: string | null
          message_type?: string
          meta_message_id: string
          raw_payload?: Json | null
          read_at?: string | null
          sent_at?: string | null
          status?: string | null
          telefone: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          delivered_at?: string | null
          direction?: string
          error_code?: string | null
          error_message?: string | null
          error_title?: string | null
          failed_at?: string | null
          id?: string
          lead_id?: string | null
          message_purpose?: string | null
          message_type?: string
          meta_message_id?: string
          raw_payload?: Json | null
          read_at?: string | null
          sent_at?: string | null
          status?: string | null
          telefone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_telefone_fkey"
            columns: ["telefone"]
            isOneToOne: false
            referencedRelation: "whatsapp_contacts"
            referencedColumns: ["telefone"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      estabilidade_profissional_enum: "ALTA" | "MEDIA" | "BAIXA"
      etapa_pos_aprovacao_enum:
        | "contatada"
        | "confirmada"
        | "aguardando_tania"
        | "ativa"
        | "desistiu"
      evento_funil:
        | "landing_view"
        | "ad_click"
        | "chat_iniciado"
        | "chat_abandonado"
        | "respondeu_trabalha_sim"
        | "respondeu_trabalha_nao"
        | "aprovada"
        | "reprovada"
        | "analise_manual"
      lead_status: "novo" | "em_analise" | "aprovada" | "reprovada"
      perfil_comercial_enum: "baixo" | "medio" | "alto"
      recomendacao_enum: "aprovar" | "reprovar" | "analise_manual"
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
      estabilidade_profissional_enum: ["ALTA", "MEDIA", "BAIXA"],
      etapa_pos_aprovacao_enum: [
        "contatada",
        "confirmada",
        "aguardando_tania",
        "ativa",
        "desistiu",
      ],
      evento_funil: [
        "landing_view",
        "ad_click",
        "chat_iniciado",
        "chat_abandonado",
        "respondeu_trabalha_sim",
        "respondeu_trabalha_nao",
        "aprovada",
        "reprovada",
        "analise_manual",
      ],
      lead_status: ["novo", "em_analise", "aprovada", "reprovada"],
      perfil_comercial_enum: ["baixo", "medio", "alto"],
      recomendacao_enum: ["aprovar", "reprovar", "analise_manual"],
    },
  },
} as const
