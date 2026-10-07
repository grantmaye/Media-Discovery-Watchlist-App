'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDialog } from './use-dialog';
import { ArrowDown, ArrowUpRight, Bookmark, Check, Plus, Search, Star, X } from 'lucide-react';
import { request } from '@/lib/client';
import type { Entry, Title, WatchState } from '@/lib/model';
type LibraryEntry = Entry & { title: Title };
type Connection = {
  edges: { node: Title; cursor: string }[];
  totalCount: number;
  pageInfo: { endCursor: string | null; hasNextPage: boolean };
};
const fields =
  'id name genre year minutes director description tagline palette motif watch{titleId state rating note version updatedAt finishedAt}';
const browseQuery = `query Browse($search:String,$genre:String,$sort:String,$after:String){browse(search:$search,genre:$genre,sort:$sort,first:8,after:$after){edges{cursor node{${fields}}}totalCount pageInfo{endCursor hasNextPage}}genres library{titleId state rating note version updatedAt finishedAt title{${fields}}}}`;
function Poster({ title, large = false }: { title: Title; large?: boolean }) {
  return (
    <div className={`poster palette-${title.palette} motif-${title.motif} ${large ? 'large' : ''}`}>
      <span className="poster-shape" />
      <span className="poster-shape second" />
      <div className="poster-type">{title.name}</div>
      <span className="poster-tagline">{title.tagline}</span>
      <span className="poster-credit">A FILM BY {title.director.toUpperCase()}</span>
    </div>
  );
}
export default function Discovery() {
  const [connection, setConnection] = useState<Connection | null>(null),
    [library, setLibrary] = useState<LibraryEntry[]>([]),
    [genres, setGenres] = useState<string[]>([]),
    [search, setSearch] = useState(''),
    [genre, setGenre] = useState(''),
    [sort, setSort] = useState('CURATED'),
    [tab, setTab] = useState('discover'),
    [listFilter, setListFilter] = useState('ALL'),
    [selected, setSelected] = useState<Title | null>(null),
    [state, setState] = useState<WatchState>('PLANNED'),
    [rating, setRating] = useState<number | null>(null),
    [note, setNote] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [featured, setFeatured] = useState<Title | null>(null);
  const closeDialog = useCallback(() => setSelected(null), []);
  useDialog(Boolean(selected), closeDialog);
  const activeFilters = useRef({ search: '', genre: '', sort: 'CURATED', revision: 0 });
  async function load(after?: string) {
    const filters = activeFilters.current;
    const r = await request<{ browse: Connection; library: LibraryEntry[]; genres: string[] }>(
      browseQuery,
      { search: filters.search, genre: filters.genre, sort: filters.sort, after },
    );
    if (filters.revision !== activeFilters.current.revision) return r;
    setConnection((c) =>
      after && c ? { ...r.browse, edges: [...c.edges, ...r.browse.edges] } : r.browse,
    );
    setLibrary(r.library);
    setGenres(r.genres);
    return r;
  }
  useEffect(() => {
    activeFilters.current = { search, genre, sort, revision: activeFilters.current.revision + 1 };
    // Hide the old cursor immediately; it belongs to a different set of filters.
    setConnection(null);
    let alive = true;
    const timer = setTimeout(() => {
      request<{ browse: Connection; library: LibraryEntry[]; genres: string[] }>(browseQuery, {
        search,
        genre,
        sort,
      })
        .then((r) => {
          if (alive) {
            setConnection(r.browse);
            setLibrary(r.library);
            setGenres(r.genres);
            setFeatured((current) => current ?? r.browse.edges[0]?.node ?? null);
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    }, 180);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [search, genre, sort]);
  function open(t: Title) {
    const entry = library.find((e) => e.titleId === t.id) ?? t.watch;
    setSelected({ ...t, watch: entry ?? null });
    setState(entry && entry.state !== 'REMOVED' ? entry.state : 'PLANNED');
    setRating(entry?.rating ?? null);
    setNote(entry?.note ?? '');
    setError('');
  }
  async function save(
    t: Title,
    nextState: WatchState,
    nextRating: number | null,
    nextNote: string,
    close = false,
  ) {
    setBusy(true);
    setError('');
    try {
      const entry = library.find((e) => e.titleId === t.id) ?? t.watch;
      const r = await request<{ save: Entry }>(
        'mutation Save($titleId:ID!,$version:Int!,$input:SaveInput!){save(titleId:$titleId,version:$version,input:$input){titleId state rating note version updatedAt finishedAt}}',
        {
          titleId: t.id,
          version: entry?.version ?? 0,
          input: { state: nextState, rating: nextRating, note: nextNote },
        },
      );
      if (featured?.id === t.id) setFeatured({ ...featured, watch: r.save });
      await load();
      if (close) setSelected(null);
      else if (selected?.id === t.id) setSelected({ ...t, watch: r.save });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const titles =
    tab === 'discover'
      ? (connection?.edges.map((e) => e.node) ?? [])
      : library
          .filter((e) => listFilter === 'ALL' || e.state === listFilter)
          .map((e) => ({ ...e.title, watch: e }));
  const count = library.length;
  return (
    <div className="frame">
      <header>
        <a href="/" className="brand">
          frame<span className="brand-mark">✳</span>
        </a>
        <nav>
          <button className={tab === 'discover' ? 'active' : ''} onClick={() => setTab('discover')}>
            Discover
          </button>
          <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}>
            Your watchlist <span>{count}</span>
          </button>
        </nav>
        <span className="edition">Fictional film catalog</span>
      </header>
      <main>
        {tab === 'discover' && featured && (
          <section className="hero">
            <div className="hero-copy">
              <h1>
                Stay for
                <br />
                <em>the story.</em>
              </h1>
              <p>
                For the films you stumble upon.
                <br />
                The ones you keep thinking about.
                <br />
                And the ones you haven’t found yet.
              </p>
              <div className="featured-meta">
                <span>
                  {featured.genre} / {featured.year} / {featured.minutes} MIN
                </span>
                <h2>{featured.name}</h2>
                <p>{featured.description}</p>
              </div>
              <button className="primary" onClick={() => open(featured)}>
                Explore the film <ArrowUpRight size={18} />
              </button>
            </div>
            <button
              aria-label={`Explore ${featured.name}`}
              className="hero-poster"
              onClick={() => open(featured)}
            >
              <Poster title={featured} large />
            </button>
          </section>
        )}
        <section className="catalog">
          <div className="catalog-heading">
            <div>
              <h2>
                {tab === 'discover' ? 'What are you in the mood for?' : 'Good stories, kept close.'}
              </h2>
            </div>
            <span>
              {tab === 'discover' ? (connection?.totalCount ?? '—') : titles.length} TITLES
            </span>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {tab === 'discover' ? (
            <>
              <div className="genres">
                <button className={!genre ? 'active' : ''} onClick={() => setGenre('')}>
                  Everything
                </button>
                {genres.map((g) => (
                  <button
                    className={genre === g ? 'active' : ''}
                    key={g}
                    onClick={() => setGenre(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <div className="filter-row">
                <label>
                  <Search size={16} />
                  <input
                    aria-label="Search films"
                    placeholder="A title, a director, a little curiosity…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Sort films"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="CURATED">Editor’s order</option>
                  <option value="TITLE">Title A–Z</option>
                  <option value="YEAR">Newest year</option>
                </select>
              </div>
            </>
          ) : (
            <div className="genres">
              {[
                ['ALL', 'All saved'],
                ['PLANNED', 'Up next'],
                ['WATCHING', 'Watching'],
                ['FINISHED', 'Finished'],
              ].map(([s, label]) => (
                <button
                  key={s}
                  className={listFilter === s ? 'active' : ''}
                  onClick={() => setListFilter(s)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="film-grid">
            {titles.map((t) => {
              const saved = t.watch && t.watch.state !== 'REMOVED';
              return (
                <article className="film-card" key={t.id}>
                  <button
                    className="poster-button"
                    aria-label={`Open ${t.name}`}
                    onClick={() => open(t)}
                  >
                    <Poster title={t} />
                  </button>
                  <div className="film-line">
                    <span>
                      {t.genre} / {t.year}
                    </span>
                    <button
                      aria-label={`${saved ? 'Saved' : 'Save'} ${t.name}`}
                      className={saved ? 'saved' : ''}
                      disabled={busy}
                      onClick={() => (saved ? open(t) : save(t, 'PLANNED', null, ''))}
                    >
                      {saved ? <Check size={16} /> : <Plus size={16} />}
                    </button>
                  </div>
                  <button className="film-name" onClick={() => open(t)}>
                    {t.name}
                  </button>
                  <p>
                    {t.minutes} min <i>·</i> {t.director}
                  </p>
                  {saved && (
                    <span className="watch-state">
                      {t.watch?.state === 'PLANNED' ? 'UP NEXT' : t.watch?.state}
                      {t.watch?.rating ? ` / ${t.watch.rating} OF 5` : ''}
                    </span>
                  )}
                </article>
              );
            })}
          </div>
          {!titles.length && (
            <div className="empty">
              <Bookmark size={30} />
              <h3>{tab === 'library' ? 'The opening credits are yours.' : 'No films found.'}</h3>
              <p>
                {tab === 'library'
                  ? 'Save a film from Discover to start your list.'
                  : 'Try a broader search or a different genre.'}
              </p>
            </div>
          )}
          {tab === 'discover' && connection?.pageInfo.hasNextPage && (
            <button
              className="load-more"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await load(connection.pageInfo.endCursor ?? undefined);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              A few more stories <ArrowDown size={15} />
            </button>
          )}
        </section>
        <section className="editorial">
          <p>
            A watchlist should feel
            <br />
            like a <em>promise to yourself.</em>
          </p>
          <div>
            Not another endless feed.
            <br />A place to remember what caught your eye.
          </div>
        </section>
      </main>
      <footer>
        <a className="brand" href="/">
          frame✳
        </a>
        <p>
          Original fictional films and graphic covers.
          <br />
          No streaming availability or real film metadata is implied.
        </p>
      </footer>
      {selected && (
        <div className="overlay">
          <section className="detail" role="dialog" aria-modal="true" aria-label="Film details">
            <button className="close" aria-label="Close film" onClick={() => setSelected(null)}>
              <X />
            </button>
            <div className="detail-art">
              <Poster title={selected} />
            </div>
            <div className="detail-copy">
              <span className="film-metadata">
                {selected.genre} / {selected.year} / {selected.minutes} MIN
              </span>
              <h2>{selected.name}</h2>
              <p className="director">A fictional film by {selected.director}</p>
              <p>{selected.description}</p>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save(selected, state, state === 'FINISHED' ? rating : null, note, true);
                }}
              >
                <label>
                  Status
                  <select
                    aria-label="Watch status"
                    value={state}
                    onChange={(e) => {
                      setState(e.target.value as WatchState);
                      setRating(null);
                    }}
                  >
                    <option value="PLANNED">Up next</option>
                    <option value="WATCHING">Watching</option>
                    <option value="FINISHED">Finished</option>
                  </select>
                </label>
                {state === 'FINISHED' && (
                  <fieldset>
                    <legend>Your rating</legend>
                    <div className="stars">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          type="button"
                          aria-label={`Rate ${n} of 5`}
                          aria-pressed={rating === n}
                          key={n}
                          onClick={() => setRating(rating === n ? null : n)}
                        >
                          <Star size={23} fill={rating && n <= rating ? 'currentColor' : 'none'} />
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}
                <label>
                  Your note
                  <textarea
                    aria-label="Your note"
                    value={note}
                    maxLength={500}
                    rows={3}
                    placeholder="What stayed with you?"
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <button className="primary" disabled={busy}>
                  Save to your list <ArrowUpRight size={16} />
                </button>
                {selected.watch && selected.watch.state !== 'REMOVED' && (
                  <button
                    type="button"
                    className="remove"
                    disabled={busy}
                    onClick={() => save(selected, 'REMOVED', null, '', true)}
                  >
                    Remove from watchlist
                  </button>
                )}
              </form>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
