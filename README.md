# LAC Demo Page

This repository contains a static demo webpage for **Communicating Sound Through Natural Language (LAC)**.

## What is included

- `docs/`: HTML/CSS/JS for the demo interface.
- `docs/data/`: demo content (`manifest.json`, samples, songs, audio files, waveforms).
- `docs/tools/`: PowerShell utilities to refresh/sync manifest data.

## Run locally

Simply open `docs/index.html`.

## Notes

- The page loads demo content from `docs/data/manifest.json` (with fallback to `manifest.js`) when deployed from GitHub Pages.
- GitHub Pages should be configured to publish from the `docs/` folder.
- If you update audio/example folders, use scripts in `docs/tools/` to refresh metadata.
