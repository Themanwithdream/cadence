# Cadence

**Presence · Clarity · Negotiation**

Cadence is a calm, browser-native speaking and negotiation practice studio. Practice in front of your camera or microphone—with zero accounts, zero API keys, and 100% on-device privacy.

## What You Can Practice
- **Camera & Presence**: Train steady lens eye-line with the top-center Eye-Line Beacon and organic 60fps Voice & Power-Pause Ribbon.
- **Clear Thinking**: Structure impromptu responses using live non-scripted beat prompts (`BLUF / Pyramid`, `PREP`, `What · So What · Now What`, `Hook · PSI`).
- **Negotiation**: Respond calmly to realistic counterpart pushback with `Tactical Empathy` and `Principled Pushback`, deliberate Power Pauses, and Dynamic Silence.
- **Custom Scenarios**: Create, edit, and save your own scenarios locally for upcoming pitches, interviews, or tough conversations.
- **Fast Mirror Review**: Watch or listen back immediately with a clickable Cadence Timeline (vocal energy, Power Pauses, gentle filler markers), Take 1 → Take 2 shifts, and local History.

## Run Locally
```bash
npm install
npm run dev
```

Build for production:
```bash
npm run build
npm run preview
```

## GitHub Pages Deployment
This repository includes `.github/workflows/deploy.yml` and configures Vite with `base: './'` so assets resolve cleanly under any GitHub Pages subpath.

1. Push this repository to GitHub on the `main` branch.
2. In your repository **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Every push to `main` (or manual workflow dispatch) builds `dist/` and deploys live over HTTPS—enabling webcam, microphone, and speech recognition directly in the browser.
