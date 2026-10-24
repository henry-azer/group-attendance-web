import { describe, expect, it, vi } from 'vitest'
import { callRpc, supabase } from './client.ts'

describe('callRpc', () => {
  it('maps not_found error', async () => {
    vi.spyOn(supabase, 'rpc').mockRejectedValueOnce(new Error('not_found'))

    const result = await callRpc('admin_get_group', { p_admin: 'x' })

    expect(result).toEqual({ ok: false, error: 'not_found' })
  })

  it('maps fetch failure to network', async () => {
    vi.spyOn(supabase, 'rpc').mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const result = await callRpc('admin_get_group', { p_admin: 'x' })

    expect(result).toEqual({ ok: false, error: 'network' })
  })

  it('maps a resolved {error} response the same way as a rejection', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: null,
      error: { message: 'duplicate_name', details: '', hint: '', code: '' },
      status: 400,
      statusText: 'Bad Request',
    } as any)

    const result = await callRpc('create_group', { p_name: 'x', p_timezone: 'UTC', p_members: [] })

    expect(result).toEqual({ ok: false, error: 'duplicate_name' })
  })

  it('maps rate_limited', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: null,
      error: { message: 'rate_limited', details: '', hint: '', code: 'P0001' },
      status: 400,
      statusText: 'Bad Request',
    } as any)

    const result = await callRpc('create_group', { p_name: 'x', p_timezone: 'UTC', p_members: ['a'] })

    expect(result).toEqual({ ok: false, error: 'rate_limited' })
  })

  it('maps a resolved transport failure (status 0) to network', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: null,
      error: { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' },
      status: 0,
      statusText: '',
    } as any)

    const result = await callRpc('ping', {})

    expect(result).toEqual({ ok: false, error: 'network' })
  })

  it('maps an unknown server error to server, not network', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: null,
      error: { message: 'column "x" does not exist', details: '', hint: '', code: '42703' },
      status: 400,
      statusText: 'Bad Request',
    } as any)

    const result = await callRpc('admin_get_group', { p_admin: 'x' })

    expect(result).toEqual({ ok: false, error: 'server' })
  })

  it('maps a thrown non-network error to server', async () => {
    vi.spyOn(supabase, 'rpc').mockRejectedValueOnce(new Error('boom'))

    const result = await callRpc('admin_get_group', { p_admin: 'x' })

    expect(result).toEqual({ ok: false, error: 'server' })
  })

  it('returns ok:true with the data on success', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: 'ok',
      error: null,
      status: 200,
      statusText: 'OK',
    } as any)

    const result = await callRpc<string>('ping', {})

    expect(result).toEqual({ ok: true, data: 'ok' })
  })
})
