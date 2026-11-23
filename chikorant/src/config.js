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
  { from: 'Berry',  photo: 'p/06-crew/berry-and-maria-car.jpg',  audio: 'vm/berry.mp3',  line: 'First blood. Berry has something to say.' },
  { from: 'Tandon', photo: 'p/02-office-gcc/hpe-mirror-selfie.jpg', audio: 'vm/tandon.mp3', line: 'Partnerships, secured. Your accomplice checks in.' },
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

// ─────────────────────────────────────────────────────────────────────────────
//  MAPS, PHOTOS, SLIDESHOW
//
//  Photos: drop .jpg/.png files into  public/p/  and list them below.
//  A missing file never breaks anything: it shows a styled placeholder instead.
// ─────────────────────────────────────────────────────────────────────────────

// Zyoin logo (transparent PNG). Use ZYOIN_LOGO on light surfaces (navy text),
// ZYOIN_LOGO_LIGHT on dark surfaces (cream text). Missing file → text logo.
export const ZYOIN_LOGO = 'p/zyoin-logo.png';
export const ZYOIN_LOGO_LIGHT = 'p/zyoin-logo-light.png';

// Maps she can pick on the map-select screen. `id` must match a builder in src/maps/.
export const MAPS = [
  { id: 'zyoin', name: 'ZYOIN HQ', sub: 'The office. Pantry raids, summit season, beige walls she refused to be.', tag: 'OFFICE' },
  { id: 'garba', name: 'GARBA NIGHT', sub: 'Festival grounds. Lights, dandiya, dancing without knowing a single step.', tag: 'FESTIVAL' },
];

// Framed photos hung around each map (walls, notice boards, stage screens).
const P = (f) => `p/${f}.jpg`;
export const MAP_PHOTOS = {
  zyoin: [
    { src: P('01-early/conference-table-laugh'), caption: 'Day one. Already the loudest laugh' },
    { src: P('02-office-gcc/meeting-room-trio'), caption: 'Meeting room, main character' },
    { src: P('02-office-gcc/tech-summit-sculpture'), caption: 'Summit season' },
    { src: P('02-office-gcc/conference-lobby-talk'), caption: 'Closing sponsors in the lobby' },
    { src: P('02-office-gcc/office-selfie-green-jersey'), caption: 'Desk neighbours' },
    { src: P('01-early/office-formals-bench'), caption: 'Formals. Briefly.' },
    { src: P('02-office-gcc/lanyard-palm-selfie'), caption: 'Lanyards + palms' },
    { src: P('02-office-gcc/hpe-mirror-wide'), caption: 'Event-hotel mirror tradition' },
    { src: P('02-office-gcc/white-waistcoat-portrait'), caption: 'Partnerships lead energy' },
    { src: P('03-cat-rescue/kitchen-counter-1'), caption: 'The cat rescue (1/3)' },
    { src: P('03-cat-rescue/kitchen-counter-2'), caption: 'The cat rescue (2/3)' },
    { src: P('03-cat-rescue/kitchen-counter-wide'), caption: 'The cat rescue (3/3)' },
    { src: P('01-early/polaroids-two'), caption: 'Pinned to the board forever' },
  ],
  garba: [
    { src: P('04-garba/navratri-big-group'), caption: 'Navratri, the whole gang' },
    { src: P('04-garba/navratri-five'), caption: 'Dressed for the circle' },
    { src: P('04-garba/navratri-selfie-faces'), caption: 'Zero steps known. Full commitment' },
    { src: P('06-crew/leaf-wall-crowns-1'), caption: 'Crowned' },
    { src: P('06-crew/leaf-wall-crowns-2'), caption: 'Rock on' },
    { src: P('07-nights/booth-group-hug'), caption: 'The crew' },
    { src: P('07-nights/night-stairs-group'), caption: 'One more song' },
    { src: P('07-nights/bandana-bar-selfie'), caption: 'Bandana night' },
    { src: P('07-nights/beer-poster-booth'), caption: 'Booth regulars' },
    { src: P('05-tandon/photobooth-strip'), caption: 'Photobooth, 14.08' },
    { src: P('05-tandon/halloween-interview-flash'), caption: 'Live from Halloween' },
    { src: P('05-tandon/sofa-film-laugh'), caption: 'Sofa, film, bread' },
    { src: P('06-crew/berry-and-maria-car'), caption: 'Back seat besties' },
    { src: P('06-crew/bows-selfie'), caption: 'Bows on' },
    { src: P('05-tandon/saree-mirror'), caption: 'Saree mirror check' },
    { src: P('06-crew/car-selfie-3'), caption: 'Peace from the back seat' },
  ],
};

// Post-game film (after the final round, before the GG screen). Story order.
// Each slide: { src, title, caption } or { video, title, caption }.
// `music`: optional mp3 you add yourself; without it an original piano score is generated.
export const SLIDESHOW = {
  music: 'music/ending.mp3',
  slides: [
    { src: P('01-early/charminar-night-with-friend'), title: 'Before all this', caption: 'A girl, a city at night, and no idea what was coming.' },
    { src: P('01-early/conference-table-laugh'), title: 'Zyoin, day one', caption: 'Too loud for our beige little office. We were told she was "too much".' },
    { src: P('02-office-gcc/meeting-room-trio'), title: 'Turns out', caption: 'she was exactly what the place was missing.' },
    { src: P('02-office-gcc/tech-summit-sculpture'), title: 'Summit season', caption: 'Most sponsors on record. Biggest GCC events in the country. Casually.' },
    { src: P('02-office-gcc/hpe-mirror-tongues'), title: 'Every event hotel', caption: 'got the same mirror selfie. Tradition is tradition.' },
    { src: P('03-cat-rescue/kitchen-counter-2'), title: 'Barefoot on the counter', caption: 'because a cat was scared. Of course she climbed.' },
    { src: P('04-garba/navratri-big-group'), title: 'Garba night', caption: "Didn't know a single step. Danced till they turned the lights off." },
    { src: P('06-crew/berry-and-maria-car'), title: 'Berry', caption: 'Back seats, loud songs, louder opinions.' },
    { src: P('05-tandon/photobooth-strip'), title: 'Tandon', caption: 'Four frames, one friendship, zero serious faces.' },
    { src: P('05-tandon/halloween-interview-film'), title: 'Breaking news', caption: 'Local legend interviewed. Refuses to be normal.' },
    { src: P('06-crew/leaf-wall-crowns-1'), title: 'The crew', caption: 'Leaf crowns were never optional.' },
    { video: 'v/clip-1.mp4', title: 'Nights like these', caption: '' },
    { src: P('07-nights/booth-group-hug'), title: '', caption: 'The booth, the hug, the noise.' },
    { video: 'v/clip-2.mp4', title: '', caption: 'We were there for all of it.' },
    { src: P('05-tandon/sofa-film-laugh'), title: 'The quiet ones too', caption: 'Sofa, film camera, bread. Perfect days.' },
    { src: P('08-maria-solo/park'), title: 'Abu Dhabi', caption: 'gets its girl back.' },
    { src: P('08-maria-solo/leaf-crown-laugh'), title: 'Bangalore', caption: 'keeps the light on for you.' },
    { src: P('08-maria-solo/leaf-crown-portrait'), title: 'Happy birthday, Chikero', caption: "Not goodbye. Just see you later. You know you'll miss us." },
  ],
};
