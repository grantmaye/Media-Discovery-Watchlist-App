import { z } from 'zod';
import type { Database } from './database';
import { catalog, genres } from './catalog';
import { DomainError, type Entry } from './model';
export class Service {
  constructor(public db: Database) {}
  async initialize(workspace: string) {
    await this.db.query('INSERT INTO workspaces(id) VALUES($1) ON CONFLICT DO NOTHING', [
      workspace,
    ]);
  }
  async entries(workspace: string) {
    return (
      await this.db.query<{ data: Entry }>(
        'SELECT data FROM watch_entries WHERE workspace_id=$1 ORDER BY title_id',
        [workspace],
      )
    ).map((r) => r.data);
  }
  async library(workspace: string) {
    return (await this.entries(workspace))
      .filter((e) => e.state !== 'REMOVED')
      .map((e) => ({ ...e, title: catalog.find((t) => t.id === e.titleId)! }));
  }
  async browse(
    workspace: string,
    args: { search?: string; genre?: string; sort?: string; first?: number; after?: string },
  ) {
    const search = (args.search ?? '').trim().toLowerCase(),
      genre = args.genre ?? '',
      sort = args.sort ?? 'CURATED',
      first = args.first ?? 8;
    if (
      search.length > 100 ||
      first < 1 ||
      first > 12 ||
      !['CURATED', 'TITLE', 'YEAR'].includes(sort) ||
      (genre && !genres.includes(genre))
    )
      throw new DomainError('Invalid discovery filters.');
    const filtered = catalog
      .filter(
        (t) =>
          (!genre || t.genre === genre) &&
          `${t.name} ${t.director} ${t.description}`.toLowerCase().includes(search),
      )
      .sort((a, b) =>
        sort === 'TITLE'
          ? a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
          : sort === 'YEAR'
            ? b.year - a.year || a.id.localeCompare(b.id)
            : a.id.localeCompare(b.id),
      );
    const signature = JSON.stringify({ search, genre, sort });
    let offset = 0;
    if (args.after) {
      try {
        const c = JSON.parse(Buffer.from(args.after, 'base64url').toString());
        if (c.signature !== signature) throw new Error();
        const index = filtered.findIndex((t) => t.id === c.id);
        if (index < 0) throw new Error();
        offset = index + 1;
      } catch {
        throw new DomainError('Cursor does not match these discovery filters.');
      }
    }
    const entries = new Map((await this.entries(workspace)).map((e) => [e.titleId, e]));
    const edges = filtered.slice(offset, offset + first).map((t) => ({
      node: { ...t, watch: entries.get(t.id) ?? null },
      cursor: Buffer.from(JSON.stringify({ id: t.id, signature })).toString('base64url'),
    }));
    return {
      edges,
      totalCount: filtered.length,
      pageInfo: {
        endCursor: edges.at(-1)?.cursor ?? null,
        hasNextPage: offset + first < filtered.length,
      },
    };
  }
  async save(workspace: string, role: string, titleId: string, version: number, input: unknown) {
    if (role === 'VIEWER')
      throw new DomainError('Viewer mode cannot edit a watchlist.', 'FORBIDDEN');
    if (!catalog.some((t) => t.id === titleId))
      throw new DomainError('Title not found.', 'NOT_FOUND');
    const parsed = z
      .object({
        state: z.enum(['PLANNED', 'WATCHING', 'FINISHED', 'REMOVED']),
        rating: z.number().int().min(1).max(5).nullable(),
        note: z.string().trim().max(500),
      })
      .safeParse(input);
    if (!parsed.success)
      throw new DomainError(
        'Use a valid state, a rating from 1 to 5, and a note under 500 characters.',
      );
    const p = parsed.data;
    if (p.state !== 'FINISHED' && p.rating !== null)
      throw new DomainError('Ratings are available after a title is finished.');
    return this.db.transaction(async (tx) => {
      await tx.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [workspace]);
      const [old] = await tx.query<{ data: Entry }>(
        'SELECT data FROM watch_entries WHERE workspace_id=$1 AND title_id=$2',
        [workspace, titleId],
      );
      if ((old?.data.version ?? 0) !== version)
        throw new DomainError(
          'Your list changed in another tab. Refresh before saving.',
          'CONFLICT',
        );
      const now = new Date().toISOString();
      const entry: Entry = {
        titleId,
        ...p,
        version: version + 1,
        updatedAt: now,
        finishedAt: p.state === 'FINISHED' ? (old?.data.finishedAt ?? now) : null,
      };
      await tx.query(
        'INSERT INTO watch_entries(workspace_id,title_id,data) VALUES($1,$2,$3::jsonb) ON CONFLICT(workspace_id,title_id) DO UPDATE SET data=excluded.data',
        [workspace, titleId, JSON.stringify(entry)],
      );
      return entry;
    });
  }
}
