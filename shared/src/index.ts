export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export enum TurnPhase {
  Normal = 'Normal',
  ResolvingEightSelfCover = 'ResolvingEightSelfCover',
  ResolvingNineExtra = 'ResolvingNineExtra',
  ChoosingSuit = 'ChoosingSuit',
  ApplyingPenaltyDraw = 'ApplyingPenaltyDraw',
  EndTurn = 'EndTurn'
}

export interface RuleConfig {
  firstAceNoEffect: boolean;
  jackRank: 'J' | 'Q';
  allowCombosIn1v1: boolean;
  maxEightComboIn3Plus: number;
  turnTimeoutMs: number;
}

export const DEFAULT_RULES: RuleConfig = {
  firstAceNoEffect: false,
  jackRank: 'J',
  allowCombosIn1v1: true,
  maxEightComboIn3Plus: 5,
  turnTimeoutMs: 30000
};

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS: Rank[] = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export const cardPoints = (card: Card): number => {
  if (card.rank === 'J') return 2;
  if (card.rank === 'Q') return 3;
  if (card.rank === 'K') return 4;
  if (card.rank === 'A') return 11;
  return Number(card.rank);
};

export const isPenaltyCard = (card: Card): boolean => card.rank === '6' || card.rank === '7' || card.rank === 'A' || (card.rank === 'K' && card.suit === 'S');

export const isUniversal = (card: Card, rules: RuleConfig): boolean => {
  if (card.rank === '9' && card.suit === 'S') return true;
  return card.rank === rules.jackRank;
};

export const canBeatTop = (card: Card, top: Card, requestedSuit: Suit | null, rules: RuleConfig, nineFreePlay = false): boolean => {
  if (nineFreePlay) return true;
  if (isUniversal(card, rules)) return true;
  if (requestedSuit) {
    return card.suit === requestedSuit;
  }
  return card.suit === top.suit || card.rank === top.rank;
};

export interface ChatMessage {
  id: string;
  from: string;
  text: string;
  at: number;
}

export interface PublicPlayer {
  id: string;
  name: string;
  handCount: number;
  connected: boolean;
  score: number;
  isBot?: boolean;
}

export interface ClientState {
  roomCode: string;
  yourId: string;
  yourHand: Card[];
  players: PublicPlayer[];
  topCard: Card | null;
  deckSize: number;
  currentPlayerId: string | null;
  phase: TurnPhase;
  requestedSuit: Suit | null;
  pendingPenaltyDraw: number;
  pendingSkip: number;
  logs: string[];
  chat: ChatMessage[];
  roundNumber: number;
  gameOver: boolean;
  winnerId: string | null;
  turnEndsAt: number | null;
}
