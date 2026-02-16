import React from 'react';
import ReactDOM from 'react-dom/client';
import { io, Socket } from 'socket.io-client';
import { Card, ClientState, Suit, TurnPhase, canBeatTop, DEFAULT_RULES } from '@game101/shared';
import './styles.css';

const socket: Socket = io('http://localhost:3001');

const suitIcon = (s: Suit) => ({ S: '♠', H: '♥', D: '♦', C: '♣' }[s]);

const App = () => {
  const [name, setName] = React.useState('Player');
  const [roomCodeInput, setRoomCodeInput] = React.useState('');
  const [state, setState] = React.useState<ClientState | null>(null);
  const [playerId, setPlayerId] = React.useState('');
  const [token, setToken] = React.useState('');
  const [chatText, setChatText] = React.useState('');
  const [error, setError] = React.useState('');
  const [aiDifficulty, setAiDifficulty] = React.useState<'easy'|'normal'|'hard'>('normal');

  React.useEffect(() => {
    const saved = localStorage.getItem('g101-reconnect');
    if (saved) {
      const parsed = JSON.parse(saved) as { roomCode: string; token: string };
      socket.emit('reconnect_room', parsed);
    }

    socket.on('joined', ({ roomCode, playerToken, playerId: pid }) => {
      setPlayerId(pid);
      setToken(playerToken);
      localStorage.setItem('g101-reconnect', JSON.stringify({ roomCode, token: playerToken }));
    });
    socket.on('state', (s: ClientState) => setState(s));
    socket.on('error_message', (msg: string) => setError(msg));
    return () => {
      socket.off('joined');
      socket.off('state');
      socket.off('error_message');
    };
  }, []);

  const play = (card: Card) => {
    if (!state) return;
    socket.emit('play_card', { roomCode: state.roomCode, playerId, cardId: card.id });
  };

  const chooseSuit = (suit: Suit) => {
    if (!state) return;
    socket.emit('choose_suit', { roomCode: state.roomCode, playerId, suit });
  };

  const timeLeft = state?.turnEndsAt ? Math.max(0, Math.floor((state.turnEndsAt - Date.now()) / 1000)) : 0;
  const myTurn = state?.currentPlayerId === playerId;

  return <div className="min-h-screen text-slate-100 p-4">
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="bg-slate-900 rounded p-3 flex flex-wrap gap-2 items-center">
        <input className="px-2 py-1 rounded bg-slate-800" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn" onClick={() => socket.emit('create_room', { name })}>Create room</button>
        <input className="px-2 py-1 rounded bg-slate-800 uppercase" value={roomCodeInput} onChange={(e) => setRoomCodeInput(e.target.value)} placeholder="ROOM" />
        <button className="btn" onClick={() => socket.emit('join_room', { roomCode: roomCodeInput.toUpperCase(), name })}>Join room</button>
        <select className="px-2 py-1 rounded bg-slate-800" value={aiDifficulty} onChange={(e) => setAiDifficulty(e.target.value as any)}>
          <option value="easy">AI easy</option><option value="normal">AI normal</option><option value="hard">AI hard</option>
        </select>
        <button className="btn" onClick={() => socket.emit('start_ai', { name, difficulty: aiDifficulty })}>Play vs AI</button>
        {state && <button className="btn" onClick={() => socket.emit('leave_room', { roomCode: state.roomCode, playerId })}>Leave</button>}
        <span className="text-xs opacity-70">Room: {state?.roomCode ?? '-'}</span>
        <span className="text-xs opacity-70">Timer: {timeLeft}s</span>
      </div>
      {error && <div className="bg-red-900/50 p-2 rounded">{error}</div>}

      {state && <>
      <div className="grid md:grid-cols-3 gap-3">
        <div className="bg-slate-900 p-3 rounded space-y-2">
          <h3 className="font-semibold">Scoreboard</h3>
          {state.players.map(p => <div key={p.id} className={`text-sm ${state.currentPlayerId===p.id?'text-emerald-400':''}`}>{p.name} ({p.handCount}) — {p.score} {p.connected?'':'(offline)'}</div>)}
          <div className="text-xs opacity-70">Round #{state.roundNumber} | Phase: {state.phase}</div>
          {state.requestedSuit && <div>Requested suit: {suitIcon(state.requestedSuit)}</div>}
          {(state.pendingPenaltyDraw > 0 || state.pendingSkip > 0) && <div>Penalty: +{state.pendingPenaltyDraw}, skip {state.pendingSkip}</div>}
        </div>
        <div className="bg-slate-900 p-3 rounded text-center">
          <h3 className="font-semibold mb-2">Table</h3>
          <div className="flex justify-center items-center gap-6">
            <div><div className="opacity-60">Deck</div><div className="card back">{state.deckSize}</div></div>
            <div><div className="opacity-60">Top</div>{state.topCard ? <div className="card">{state.topCard.rank}{suitIcon(state.topCard.suit)}</div> : '-'}</div>
          </div>
          <button className="btn mt-3" disabled={!myTurn} onClick={() => socket.emit('draw_pass', { roomCode: state.roomCode, playerId })}>Draw / Pass</button>
          {myTurn && <div className="text-xs mt-2">Your turn</div>}
        </div>
        <div className="bg-slate-900 p-3 rounded">
          <h3 className="font-semibold">Events</h3>
          <div className="h-40 overflow-auto text-xs space-y-1">{state.logs.map((l, i) => <div key={i}>{l}</div>)}</div>
        </div>
      </div>

      <div className="bg-slate-900 p-3 rounded">
        <h3 className="font-semibold mb-2">Your hand</h3>
        <div className="flex flex-wrap gap-2">
          {state.yourHand.map((c) => {
            const valid = state.topCard ? canBeatTop(c, state.topCard, state.requestedSuit, DEFAULT_RULES, state.phase === TurnPhase.ResolvingNineExtra) : false;
            return <button key={c.id} disabled={!myTurn} onClick={() => play(c)} className={`card ${valid ? 'border-emerald-400' : 'border-slate-700'}`}>{c.rank}{suitIcon(c.suit)}</button>;
          })}
        </div>
      </div>

      <div className="bg-slate-900 p-3 rounded">
        <h3 className="font-semibold mb-2">Chat</h3>
        <div className="h-24 overflow-auto text-xs">{state.chat.map(m => <div key={m.id}><b>{m.from}:</b> {m.text}</div>)}</div>
        <div className="flex gap-2 mt-2"><input value={chatText} onChange={e => setChatText(e.target.value)} className="flex-1 px-2 py-1 rounded bg-slate-800" />
          <button className="btn" onClick={() => { socket.emit('chat_send', { roomCode: state.roomCode, playerId, text: chatText }); setChatText(''); }}>Send</button>
        </div>
      </div>

      {state.phase === TurnPhase.ChoosingSuit && myTurn && <div className="fixed inset-0 bg-black/50 grid place-items-center"><div className="bg-slate-900 p-4 rounded"><div className="mb-2">Choose suit</div><div className="flex gap-2">{(['S','H','D','C'] as Suit[]).map(s => <button key={s} className="btn" onClick={() => chooseSuit(s)}>{suitIcon(s)}</button>)}</div></div></div>}
      </>}
    </div>
  </div>;
};

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
