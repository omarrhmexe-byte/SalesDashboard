# CHIKORANT

A short first-person tactical shooter made as a private birthday + farewell gift for Chikero.
Built with Vite + three.js. Everything is procedural or bundled locally: all geometry, textures and sounds are generated at runtime. The only external request is Google Fonts.

## Run it

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # static site in dist/
npm run preview   # serve dist/ locally
```

## Adding a voice note (the only thing you should need to edit)

1. Drop the files in `public/vm/<name>.mp3` and `public/m/<name>.jpg`.
2. Add one line to `VOICE_NOTES` in `src/config.js`:

```js
{ from: 'Name', photo: 'm/name.jpg', audio: 'vm/name.mp3', line: 'Danced like nobody was watching. Name checks in.' },
```

Round 1 unlocks note 1, round 2 unlocks note 2, and so on. Round 3 currently shows its "another voice note is on its way" placeholder. When you add more notes than there are combat rounds, bonus rounds are generated automatically before the final "Plant the Cake" round. Every note can also be replayed from the ending screen.

Round titles, bot names and the ending text are also in `src/config.js`.

## Controls

Desktop: WASD to move, mouse to aim, click to fire, R to reload, Space to jump, Shift to walk, Q/E/X for abilities, F to plant, Esc to pause (volume, sensitivity, quality).
Phone (landscape): left stick to move, drag on the right half to aim, plus FIRE / JUMP / R / Q / E / X and PLANT buttons. Aim assist is stronger on phones.

## URL flags

- `?q=low` or `?q=high` forces a quality level. Phones default to low: no shadows, no bloom, lower pixel ratio.
- `?debug` exposes `window.G` for testing. `?skip` jumps straight into round 1.

## Deploy (Vercel)

The project root for Vercel is this `chikorant/` folder (`vercel.json` is included).

```bash
cd chikorant
npx vercel --prod
npx vercel domains add chikero.1597.in
```

Then add this DNS record at the DNS host for `1597.in`:

| Type  | Name      | Value                  |
|-------|-----------|------------------------|
| CNAME | `chikero` | `cname.vercel-dns.com` |

`1597.in` uses Cloudflare DNS, so set the record to **DNS only** (grey cloud) so Vercel can issue the SSL certificate. Vercel also accepts its project-specific target `4083706a3192fd7b.vercel-dns-017.com` in place of `cname.vercel-dns.com`.

Live project: Vercel project `chikorant` (production alias `chikorant.vercel.app`, which sits behind Vercel login; the custom domain is public).

The game is served at the root URL, so the printed QR code can point straight at `https://chikero.1597.in/`.

## Code map

| File | What it does |
|------|--------------|
| `src/config.js` | Voice notes, rounds, bot names, ending text |
| `src/game.js` | Renderer, player controller, weapon, abilities, round flow, HUD |
| `src/map.js` | The ZYOIN HQ map: geometry, props, signs, cat, nav graph |
| `src/physics.js` | Capsule-vs-AABB collision and ray queries |
| `src/bots.js` | Deadline Bots: model, AI, projectiles, waypoint navigation |
| `src/weapon.js` | "The Aux Cord" viewmodel |
| `src/post.js` | Bloom, ACES tone mapping, golden grade, vignette, FXAA |
| `src/fx.js` | Particles, tracers, decals, confetti, fireworks |
| `src/audio.js` | Procedural WebAudio sound effects and music |
| `src/ui.js`, `src/style.css` | Agent select, HUD widgets, unlock card, ending |

Private, non-commercial fan gift. Not affiliated with any game studio.
