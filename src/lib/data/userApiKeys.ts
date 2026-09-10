import { sb, toSnake, toCamel } from './core'

export const userApiKeys = {
    async create(userId: string, keyHash: string, name = 'MCP Key') {
      const client = await sb()
      const { data, error } = await client
        .from('user_api_keys')
        .insert({ user_id: userId, key_hash: keyHash, name })
        .select('id, key_hash, name, created_at, last_used_at')
        .single()
      if (error) throw error
      return toCamel(data)
    },
    async latest(userId: string) {
      const client = await sb()
      const { data, error } = await client
        .from('user_api_keys')
        .select('key_hash, name, created_at, last_used_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data ? toCamel(data) : null
    },
    async removeAll(userId: string) {
      const client = await sb()
      const { error } = await client
        .from('user_api_keys')
        .delete()
        .eq('user_id', userId)
      if (error) throw error
    },
  }
