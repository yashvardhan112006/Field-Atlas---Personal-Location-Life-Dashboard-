# Recall — Day Reconstruction

A local-first life timeline that correlates Google Timeline, Spotify extended
history, Chrome Takeout history, Samsung Health, Chess.com PGNs, and Google Meet.

```bash
npm start
```

Open `http://localhost:8088`. All processing stays on this machine. Times are
normalized to Asia/Kolkata. The initial launch indexes the source exports in
memory; subsequent date changes use the day index.

The interactive map uses OpenStreetMap tiles by default. To resolve unnamed
coordinates with Google's Geocoding API, start with:

```bash
GOOGLE_MAPS_API_KEY=your_key npm start
```

Without a Google key, address lookups fall back to OpenStreetMap Nominatim.
