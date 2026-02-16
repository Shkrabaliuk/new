import { Card, cardPoints, canBeatTop, ChatMessage, ClientState, DEFAULT_RULES, isPenaltyCard, PublicPlayer, Rank, RuleConfig, RANKS, Suit, SUITS, TurnPhase } from '@game101/shared';
import { randomUUID } from 'node:crypto';

export interface PlayerState {
  id: string;
  token: string;
  name: string;
  hand: Card[];
  connected: boolean;
  socketId: string | null;
  score: number;
  isBot: boolean;
}

export interface RoomState {
  code: string;
  players: PlayerState[];
  deck: Card[];
  discardPile: Card[];
  currentPlayerIndex: number;
  requestedSuit: Suit | null;
  phase: TurnPhase;
  pendingPenaltyDraw: number;
  pendingSkip: number;
  logs: string[];
  chat: ChatMessage[];
  roundNumber: number;
  gameOver: boolean;
  winnerId: string | null;
  timer: NodeJS.Timeout | null;
  turnEndsAt: number | null;
  rules: RuleConfig;
  firstAceTriggered: boolean;
  finishingJCount: number;
}

export const createDeck = (): Card[] => {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: randomUUID(), suit, rank });
    }
  }
  return deck;
};

const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const drawOne = (room: RoomState): Card | null => {
  if (room.deck.length === 0) {
    reshuffle(room);
  }
  return room.deck.pop() ?? null;
};

export const reshuffle = (room: RoomState): void => {
  if (room.deck.length > 0 || room.discardPile.length <= 1) return;
  const top = room.discardPile[room.discardPile.length - 1];
  const rest = room.discardPile.slice(0, -1);
  room.deck = shuffle(rest);
  room.discardPile = [top];
  room.logs.push('Deck reshuffled from discard pile.');
};

const nextIndex = (room: RoomState, from: number): number => (from + 1) % room.players.length;

export const makeRoom = (code: string, rules: RuleConfig = DEFAULT_RULES): RoomState => ({
  code,
  players: [],
  deck: [],
  discardPile: [],
  currentPlayerIndex: 0,
  requestedSuit: null,
  phase: TurnPhase.Normal,
  pendingPenaltyDraw: 0,
  pendingSkip: 0,
  logs: [],
  chat: [],
  roundNumber: 0,
  gameOver: false,
  winnerId: null,
  timer: null,
  turnEndsAt: null,
  rules,
  firstAceTriggered: false,
  finishingJCount: 0
});

export const startRound = (room: RoomState): void => {
  room.roundNumber += 1;
  room.deck = shuffle(createDeck());
  room.discardPile = [];
  room.requestedSuit = null;
  room.phase = TurnPhase.Normal;
  room.pendingPenaltyDraw = 0;
  room.pendingSkip = 0;
  room.finishingJCount = 0;

  for (const player of room.players) {
    player.hand = [];
    for (let i = 0; i < 4; i++) {
      const c = room.deck.pop();
      if (c) player.hand.push(c);
    }
  }

  const dealer = room.players[room.currentPlayerIndex];
  const blind = dealer.hand.pop();
  if (!blind) {
    throw new Error('Dealer has no blind card');
  }
  room.discardPile.push(blind);
  room.logs.push(`Round ${room.roundNumber} started. Dealer ${dealer.name} placed blind opening card.`);
};

const addPenaltyFromCard = (room: RoomState, card: Card): void => {
  if (card.rank === '6') room.pendingPenaltyDraw += 1;
  if (card.rank === '7') room.pendingPenaltyDraw += 2;
  if (card.rank === 'K' && card.suit === 'S') room.pendingPenaltyDraw += 5;
  if (card.rank === 'A') {
    if (!(room.rules.firstAceNoEffect && !room.firstAceTriggered)) {
      room.pendingSkip += 1;
    }
    room.firstAceTriggered = true;
  }
};

const applyPendingToNext = (room: RoomState): void => {
  const target = room.players[nextIndex(room, room.currentPlayerIndex)];
  if (room.pendingPenaltyDraw > 0) {
    for (let i = 0; i < room.pendingPenaltyDraw; i++) {
      const c = drawOne(room);
      if (c) target.hand.push(c);
    }
    room.logs.push(`${target.name} draws ${room.pendingPenaltyDraw} penalty cards.`);
  }
  if (room.pendingSkip > 0 || room.pendingPenaltyDraw > 0) {
    room.logs.push(`${target.name} skips turn due to effect.`);
    room.currentPlayerIndex = nextIndex(room, nextIndex(room, room.currentPlayerIndex));
  } else {
    room.currentPlayerIndex = nextIndex(room, room.currentPlayerIndex);
  }
  room.pendingPenaltyDraw = 0;
  room.pendingSkip = 0;
};

export const playableCards = (room: RoomState, player: PlayerState, nineFreePlay = false): Card[] => {
  const top = room.discardPile[room.discardPile.length - 1];
  if (!top) return [];
  return player.hand.filter((c) => canBeatTop(c, top, room.requestedSuit, room.rules, nineFreePlay));
};

const endRound = (room: RoomState, winner: PlayerState, finishCard: Card): void => {
  for (const p of room.players) {
    if (p.id === winner.id) continue;
    const base = p.hand.reduce((acc, c) => acc + cardPoints(c), 0);
    p.score += base * Math.max(1, room.finishingJCount);
  }

  if (finishCard.rank === 'Q' && finishCard.suit !== 'S') winner.score -= 20;
  if (finishCard.rank === 'Q' && finishCard.suit === 'S') winner.score -= 40;
  if (finishCard.rank === 'K' && finishCard.suit === 'S') winner.score -= 50;

  for (const p of room.players) {
    if (p.score === 101) p.score = 0;
    if (p.score > 101) {
      room.gameOver = true;
      room.winnerId = room.players.find((x) => x.id !== p.id)?.id ?? winner.id;
    }
  }

  room.logs.push(`${winner.name} wins round ${room.roundNumber}.`);
  if (!room.gameOver) {
    room.currentPlayerIndex = room.players.findIndex((p) => p.id === winner.id);
    startRound(room);
  }
};

export const playCard = (room: RoomState, playerId: string, cardId: string, chosenSuit?: Suit): { ok: boolean; error?: string } => {
  const player = room.players[room.currentPlayerIndex];
  if (!player || player.id !== playerId) return { ok: false, error: 'Not your turn.' };

  const cardIdx = player.hand.findIndex((c) => c.id === cardId);
  if (cardIdx === -1) return { ok: false, error: 'Card not in hand.' };
  const card = player.hand[cardIdx];
  const nineFree = room.phase === TurnPhase.ResolvingNineExtra;

  const top = room.discardPile[room.discardPile.length - 1];
  if (!top) return { ok: false, error: 'No top card.' };
  if (!canBeatTop(card, top, room.requestedSuit, room.rules, nineFree)) {
    return { ok: false, error: 'Invalid move.' };
  }

  player.hand.splice(cardIdx, 1);
  room.discardPile.push(card);
  room.logs.push(`${player.name} played ${card.rank}${card.suit}.`);
  room.requestedSuit = null;
  room.phase = TurnPhase.EndTurn;

  if (card.rank === room.rules.jackRank) {
    room.phase = TurnPhase.ChoosingSuit;
    if (!chosenSuit) return { ok: true };
    room.requestedSuit = chosenSuit;
    room.logs.push(`${player.name} requested suit ${chosenSuit}.`);
    if (player.hand.length === 0) room.finishingJCount += 1;
  } else if (card.rank === '8') {
    room.phase = TurnPhase.ResolvingEightSelfCover;
    let guards = 0;
    while (guards < 100) {
      guards += 1;
      const p = playableCards(room, player);
      if (p.length > 0) {
        const chosen = p.sort((a, b) => cardPoints(b) - cardPoints(a))[0];
        const idx = player.hand.findIndex((x) => x.id === chosen.id);
        player.hand.splice(idx, 1);
        room.discardPile.push(chosen);
        room.logs.push(`${player.name} self-covered 8 with ${chosen.rank}${chosen.suit}.`);
        if (chosen.rank === room.rules.jackRank) {
          room.phase = TurnPhase.ChoosingSuit;
          const suit = bestSuit(player.hand);
          room.requestedSuit = suit;
          room.logs.push(`${player.name} requested suit ${suit}.`);
        }
        addPenaltyFromCard(room, chosen);
        break;
      }
      const draw = drawOne(room);
      if (!draw) break;
      player.hand.push(draw);
      room.logs.push(`${player.name} draws while resolving 8.`);
    }
  } else if (card.rank === '9') {
    room.phase = TurnPhase.ResolvingNineExtra;
    return { ok: true };
  }

  addPenaltyFromCard(room, card);

  if (player.hand.length === 0) {
    if (card.rank === room.rules.jackRank) room.finishingJCount += 1;
    endRound(room, player, card);
    return { ok: true };
  }

  if (room.phase !== TurnPhase.ResolvingNineExtra && room.phase !== TurnPhase.ChoosingSuit) {
    applyPendingToNext(room);
    room.phase = TurnPhase.Normal;
  }

  return { ok: true };
};

export const chooseSuit = (room: RoomState, playerId: string, suit: Suit): { ok: boolean; error?: string } => {
  const player = room.players[room.currentPlayerIndex];
  if (!player || player.id !== playerId) return { ok: false, error: 'Not your turn.' };
  if (room.phase !== TurnPhase.ChoosingSuit) return { ok: false, error: 'Not choosing suit now.' };
  room.requestedSuit = suit;
  room.logs.push(`${player.name} requested suit ${suit}.`);
  applyPendingToNext(room);
  room.phase = TurnPhase.Normal;
  return { ok: true };
};

export const drawAndMaybePass = (room: RoomState, playerId: string): { ok: boolean; error?: string } => {
  const player = room.players[room.currentPlayerIndex];
  if (!player || player.id !== playerId) return { ok: false, error: 'Not your turn.' };
  const c = drawOne(room);
  if (c) {
    player.hand.push(c);
    room.logs.push(`${player.name} drew a card.`);
  }
  const can = playableCards(room, player).length > 0;
  if (!can) {
    room.logs.push(`${player.name} passes.`);
    applyPendingToNext(room);
  }
  room.phase = TurnPhase.Normal;
  return { ok: true };
};

export const publicStateFor = (room: RoomState, playerId: string): ClientState => {
  const players: PublicPlayer[] = room.players.map((p) => ({ id: p.id, name: p.name, handCount: p.hand.length, connected: p.connected, score: p.score, isBot: p.isBot }));
  const you = room.players.find((p) => p.id === playerId);
  return {
    roomCode: room.code,
    yourId: playerId,
    yourHand: you?.hand ?? [],
    players,
    topCard: room.discardPile[room.discardPile.length - 1] ?? null,
    deckSize: room.deck.length,
    currentPlayerId: room.players[room.currentPlayerIndex]?.id ?? null,
    phase: room.phase,
    requestedSuit: room.requestedSuit,
    pendingPenaltyDraw: room.pendingPenaltyDraw,
    pendingSkip: room.pendingSkip,
    logs: room.logs.slice(-12),
    chat: room.chat.slice(-20),
    roundNumber: room.roundNumber,
    gameOver: room.gameOver,
    winnerId: room.winnerId,
    turnEndsAt: room.turnEndsAt
  };
};

export const bestSuit = (cards: Card[]): Suit => {
  const counts: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };
  for (const c of cards) counts[c.suit] += 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as Suit;
};

export const chooseAiMove = (room: RoomState, bot: PlayerState, difficulty: 'easy' | 'normal' | 'hard'): { type: 'play'; card: Card; suit?: Suit } | { type: 'draw' } => {
  const valid = playableCards(room, bot, room.phase === TurnPhase.ResolvingNineExtra);
  if (valid.length === 0) return { type: 'draw' };
  if (difficulty === 'easy') return { type: 'play', card: valid[Math.floor(Math.random() * valid.length)] };

  const opp = room.players.find((p) => p.id !== bot.id);
  const scored = valid.map((c) => {
    let score = cardPoints(c);
    if (isPenaltyCard(c) && (opp?.hand.length ?? 10) <= 2) score += 10;
    if (c.rank === '8') score -= 3;
    if (c.rank === room.rules.jackRank) score += 4;
    if (difficulty === 'hard') {
      const simulatedTop = c;
      const oppPlayable = opp ? opp.hand.filter((h) => canBeatTop(h, simulatedTop, c.rank === room.rules.jackRank ? bestSuit(bot.hand) : null, room.rules)).length : 0;
      score -= oppPlayable;
    }
    return { c, score };
  }).sort((a, b) => b.score - a.score);

  const pick = scored[0].c;
  if (pick.rank === room.rules.jackRank) return { type: 'play', card: pick, suit: bestSuit(bot.hand.filter((x) => x.id !== pick.id)) };
  return { type: 'play', card: pick };
};

export const createRoomCode = (): string => Math.random().toString(36).slice(2, 8).toUpperCase();

export const makePlayer = (name: string, isBot = false): PlayerState => ({
  id: randomUUID(),
  token: randomUUID(),
  name,
  hand: [],
  connected: true,
  socketId: null,
  score: 0,
  isBot
});
