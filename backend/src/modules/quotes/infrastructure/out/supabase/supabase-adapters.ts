import type { SupabaseClient } from '@supabase/supabase-js';
import { unwrap } from '../../../../../shared/supabase/unwrap';
import type { QuoteRepository } from '../../../application/ports/out/quote-repository';
import type { CampaignRepository } from '../../../application/ports/out/campaign-repository';
import {
  campaignFromRow,
  campaignToRow,
  eventToRow,
  quoteFromRow,
  quoteToRow,
  type CampaignRow,
  type EventRow,
  type QuoteRow,
} from './mappers';

const SELECT = '*, quote_events(*)';
type QuoteWithEvents = QuoteRow & { quote_events: EventRow[] };

export function createSupabaseQuoteRepository(supabase: SupabaseClient): QuoteRepository {
  const map = (r: QuoteWithEvents) => quoteFromRow(r, r.quote_events);
  return {
    async findById(id) {
      const row = unwrap(
        await supabase.from('quotes').select(SELECT).eq('id', id).maybeSingle<QuoteWithEvents>(),
      );
      return row ? map(row) : null;
    },
    async listByCampaign(campaignId) {
      return unwrap(
        await supabase
          .from('quotes')
          .select(SELECT)
          .eq('campaign_id', campaignId)
          .returns<QuoteWithEvents[]>(),
      ).map(map);
    },
    // Dos consultas con `.eq` (parametrizadas): nada del profileId se interpola en un filtro de PostgREST.
    async listByProfile(profileId) {
      const byColumn = async (column: 'requester_profile_id' | 'creator_profile_id') =>
        unwrap(
          await supabase
            .from('quotes')
            .select(SELECT)
            .eq(column, profileId)
            .returns<QuoteWithEvents[]>(),
        );
      const rows = (
        await Promise.all([byColumn('requester_profile_id'), byColumn('creator_profile_id')])
      ).flat();
      return [...new Map(rows.map((r) => [r.id, r])).values()].map(map);
    },
    // Cotización nueva: inserta la fila y todo su historial. Existente: cada evento nuevo es una transición con
    // concurrencia optimista (RPC `transition_quote`); si otro escribió antes, falla con 409 y no se mezcla el historial.
    async save(quote) {
      const existing = unwrap(
        await supabase.from('quotes').select('id').eq('id', quote.id).maybeSingle<{ id: string }>(),
      );
      if (!existing) {
        unwrap(await supabase.from('quotes').insert(quoteToRow(quote)));
        unwrap(
          await supabase
            .from('quote_events')
            .insert(quote.history.map((e) => eventToRow(quote.id, e))),
        );
        return;
      }
      const stored = unwrap(
        await supabase.from('quote_events').select('seq').eq('quote_id', quote.id),
      ).length;
      // Secuencial: cada transición parte del estado que dejó la anterior.
      await quote.history.slice(stored).reduce(async (prev, e) => {
        await prev;
        unwrap(
          await supabase.rpc('transition_quote', {
            p_quote_id: quote.id,
            p_expected_status: e.from,
            p_to: e.to,
            p_actor: e.actorProfileId,
            p_amount: quote.amountPen,
            p_note: e.note,
            p_at: e.at,
          }),
        );
      }, Promise.resolve());
    },
  };
}

export const createSupabaseCampaignRepository = (supabase: SupabaseClient): CampaignRepository => ({
  async findById(id) {
    const row = unwrap(
      await supabase.from('campaigns').select('*').eq('id', id).maybeSingle<CampaignRow>(),
    );
    return row ? campaignFromRow(row) : null;
  },
  async listByBrand(brandProfileId, status) {
    const q = supabase
      .from('campaigns')
      .select('*')
      .eq('brand_profile_id', brandProfileId)
      .order('created_at', { ascending: false })
      .order('id');
    return unwrap(await (status ? q.eq('status', status) : q).returns<CampaignRow[]>()).map(
      campaignFromRow,
    );
  },
  async save(campaign) {
    unwrap(await supabase.from('campaigns').upsert(campaignToRow(campaign)));
  },
  async update(campaign, expectedStatus) {
    const { id, created_at: _created, ...row } = campaignToRow(campaign);
    const rows = unwrap(
      await supabase
        .from('campaigns')
        .update(row)
        .eq('id', id)
        .eq('status', expectedStatus)
        .select('id'),
    );
    return rows.length > 0;
  },
});
