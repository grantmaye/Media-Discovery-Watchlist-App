export type WatchState = 'PLANNED' | 'WATCHING' | 'FINISHED' | 'REMOVED';
export type Entry = {
  titleId: string;
  state: WatchState;
  rating: number | null;
  note: string;
  version: number;
  updatedAt: string;
  finishedAt: string | null;
};
export type Title = {
  id: string;
  name: string;
  genre: string;
  year: number;
  minutes: number;
  director: string;
  description: string;
  tagline: string;
  palette: string;
  motif: number;
  watch: Entry | null;
};
export class DomainError extends Error {
  constructor(
    message: string,
    public code = 'BAD_USER_INPUT',
  ) {
    super(message);
  }
}
