# 🚀 Csillagközi Műszak

5-player co-op party game for phones (Among Us–style map plus "blind alert" callouts).
It runs as a single Node.js process: Express serves the client and Socket.io carries the game.

## Run locally

```bash
npm install
npm start                   # prints a random PIN in the terminal
GAME_PIN=1234 npm start     # or choose your own PIN
```

Every player must enter the **PIN** once; the phone remembers it.
8 wrong guesses from one device lock it out for 5 minutes.

To test on phones over the same Wi-Fi, open `http://<your-laptop-ip>:3000`.
With only 1 player connected, the game runs in **practice mode**: you see your own alerts so you can try the mechanics alone.

Controls: joystick on the **right**, action/shop/backpack on the **left**. Pinch and double-tap zoom are blocked.

Keyboard (desktop testing): WASD/arrows to move, E/Space for action, Q for your tool, 1/2 for items, B for the shop.

## Deploy to Render (free tier)

1. Push this folder to a GitHub repo.
2. On Render, choose **New → Blueprint**, pick the repo, and it reads `render.yaml`.
   It asks for **GAME_PIN**: type the PIN you'll tell your friends (e.g. 4 digits).
   (Or **New → Web Service**: Build `npm install`, Start `npm start`, Instance type *Free*,
   then add the `GAME_PIN` environment variable yourself.)
   You can change the PIN later under the service's **Environment** tab.
3. Share the `https://<name>.onrender.com` URL with the players.

**Party-night tips**
- Open the URL **~2 minutes before** everyone joins. A sleeping free instance needs 30–60 s to cold-start.
- While any phone has the game open, it pings `/api/keepalive` every 4 minutes, so Render won't sleep mid-party.
- All game state lives in memory. A Render redeploy/restart resets the round, but phones auto-reconnect with the same avatar (stored in `localStorage`).
- Tell everyone to turn the volume up (alarm sounds) and to "Add to Home Screen" for a fullscreen feel.

## What happens in a round

- **Tasks** (yellow): 8 mini-games (Kábel-Káosz, Plazma-Csapolás, Meteor-Pajzs, Memória-Mátrix, Hullám-Kalibrálás, Csillagtérkép, Kódtörő, Energia-Zsonglőr). They get harder every wave; the Bionikus Kesztyű makes them easier.
- **Emergencies** (red), 3 kinds, needing 3+ players:
  - *normal*: everyone except the tool owner sees the room and code.
  - *split code*: one player sees only the color, another only the number.
  - *double* (from wave 2): two tools must be at the station at the same time.
- **Chaos events** every ~45–80 s: 🔦 blackout, 🙃 flipped gravity, ☄️ meteor shower, 🐀 coin-stealing rat (catch it to get the money back +25), 🤖 BÉLA shuffles everyone's tools.

## Tuning

You can also override any of them without editing code:
`CONFIG_JSON='{"TASK_PROGRESS":2,"WAVE_EVENT_INTERVAL_SEC":[60,60,50,45,40]}' npm start`
(on Render, add `CONFIG_JSON` as an environment variable).

All balance numbers are in the `CONFIG` object at the top of `server.js`: rewards, the +4%/task progress, emergency intervals per wave, quiz timing, and so on.
Shop prices are in `public/shared.js` → `UPGRADES`. Quiz questions are in `quiz.js` (the first answer is always the correct one; the server shuffles them).

## Files

| File | What |
|---|---|
| `server.js` | Authoritative game loop: bank, HP, waves, tasks, emergencies, quiz, shop, per-player filtered state |
| `quiz.js` | 46 BÉLA-9000 questions |
| `public/shared.js` | Map, tools, upgrades, collision (shared by server and client) |
| `public/game.js` | Client: networking, lobby, canvas rendering, joystick, HUD, modals |
| `public/avatar.js` | Avatar drawing (heads, hats, faces, wobble walk, cape, VIP aura) |
| `public/minigames.js` | The 5 task mini-games |
