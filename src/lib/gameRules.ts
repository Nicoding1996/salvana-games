// ============================================
// Game Rules — Structured content for the RulesSheet
// ============================================
// Each game defines: summary, sections with bullet points, optional examples, and tips.
// Keep it concise — this is a party game, not a textbook.

export interface RuleSection {
  title: string;
  items: { bullet: string; text: string }[];
  example?: string;
}

export interface GameRulesData {
  icon: string;
  name: string;
  summary: string;
  sections: RuleSection[];
  tips?: string[];
}

export const GAME_RULES: Record<string, GameRulesData> = {

  'story-thief': {
    icon: '📜',
    name: "Whose Truth?",
    summary: "A team bluffing game. Everyone writes a true story about themselves. Each round, one story is read — the whole team claims it's theirs. The other teams ask questions and vote on who really wrote it.",
    sections: [
      {
        title: 'Setup',
        items: [
          { bullet: '1.', text: 'Everyone writes something true about themselves (a memory, a fact, an experience).' },
          { bullet: '2.', text: 'Stories go into your team\'s pile. Nobody sees what others wrote.' },
        ],
      },
      {
        title: 'Each Round',
        items: [
          { bullet: '📜', text: 'A story is pulled from one team\'s pile and read aloud.' },
          { bullet: '🎭', text: 'Everyone on that team claims "that\'s my story!" — but only one is telling the truth.' },
          { bullet: '❓', text: 'Other teams ask questions out loud (on your phones you just see the story and a timer).' },
          { bullet: '🗳️', text: 'Everyone votes on who they think the real author is.' },
        ],
        example: 'Story: "I once got stuck in a elevator for 3 hours." Team Red all claim it\'s theirs. You ask questions like "What floor were you on?" and watch who hesitates.',
      },
      {
        title: 'Scoring',
        items: [
          { bullet: '✓', text: 'Majority guesses correctly → guessing teams get 5 points.' },
          { bullet: '✗', text: 'Majority guesses wrong → bluffing team gets 5 points.' },
        ],
      },
    ],
    tips: [
      'Write stories that are true but surprising — they\'re harder to guess.',
      'When bluffing, commit fully. Add details when asked questions.',
      'The game is played out loud — your phone just keeps score and shows the story.',
    ],
  },

  'liars-dice': {
    icon: '🎲',
    name: "Liar's Dice",
    summary: "A bluffing game with hidden dice. Everyone secretly rolls 5 dice, then takes turns bidding on how many of a certain number exist across ALL players' dice combined. Call someone a liar — if you're right, they lose a life. If you're wrong, you do.",
    sections: [
      {
        title: 'How It Works',
        items: [
          { bullet: '🎲', text: 'Shake your phone (or tap) to roll 5 dice. Only you can see yours.' },
          { bullet: '📢', text: 'Take turns making bids: "I think there are at least X dice showing Y across everyone."' },
          { bullet: '⬆️', text: 'Each bid must be higher than the last (raise the quantity or the face value).' },
          { bullet: '🚨', text: 'If you think someone is lying, call "LIAR!" All dice are revealed.' },
        ],
        example: 'There are 3 players with 5 dice each (15 total). You bid "four 3s" meaning you think there are at least four dice showing 3 across all 15 dice. Next player must bid higher — like "five 3s" or "four 5s."',
      },
      {
        title: 'When Someone Calls LIAR',
        items: [
          { bullet: '✓', text: 'Bid was wrong (fewer dice than claimed) → bidder loses a ❤️' },
          { bullet: '✗', text: 'Bid was actually correct → caller loses a ❤️' },
          { bullet: '💀', text: 'Lose all your hearts → you\'re eliminated. Last one standing wins.' },
        ],
      },
      {
        title: 'Optional Rules',
        items: [
          { bullet: '⚀', text: 'Wild 1s: Dice showing 1 count as ANY number (makes bids more likely to be true).' },
          { bullet: '🎯', text: 'Spot On: Call "exact" if you think the bid is exactly right. Correct = everyone else loses a ❤️. Wrong = you lose one.' },
        ],
      },
    ],
    tips: [
      'Start with what you can see. If you have two 4s, bidding "three 4s" is pretty safe.',
      'Watch how confident people are — hesitation often means a bluff.',
      'Higher numbers are statistically less common. A bid of "six 6s" is risky.',
    ],
  },

  'battleship': {
    icon: '⚓',
    name: "Battleship",
    summary: "Multiplayer naval combat. Place your ships on a hidden grid, then take turns firing at opponents. Sink all of someone's ships to eliminate them. Last fleet standing wins.",
    sections: [
      {
        title: 'Setup',
        items: [
          { bullet: '🚢', text: 'Place 4 ships on your grid: Battleship (4), Cruiser (3), Submarine (3), Destroyer (2).' },
          { bullet: '📐', text: 'Tap a cell to place, toggle horizontal/vertical. Or tap "Auto" for random placement.' },
          { bullet: '👀', text: 'Everyone places at the same time. Nobody can see your grid.' },
        ],
      },
      {
        title: 'Battle',
        items: [
          { bullet: '🎯', text: 'On your turn, tap cells on an opponent\'s grid to fire shots.' },
          { bullet: '💥', text: 'Hit = orange fire. Miss = gray dot. Sink all cells of a ship = it\'s destroyed.' },
          { bullet: '⚓', text: 'Sink all 4 of someone\'s ships → they\'re eliminated.' },
        ],
      },
      {
        title: 'Shot Modes',
        items: [
          { bullet: '💣', text: 'Salvo: You get shots equal to your surviving ships (start with 4, lose ships = fewer shots).' },
          { bullet: '🎯', text: 'Classic: 1 shot per turn regardless.' },
        ],
        example: 'In Salvo mode with 3 ships left, you get 3 shots. You can split them across different opponents or focus-fire one player.',
      },
    ],
    tips: [
      'Don\'t cluster your ships together — one lucky hit reveals the area.',
      'In 3-4 player games, spreading shots keeps everyone guessing who you\'re targeting.',
      'If Sonar is on, save it for when you\'ve narrowed down a ship\'s location.',
    ],
  },

  'poker': {
    icon: '♠️',
    name: "Poker",
    summary: "Texas Hold'em tournament. Everyone starts with chips. Get dealt 2 cards, bet through rounds as 5 shared cards are revealed. Best 5-card hand wins the pot. Lose all chips = eliminated. Last player standing wins.",
    sections: [
      {
        title: 'Each Hand',
        items: [
          { bullet: '1.', text: 'You get 2 private cards (only you see them).' },
          { bullet: '2.', text: 'Bet, then 3 shared cards are revealed (the Flop).' },
          { bullet: '3.', text: 'Bet again, then a 4th card (the Turn).' },
          { bullet: '4.', text: 'Bet again, then a 5th card (the River).' },
          { bullet: '5.', text: 'Final bet, then reveal hands. Best 5-card combo wins the pot.' },
        ],
      },
      {
        title: 'Your Options',
        items: [
          { bullet: '🃏', text: 'Fold — give up this hand (lose what you\'ve bet).' },
          { bullet: '✓', text: 'Check — pass (only if no one has bet yet).' },
          { bullet: '📞', text: 'Call — match the current bet.' },
          { bullet: '⬆️', text: 'Raise — increase the bet (everyone must match or fold).' },
          { bullet: '💰', text: 'All-In — bet everything you have.' },
        ],
      },
      {
        title: 'Hand Rankings (best to worst)',
        items: [
          { bullet: '👑', text: 'Royal Flush → Straight Flush → Four of a Kind → Full House → Flush' },
          { bullet: '📊', text: 'Straight → Three of a Kind → Two Pair → One Pair → High Card' },
        ],
        example: 'Your cards: K♥ Q♥. Shared cards: 10♥ J♥ A♥ 3♠ 7♦. You have a Royal Flush (A-K-Q-J-10 all hearts)!',
      },
      {
        title: 'Blinds',
        items: [
          { bullet: '💰', text: 'Two players post forced bets (blinds) each hand to keep the action going.' },
          { bullet: '📈', text: 'Blinds increase over time — forces players to play, not just wait.' },
        ],
      },
    ],
    tips: [
      'Your phone shows your current best hand — use it if you\'re unsure about rankings.',
      'Position matters: acting last lets you see what others do first.',
      'Don\'t be afraid to fold bad hands early — patience wins tournaments.',
    ],
  },

  'flip7': {
    icon: '🃏',
    name: "Flip 7",
    summary: "A push-your-luck card game. Each turn, choose to flip a card or stay safe. Collect unique numbers to score points — but flip a duplicate and you bust (score zero). Get 7 unique cards for a huge bonus!",
    sections: [
      {
        title: 'Your Turn',
        items: [
          { bullet: '🃏', text: 'HIT — flip a card from the deck.' },
          { bullet: '🛑', text: 'STAY — stop and bank your points for this round.' },
        ],
      },
      {
        title: 'What Happens When You Flip',
        items: [
          { bullet: '✓', text: 'New unique number (0–12) → added to your collection. Keep going or stay.' },
          { bullet: '💀', text: 'Duplicate number → BUST! You score zero for this round.' },
          { bullet: '⭐', text: '7 unique numbers → FLIP 7! Massive +15 bonus and the round ends.' },
        ],
        example: 'You have cards: 3, 5, 8, 11. You flip a 5 — that\'s a duplicate! Bust. You score 0 this round. If you had stayed, you\'d have scored 3+5+8+11 = 27 points.',
      },
      {
        title: 'Special Cards',
        items: [
          { bullet: '❄️', text: 'Freeze — force another player to stop (they bank their current points).' },
          { bullet: '⚡', text: 'Flip Three — force another player to draw 3 cards (risky for them!).' },
          { bullet: '💚', text: 'Second Chance — saves you from one bust (the duplicate is discarded).' },
          { bullet: '+2/+4', text: 'Modifiers — add bonus points to your score.' },
          { bullet: '×2', text: 'Multiplier — doubles your total score for the round.' },
        ],
      },
      {
        title: 'Scoring',
        items: [
          { bullet: '📊', text: 'Round score = sum of your card values + modifiers (+2, +4) + Flip 7 bonus (+15).' },
          { bullet: '✖️', text: 'Each ×2 modifier doubles your total.' },
          { bullet: '🏆', text: 'Scores add up across rounds. First to the target (100/200/300) wins!' },
        ],
        example: 'Cards: 2, 6, 9 = 17. Plus a +4 modifier = 21. Plus a ×2 = 42 points this round!',
      },
    ],
    tips: [
      'High numbers (10, 11, 12) have more copies in the deck — they\'re more likely to bust you.',
      'Low numbers (0, 1, 2) are rare — if you have them, you\'re safer to keep flipping.',
      'Freeze is great against someone on a hot streak with 5-6 cards.',
      'In Chaos mode, everyone chooses simultaneously — no waiting for turns.',
    ],
  },

};
