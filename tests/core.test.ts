import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../src/lib/database';
import { migrate } from '../src/lib/schema';
import { Service } from '../src/lib/service';
import { createApi, contextFor } from '../src/lib/graphql';
test('discovery pagination, filter-bound cursors, ratings, stale writes and removed-entry versions', async () => {
  const db = await createDatabase(process.env.TEST_DATABASE_URL);
  await migrate(db);
  const s = new Service(db),
    w = crypto.randomUUID(),
    other = crypto.randomUUID(),
    api = createApi();
  await api.start();
  try {
    await s.initialize(w);
    await s.initialize(other);
    const page = await s.browse(w, { first: 8 });
    assert.equal(page.totalCount, 20);
    assert.equal(page.edges.length, 8);
    const next = await s.browse(w, { first: 8, after: page.pageInfo.endCursor! });
    assert.equal(new Set([...page.edges, ...next.edges].map((e) => e.node.id)).size, 16);
    await assert.rejects(s.browse(w, { genre: 'Drama', after: page.pageInfo.endCursor! }));
    assert.equal((await s.browse(w, { search: 'static bloom' })).totalCount, 1);
    await assert.rejects(
      s.save(w, 'OWNER', 'film-01', 0, { state: 'PLANNED', rating: 3, note: '' }),
    );
    const results = await Promise.allSettled([
      s.save(w, 'OWNER', 'film-01', 0, { state: 'PLANNED', rating: null, note: '' }),
      s.save(w, 'OWNER', 'film-01', 0, { state: 'WATCHING', rating: null, note: '' }),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const e = await s.save(w, 'OWNER', 'film-01', 1, {
      state: 'FINISHED',
      rating: 5,
      note: 'Stayed with me.',
    });
    assert.ok(e.finishedAt);
    assert.equal((await s.library(other)).length, 0);
    await assert.rejects(
      s.save(w, 'VIEWER', 'film-01', 2, { state: 'REMOVED', rating: null, note: '' }),
    );
    await s.save(w, 'OWNER', 'film-01', 2, { state: 'REMOVED', rating: null, note: '' });
    assert.equal((await s.library(w)).length, 0);
    await assert.rejects(
      s.save(w, 'OWNER', 'film-01', 0, { state: 'PLANNED', rating: null, note: '' }),
    );
    const readded = await s.save(w, 'OWNER', 'film-01', 3, {
      state: 'PLANNED',
      rating: null,
      note: '',
    });
    assert.equal(readded.version, 4);
    const response = await api.executeOperation(
      { query: '{browse(first:2){edges{node{id watch{state}}}}library{title{name}}}' },
      { contextValue: contextFor(s, w, 'OWNER') },
    );
    if (response.body.kind === 'single') assert.equal(response.body.singleResult.errors, undefined);
  } finally {
    await api.stop();
    await db.close();
  }
});
