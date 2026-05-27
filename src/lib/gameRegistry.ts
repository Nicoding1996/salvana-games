// ============================================
// Game Registry — Single source of truth for all games
// ============================================
// To add a new game to the lobby, just add an entry here.
// The lobby, home page, and settings all read from this registry.

export type GameCategory = 'bluffing' | 'strategy' | 'luck' | 'social' | 'teams' | 'free-for-all' | 'elimination' | 'deduction';
export type GameDifficulty = 'casual' | 'moderate' | 'strategic';

export interface GameDefinition {
  /** Unique game ID — matches server's currentGameId */
  id: string;
  /** Display name */
  name: string;
  /** Emoji icon */
  icon: string;
  /** Short tagline (shown on compact cards) */
  tagline: string;
  /** One-sentence hook — the "elevator pitch" that makes people go "ooh" */
  hook: string;
  /** How to play in ~2 sentences */
  howToPlay: string;
  /** Minimum players required */
  minPlayers: number;
  /** Maximum players allowed */
  maxPlayers: number;
  /** Estimated play duration */
  duration: string;
  /** Difficulty level */
  difficulty: GameDifficulty;
  /** Category tags */
  categories: GameCategory[];
  /** Whether this is a team-based game (affects lobby UI) */
  isTeamGame: boolean;
  /** CSS accent color variable name (used for card theming) */
  accentColor: string;
  /** Hex value of accent for inline styles where CSS vars aren't available */
  accentHex: string;
  /** Secondary color hex */
  secondaryHex: string;
  /** Badge text (e.g., "NEW", "POPULAR") — null for no badge */
  badge: string | null;
  /** Best experience player count (shown as recommendation) */
  bestWith: string;
  /** data-game attribute value for CSS theme override */
  dataGameAttr: string;
}

// ============================================
// THE REGISTRY — Add new games here
// ============================================

export const GAME_REGISTRY: GameDefinition[] = [
  {
    id: 'story-thief',
    name: "Whose Truth?",
    icon: '📜',
    tagline: 'Tell stories. Spot the liar.',
    hook: "One real story. Everyone claims it's theirs. Can you spot who's bluffing?",
    howToPlay: "Write something true about yourself. Each round, one story is read aloud and the whole team claims they wrote it. Ask questions out loud, then vote — guess right and your team scores.",
    minPlayers: 4,
    maxPlayers: 18,
    duration: '20–40 min',
    difficulty: 'casual',
    categories: ['bluffing', 'social', 'teams', 'deduction'],
    isTeamGame: true,
    accentColor: '--game-accent',
    accentHex: '#e8a849',
    secondaryHex: '#9b7bdf',
    badge: null,
    bestWith: '6–12 players',
    dataGameAttr: 'story-thief',
  },
  {
    id: 'liars-dice',
    name: "Liar's Dice",
    icon: '🎲',
    tagline: 'Shake, bid, bluff.',
    hook: "Shake your phone to roll. Bid on everyone's hidden dice — or call someone a liar.",
    howToPlay: "Everyone secretly rolls 5 dice. Take turns bidding on the total count of a face value across ALL players. Think someone's lying? Call LIAR! Wrong caller loses a heart. Last one standing wins.",
    minPlayers: 2,
    maxPlayers: 6,
    duration: '10–15 min',
    difficulty: 'casual',
    categories: ['bluffing', 'free-for-all', 'elimination'],
    isTeamGame: false,
    accentColor: '--game-accent',
    accentHex: '#e74c3c',
    secondaryHex: '#f39c12',
    badge: null,
    bestWith: '4–5 players',
    dataGameAttr: 'liars-dice',
  },
  {
    id: 'battleship',
    name: "Battleship",
    icon: '⚓',
    tagline: 'Hide ships. Fire shots.',
    hook: "Place your fleet. Fire at opponents. Lose ships, lose firepower. Last fleet afloat wins.",
    howToPlay: "Place 4 ships on a hidden grid. Take turns firing — in Salvo mode you get shots equal to your surviving ships. Sink everyone else's fleet to win. Supports 2–4 players.",
    minPlayers: 2,
    maxPlayers: 4,
    duration: '15–20 min',
    difficulty: 'moderate',
    categories: ['strategy', 'free-for-all', 'elimination'],
    isTeamGame: false,
    accentColor: '--game-accent',
    accentHex: '#00d4ff',
    secondaryHex: '#4a6fa5',
    badge: null,
    bestWith: '3–4 players',
    dataGameAttr: 'battleship',
  },
  {
    id: 'poker',
    name: "Poker",
    icon: '♠️',
    tagline: 'Bet, bluff, bust.',
    hook: "Texas Hold'em tournament. Blinds go up. Stacks go down. Last player with chips wins.",
    howToPlay: "Everyone starts with chips. Get dealt 2 cards, bet through 4 rounds as 5 community cards are revealed. Best hand wins the pot. Lose all your chips and you're out.",
    minPlayers: 2,
    maxPlayers: 8,
    duration: '20–40 min',
    difficulty: 'strategic',
    categories: ['bluffing', 'strategy', 'free-for-all', 'elimination'],
    isTeamGame: false,
    accentColor: '--game-accent',
    accentHex: '#2d8a4e',
    secondaryHex: '#d4af37',
    badge: null,
    bestWith: '4–6 players',
    dataGameAttr: 'poker',
  },
  {
    id: 'flip7',
    name: "Flip 7",
    icon: '🃏',
    tagline: 'Push your luck.',
    hook: "Draw cards for points — but draw a duplicate and you bust. Stop in time or lose it all.",
    howToPlay: "Each turn: flip a card or stay safe. Collect unique numbers (0–12) to score their sum. Draw a duplicate? Bust — score zero. Get 7 unique cards for a massive bonus. First to the target score wins.",
    minPlayers: 3,
    maxPlayers: 10,
    duration: '15–25 min',
    difficulty: 'casual',
    categories: ['luck', 'free-for-all', 'social'],
    isTeamGame: false,
    accentColor: '--game-accent',
    accentHex: '#a3e635',
    secondaryHex: '#f472b6',
    badge: 'NEW',
    bestWith: '4–7 players',
    dataGameAttr: 'flip-7',
  },
];

// ============================================
// Helper functions
// ============================================

/** Get a game definition by ID */
export function getGameById(id: string): GameDefinition | undefined {
  return GAME_REGISTRY.find(g => g.id === id);
}

/** Get the default game (first in registry) */
export function getDefaultGame(): GameDefinition {
  return GAME_REGISTRY[0];
}

/** Check if a game is team-based */
export function isTeamGame(gameId: string): boolean {
  return getGameById(gameId)?.isTeamGame ?? false;
}

/** Get category display info */
export const CATEGORY_INFO: Record<GameCategory, { label: string; emoji: string }> = {
  bluffing: { label: 'Bluffing', emoji: '🎭' },
  strategy: { label: 'Strategy', emoji: '🧠' },
  luck: { label: 'Luck', emoji: '🍀' },
  social: { label: 'Social', emoji: '💬' },
  teams: { label: 'Teams', emoji: '👥' },
  'free-for-all': { label: 'FFA', emoji: '⚔️' },
  elimination: { label: 'Elimination', emoji: '💀' },
  deduction: { label: 'Deduction', emoji: '🔍' },
};

/** Get difficulty display info */
export const DIFFICULTY_INFO: Record<GameDifficulty, { label: string; color: string }> = {
  casual: { label: 'Easy to learn', color: '#5ee89e' },
  moderate: { label: 'Some strategy', color: '#f0a050' },
  strategic: { label: 'Think ahead', color: '#e74c3c' },
};
