// ─────────────────────────────────────────────────────────────────────────────
//  CHIKORANT · content config
//
//  ADDING A VOICE NOTE (the only thing you should ever need to touch):
//    1. Drop the files in   public/vm/<name>.mp3   and   public/m/<name>.jpg
//    2. Add ONE line to VOICE_NOTES below.
//
//  Round N (1, 2, 3...) unlocks VOICE_NOTES[N-1]. If there are more notes than
//  combat rounds, bonus rounds are generated automatically before the final
//  "Plant the Cake" round. If a round has no note yet, its `pending` text shows.
// ─────────────────────────────────────────────────────────────────────────────

export const VOICE_NOTES = [
  { from: 'Berry',  photo: 'm/berry.jpg',  audio: 'vm/berry.mp3',  line: 'First blood. Berry has something to say.' },
  { from: 'Tandon', photo: 'm/tandon.jpg', audio: 'vm/tandon.mp3', line: 'Partnerships, secured. Your accomplice checks in.' },
  // { from: 'Name', photo: 'm/name.jpg', audio: 'vm/name.mp3', line: 'Danced like nobody was watching. Name checks in.' },
];

// Combat rounds, in order. `bots` are the Deadline Bots' name tags.
export const ROUNDS = [
  {
    title: 'The Beige Office',
    bots: ['DEADLINE', 'PER MY LAST EMAIL', 'BEIGE WALL', 'MONDAY'],
  },
  {
    title: 'Summit Season',
    bots: ['NO SPONSOR', 'CALENDAR CLASH', 'LANYARD TANGLE', 'REPLY ALL', 'SCOPE CREEP'],
  },
  {
    title: 'Garba Night',
    bots: ['WRONG STEP', "WHO'S WATCHING", 'STAGE FRIGHT', 'OVERTHINKING', 'BAD ANGLE', 'SELF DOUBT'],
    pending: 'Danced like nobody was watching. Another voice note is on its way.',
  },
];

// Used to name bots in auto-generated bonus rounds (when VOICE_NOTES outgrows ROUNDS).
export const BONUS_BOT_NAMES = [
  'CIRCLE BACK', 'QUICK SYNC', 'OUT OF OFFICE', 'LOW BATTERY', 'TRAFFIC ON ORR',
  'VISA QUEUE', 'LAST MINUTE', 'UNREAD 99+', 'BAD WIFI', 'AUTO-REPLY',
];

export const FINAL_ROUND = {
  title: 'Plant the Cake',
  defenders: ['FAREWELL SPEECH', 'PACKING LIST'],
  rushers: ['CHECK-IN COUNTER', 'EXCESS BAGGAGE', 'BOARDING CALL', 'GOODBYE', 'JET LAG', 'SEPARATION ANXIETY'],
  plantSeconds: 4,
  defendSeconds: 25,
};

export const PLAYER_NAME = 'CHIKERO';
export const PORTRAIT = 'm/chikero.jpg';

export const ENDING = {
  title: 'GG · WP',
  lines: [
    'Happy birthday, Chikero.',
    'Abu Dhabi gets its girl back.',
    'Bangalore keeps the light on.',
    "You know you'll miss us.",
  ],
  signoff: 'XOXO',
};

// Build the full round list (combat rounds + any bonus rounds + final).
export function buildRoundList() {
  const list = ROUNDS.map((r, i) => ({ ...r, index: i, note: VOICE_NOTES[i] || null }));
  let b = 0;
  for (let i = ROUNDS.length; i < VOICE_NOTES.length; i++) {
    const n = 4 + (i % 3);
    const bots = [];
    for (let k = 0; k < n; k++) bots.push(BONUS_BOT_NAMES[(b++) % BONUS_BOT_NAMES.length]);
    list.push({ title: `Bonus Round · ${VOICE_NOTES[i].from}`, bots, index: i, note: VOICE_NOTES[i] });
  }
  list.push({ ...FINAL_ROUND, final: true, index: list.length, note: null });
  return list;
}
