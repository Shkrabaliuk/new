import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { Suit, TurnPhase } from '@game101/shared';
import { chooseAiMove, chooseSuit, createRoomCode, drawAndMaybePass, makePlayer, makeRoom, playCard, publicStateFor, RoomState, startRound } from './game.js';

const app = express();
app.use(cors());
app.get('/health', (_, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = new Map<string, RoomState>();
const difficultyByRoom = new Map<string, 'easy' | 'normal' | 'hard'>();

const sendState = (room: RoomState) => {
  for (const p of room.players) {
    if (p.socketId) {
      io.to(p.socketId).emit('state', publicStateFor(room, p.id));
    }
  }
};

const restartTimer = (room: RoomState) => {
  if (room.timer) clearTimeout(room.timer);
  room.turnEndsAt = Date.now() + room.rules.turnTimeoutMs;
  room.timer = setTimeout(() => {
    const player = room.players[room.currentPlayerIndex];
    if (!player) return;
    drawAndMaybePass(room, player.id);
    room.logs.push(`Auto action for ${player.name} due to timeout.`);
    sendState(room);
    maybeRunBot(room);
    restartTimer(room);
  }, room.rules.turnTimeoutMs);
};

const maybeRunBot = (room: RoomState) => {
  const current = room.players[room.currentPlayerIndex];
  if (!current?.isBot || room.gameOver) return;
  const difficulty = difficultyByRoom.get(room.code) ?? 'normal';
  const move = chooseAiMove(room, current, difficulty);
  if (move.type === 'draw') drawAndMaybePass(room, current.id);
  else {
    playCard(room, current.id, move.card.id, move.suit);
    if (room.phase === TurnPhase.ChoosingSuit && move.suit) {
      chooseSuit(room, current.id, move.suit);
    }
  }
  sendState(room);
};

io.on('connection', (socket) => {
  const createSchema = z.object({ name: z.string().min(1).max(20) });
  socket.on('create_room', (payload) => {
    const parsed = createSchema.safeParse(payload);
    if (!parsed.success) return;
    const code = createRoomCode();
    const room = makeRoom(code);
    const player = makePlayer(parsed.data.name);
    player.socketId = socket.id;
    room.players.push(player);
    rooms.set(code, room);
    socket.join(code);
    socket.emit('joined', { roomCode: code, playerToken: player.token, playerId: player.id });
    sendState(room);
    console.log(`Room created ${code}`);
  });

  const joinSchema = z.object({ roomCode: z.string().length(6), name: z.string().min(1).max(20) });
  socket.on('join_room', (payload) => {
    const parsed = joinSchema.safeParse(payload);
    if (!parsed.success) return;
    const room = rooms.get(parsed.data.roomCode.toUpperCase());
    if (!room) return socket.emit('error_message', 'Room not found');
    if (room.players.length >= 4) return socket.emit('error_message', 'Room full');
    const player = makePlayer(parsed.data.name);
    player.socketId = socket.id;
    room.players.push(player);
    socket.join(room.code);
    socket.emit('joined', { roomCode: room.code, playerToken: player.token, playerId: player.id });
    if (room.players.length >= 2 && room.roundNumber === 0) {
      startRound(room);
      restartTimer(room);
    }
    sendState(room);
    console.log(`Join room ${room.code}`);
  });

  const reconnectSchema = z.object({ roomCode: z.string().length(6), token: z.string() });
  socket.on('reconnect_room', (payload) => {
    const parsed = reconnectSchema.safeParse(payload);
    if (!parsed.success) return;
    const room = rooms.get(parsed.data.roomCode.toUpperCase());
    if (!room) return;
    const player = room.players.find((p) => p.token === parsed.data.token);
    if (!player) return;
    player.connected = true;
    player.socketId = socket.id;
    socket.join(room.code);
    socket.emit('joined', { roomCode: room.code, playerToken: player.token, playerId: player.id });
    sendState(room);
  });

  const playSchema = z.object({ roomCode: z.string().length(6), playerId: z.string(), cardId: z.string(), suit: z.enum(['S', 'H', 'D', 'C']).optional() });
  socket.on('play_card', (payload) => {
    const p = playSchema.safeParse(payload);
    if (!p.success) return;
    const room = rooms.get(p.data.roomCode.toUpperCase());
    if (!room) return;
    const res = playCard(room, p.data.playerId, p.data.cardId, p.data.suit as Suit | undefined);
    if (!res.ok) socket.emit('error_message', res.error);
    if (room.phase === TurnPhase.ChoosingSuit && p.data.suit) chooseSuit(room, p.data.playerId, p.data.suit as Suit);
    sendState(room);
    maybeRunBot(room);
    restartTimer(room);
  });

  const chooseSuitSchema = z.object({ roomCode: z.string().length(6), playerId: z.string(), suit: z.enum(['S', 'H', 'D', 'C']) });
  socket.on('choose_suit', (payload) => {
    const p = chooseSuitSchema.safeParse(payload);
    if (!p.success) return;
    const room = rooms.get(p.data.roomCode.toUpperCase());
    if (!room) return;
    chooseSuit(room, p.data.playerId, p.data.suit as Suit);
    sendState(room);
    maybeRunBot(room);
    restartTimer(room);
  });

  const drawSchema = z.object({ roomCode: z.string().length(6), playerId: z.string() });
  socket.on('draw_pass', (payload) => {
    const p = drawSchema.safeParse(payload);
    if (!p.success) return;
    const room = rooms.get(p.data.roomCode.toUpperCase());
    if (!room) return;
    drawAndMaybePass(room, p.data.playerId);
    sendState(room);
    maybeRunBot(room);
    restartTimer(room);
  });

  const chatSchema = z.object({ roomCode: z.string().length(6), playerId: z.string(), text: z.string().min(1).max(200) });
  socket.on('chat_send', (payload) => {
    const p = chatSchema.safeParse(payload);
    if (!p.success) return;
    const room = rooms.get(p.data.roomCode.toUpperCase());
    if (!room) return;
    const author = room.players.find((x) => x.id === p.data.playerId);
    if (!author) return;
    room.chat.push({ id: randomUUID(), from: author.name, text: p.data.text, at: Date.now() });
    sendState(room);
  });

  const leaveSchema = z.object({ roomCode: z.string().length(6), playerId: z.string() });
  socket.on('leave_room', (payload) => {
    const p = leaveSchema.safeParse(payload);
    if (!p.success) return;
    const room = rooms.get(p.data.roomCode.toUpperCase());
    if (!room) return;
    room.players = room.players.filter((x) => x.id !== p.data.playerId || x.isBot);
    sendState(room);
  });

  const aiSchema = z.object({ name: z.string().min(1).max(20), difficulty: z.enum(['easy', 'normal', 'hard']) });
  socket.on('start_ai', (payload) => {
    const p = aiSchema.safeParse(payload);
    if (!p.success) return;
    const code = createRoomCode();
    const room = makeRoom(code);
    const human = makePlayer(p.data.name);
    human.socketId = socket.id;
    const bot = makePlayer(`AI (${p.data.difficulty})`, true);
    bot.connected = true;
    room.players.push(human, bot);
    rooms.set(code, room);
    difficultyByRoom.set(code, p.data.difficulty);
    socket.join(code);
    startRound(room);
    restartTimer(room);
    socket.emit('joined', { roomCode: code, playerToken: human.token, playerId: human.id });
    sendState(room);
    if (room.players[room.currentPlayerIndex].isBot) {
      maybeRunBot(room);
      restartTimer(room);
    }
  });

  socket.on('disconnect', () => {
    for (const room of rooms.values()) {
      const p = room.players.find((x) => x.socketId === socket.id);
      if (p) {
        p.connected = false;
        p.socketId = null;
        sendState(room);
      }
    }
  });
});

server.listen(3001, () => console.log('Server on http://localhost:3001'));
