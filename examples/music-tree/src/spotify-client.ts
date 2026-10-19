// The client id of the app on developer.spotify.com/dashboard (its redirect URI: http://127.0.0.1:8765/callback), built into the app so
// that a computer that never ran zinc logs in from the app alone (zinc:spotify Login, PKCE: the id is public, there is no secret).
// '': the login file's id only. A Spotify app in development mode lets 5 accounts in, each added under User Management in the dashboard.
// The repository keeps it empty: a build that is given away sets it here and keeps it out of commits
// (git update-index --skip-worktree examples/music-tree/src/spotify-client.ts).
export const SPOTIFY_CLIENT_ID = '';
