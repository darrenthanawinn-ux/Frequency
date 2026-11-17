# Frequency

An ambient, dark-mode campus connection platform. Students appear as glowing orbs in a live constellation, not as profiles.

## Run it

```bash
npm install
npm run dev
```

Then open the local URL Vite prints (usually http://localhost:5173).

## Starting from scratch instead

```bash
npm create vite@latest frequency -- --template react-ts
cd frequency
npm install
npm install lucide-react tailwindcss @tailwindcss/vite
```

Then replace `vite.config.ts`, `src/index.css`, `src/main.tsx` and `src/App.tsx` with the files in this folder, and run `npm run dev`.

## Demo tips

- Pick a vibe in the bottom bar, type a status and zone, then hit **Broadcast** to light up your orb in the center.
- Click any orb, then **Sync Frequency** to open the ephemeral chat. Replies arrive after 1.2s.
- Toggle **Live Demo Mode** (top right) to spawn a new orb every 3 seconds.
- `Esc` closes the chat drawer, then clears the selection.

Everything lives in `src/App.tsx`.
