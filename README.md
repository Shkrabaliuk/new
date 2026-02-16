# 101 (Фараон / Мавр / Японський дурень)

Production-ready TypeScript web game with:
- Online room mode (create/join/reconnect, turn timer, chat)
- Play vs AI (easy/normal/hard)
- Authoritative server-side game engine with strict move validation

## Stack
- **Frontend**: React + Vite + Tailwind
- **Backend**: Node.js + Express + Socket.IO
- **Shared types/rules**: TypeScript package `@game101/shared`
- **Storage**: In-memory state (can be replaced with Redis adapter)

## Rules implemented
- Deck: 36 cards (6..A, 4 suits)
- Deal: 4 cards each, dealer places 4th blind as opening top card
- Draw/pass when no move, reshuffle discard into deck when deck empty
- Special cards:
  - 6 => next player draws +1 and skips
  - 7 => next player draws +2 and skips
  - 8 => self-cover (draw until can cover if needed)
  - 9 => grants one extra immediate play; **9♠ universal**
  - J (configurable with Q variant) => universal + choose suit
  - K♠ => next player draws +5 and skips
  - A => next player skips (config supports firstAceNoEffect)
- Turn phases modeled by finite state machine (`TurnPhase` enum)
- Round end and scoring to 101 with bonus deductions (Q/Q♠/K♠)

## Project structure

```
.
├── client/                 # React app
│   ├── src/
│   │   ├── main.tsx
│   │   └── styles.css
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── tsconfig.json
│   └── vite.config.ts
├── server/                 # Express + Socket.IO server
│   ├── src/
│   │   ├── game.ts         # Game engine / AI / scoring
│   │   └── index.ts        # Socket handlers / room lifecycle
│   ├── package.json
│   └── tsconfig.json
├── shared/
│   ├── src/index.ts        # Shared types, rules, helpers
│   ├── package.json
│   └── tsconfig.json
└── package.json            # Workspaces + dev command
```

## Run locally

```bash
npm install
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

## Gameplay quick start
1. Enter name.
2. Click **Create room** and share room code, or **Join room**.
3. Or click **Play vs AI** and choose difficulty.
4. Play cards from hand (valid cards highlighted), draw/pass with button.
5. Choose suit in modal after J.

## Reconnection
The client stores `{roomCode, playerToken}` in localStorage and auto-sends `reconnect_room` on reload.

## Notes for Redis migration
Replace in-memory `rooms: Map<string, RoomState>` with Redis-backed room store and optional Socket.IO Redis adapter. Engine is pure state transitions, so persistence layer can be swapped without changing move validation.
