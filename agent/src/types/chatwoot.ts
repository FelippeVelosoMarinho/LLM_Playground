export interface TeamUser {
  attendant_id: string;
  user_id: string;
  email: string;
  name: string;
  updated_at: string;
}

export interface ConversationMeta {
  sender: { id: number; name: string; phone_number?: string | null };
  team: { id: number; name: string };
  assignee?: { id: number; email?: string | null; name?: string | null } | null;
}

export interface Conversation {
  id: number;
  account_id: number;
  inbox_id: number;
  status: 'open' | 'resolved' | 'pending' | string;
  meta: ConversationMeta;
  last_activity_at: number;
  last_non_activity_message?: Message | null;
}

export interface Message {
  id: number;
  conversation_id: number;
  message_type: number;
  created_at: number;         
  content_type: 'text' | string;
  content: string | null;
  source_id?: string | null;     // pro before depois
}

export interface PaginatedConversations {
  meta: { all_count: number; assigned_count: number; mine_count: number; unassigned_count: number };
  payload: Conversation[];
}

export interface PaginatedMessages {
  meta: any;
  payload: Message[];
}
