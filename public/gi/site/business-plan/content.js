// All Business Plan page copy lives here. The page renders from this array --
// adding or editing content should only ever mean editing this file.
//
// Each entry is a tile in the grid. An entry with `id` also gets a full
// in-page section further down the page (anchored at #id) and a slot in the
// sticky section bar. An entry with `href` instead of `id` is a tile that
// opens its own page -- it still gets a slot in the section bar, but no
// in-page section is rendered for it.
//
// Block shapes:
//   { type:'bullets', title?, items:[string, ...] }   -- '**lead-in:**' in an item renders bold
//   { type:'steps',   title?, items:[string, ...] }   -- rendered as an ordered list
//   { type:'table',   title?, headers:[string,...], rows:[[string,...],...] }
//   { type:'stat-row', items:[{value,label}, ...] }
//   { type:'note',    text }
//   { type:'button',  text, href, external? }

export const SECTIONS = [
  {
    num: 1,
    id: 'plan',
    title: 'The Business Plan',
    blurb: 'The whole thing on one screen.',
    lead: 'Four generations at one table, and a community that votes on what they argue about.',
    blocks: [
      {
        type: 'steps',
        title: 'How it works',
        items: [
          'We ask a question. On YouTube as a poll, or on the street with a microphone.',
          'People answer. It takes ten seconds.',
          'They come back to see how everyone else answered.',
          'The show argues that same question, four generations at one table.',
          'Voters become subscribers, members and guests.',
          'A sponsor puts their name, and their customers, in the middle of it.',
        ],
      },
      {
        type: 'stat-row',
        items: [
          { value: '4', label: 'generations at the table' },
          { value: '10', label: 'polls in 10 weeks' },
          { value: '1,000', label: 'subscriber goal' },
          { value: '2', label: 'episodes a month' },
        ],
      },
    ],
  },
  {
    num: 2,
    id: 'community',
    title: 'Building an Online Community',
    blurb: 'One poll a week turns viewers into members.',
    lead: 'One poll a week. Vote Monday, see the result Wednesday, watch the argument Friday.',
    blocks: [
      {
        type: 'bullets',
        title: 'The weekly rhythm',
        items: [
          '**Monday:** one poll. Two answers only. Never "it depends."',
          '**Wednesday:** a short video with the result.',
          '**Every second Friday:** a 10 to 15 minute show arguing that cycle’s two polls.',
        ],
      },
      {
        type: 'bullets',
        title: 'What members get',
        items: [
          'Each poll 24 hours early.',
          'The pick of the next question.',
          'A members-only "my real answer" from the panel.',
        ],
      },
      {
        type: 'table',
        title: 'The goal',
        headers: ['Measure', 'Target'],
        rows: [
          ['Subscribers', '1,000 by March 12, 2027'],
          ['Poll votes', '3% of subscribers per poll'],
          ['Comments', 'At least 15% of voters also comment'],
          ['First members', '10'],
        ],
      },
      {
        type: 'note',
        text: 'First series: "Where do you draw the line with AI?" Ten questions, January 4 to March 14, 2027.',
      },
      {
        type: 'button',
        text: 'See the full YouTube strategy',
        href: '/gi/site/business-plan/youtube-strategy/',
      },
    ],
  },
  {
    num: 3,
    id: 'model',
    title: 'Business Model',
    blurb: 'Where the money comes from.',
    lead: 'Sponsored segments come first. Membership, YouTube and merch follow.',
    blocks: [
      {
        type: 'table',
        title: 'Where the money comes from',
        headers: ['Stream', 'What it is'],
        rows: [
          ['Sponsored segments', 'A sponsor’s name on a segment, in the studio or on the street at their location.'],
          ['Membership', 'Fans who pay a few dollars a month for early polls and a say in the questions.'],
          ['YouTube', 'Ad revenue once the channel qualifies.'],
          ['Merch', 'A small line. Shirts and the mic-flag look.'],
        ],
      },
      {
        type: 'steps',
        title: 'The sponsor ladder',
        items: [
          'Product in the studio',
          'Sponsored question',
          'A seat in the chair',
          'Remote appearance',
          'Man on the Street at your location',
        ],
      },
      {
        type: 'note',
        text: 'Every sponsor gets finished content they can use, a generation of their choice, and their own tracked link.',
      },
      // PARTNERS ONLY -- the monthly revenue-split table (Erik 40% / Tim 30% /
      // Gabe 30%) is deliberately left out of this file per the brief: add it
      // back only if Tim says to include it.
    ],
  },
  {
    num: 4,
    id: 'street',
    title: 'Man on the Street',
    blurb: 'We take the show to where people already are.',
    lead: 'We go where people already are, ask one quick question, and let them be the stars.',
    blocks: [
      {
        type: 'bullets',
        title: 'What it does',
        items: [
          '**Viewers:** people stop and ask "what is this?"',
          '**Subscribers and members:** everyone gets a QR code to subscribe and vote.',
          '**Guests:** the best talkers get invited to the table.',
          '**Content:** a montage that opens an episode, plus clips for Shorts, Reels and TikTok.',
          '**Sponsors:** filmed at your location, with your customers.',
        ],
      },
      {
        type: 'bullets',
        title: 'How it runs',
        items: [
          'Two questions. One from an upcoming episode, one wide open.',
          'A real microphone, a real camera, and the same host as the show.',
          'Restaurants with a wait, shops, markets and festivals.',
          'About three hours on location.',
        ],
      },
      {
        type: 'note',
        text: 'The street question matches that week’s poll, so the street and the online vote tell one story.',
      },
    ],
  },
  {
    num: 5,
    id: 'voting',
    title: 'The Voting System',
    blurb: 'Built for a phone. One tap, one answer.',
    lead: 'Everything is a vote, and every vote fits on a phone.',
    blocks: [
      {
        type: 'bullets',
        title: 'For fans',
        items: [
          '**YouTube polls:** two answers, one tap.',
          '**Rate the Topics:** pick your generation, then rate topics from Snooze to Off the chart.',
          '**Topic Heat Check:** six topics in about 30 seconds.',
          '**On the Dial:** flip through topics on a retro TV and pick a side.',
        ],
      },
      {
        type: 'bullets',
        title: 'For the producers',
        items: [
          'Three owners, three votes.',
          'Boards for topics, guests and everything else.',
          'Each producer sees their own deadlines and pending votes, on their phone.',
        ],
      },
      {
        type: 'bullets',
        title: 'The rules we build by',
        items: [
          'One question per screen.',
          'Generation first, then the question.',
          'Big buttons. No typing unless it’s needed.',
          'Show the result right away.',
          'End with one next step.',
        ],
      },
      {
        // /gi/site/rate-the-topics/ exists on main, so this button is included per the brief.
        type: 'button',
        text: 'Rate the Topics',
        href: '/gi/site/rate-the-topics/',
      },
    ],
  },
  {
    num: 6,
    title: 'YouTube Strategy',
    blurb: 'The 10-week polling campaign, week by week.',
    href: '/gi/site/business-plan/youtube-strategy/',
  },
];
