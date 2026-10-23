// Art direction for every generated illustration.
// One shared style keeps the pop-up book coherent; each entry only describes its subject.

export const STYLE = `Children's picture-book illustration in warm gouache and coloured pencil,
visible paper grain and soft dry-brush texture, confident hand-inked warm dark-brown outlines,
gentle shading, cosy Mediterranean afternoon light. Palette: sunflower yellow, cobalt blue,
terracotta red, olive green, warm cream, a touch of sea teal. Charming, friendly, slightly
whimsical proportions, modern European picture-book quality. Original characters only.`;

export const STICKER = (key) => `Render the subject as ONE die-cut paper cut-out: the whole subject is
surrounded by an even, thick cream-white paper border that follows its silhouette (border width
about 2% of the image width). Centre it with generous empty margin on all sides. The background
must be a perfectly flat, solid, pure ${key === 'green' ? 'chroma green (#00FF00)' : 'magenta (#FF00FF)'}
colour edge to edge: no shadow, no gradient, no texture, no floor, no frame.
Absolutely no text, letters, numbers or watermark anywhere.`;

/**
 * kind: 'cut'   → sticker on chroma background, keyed to transparent WebP
 *       'plain' → full-bleed image (textures), just resized to WebP
 */
export const ASSETS = [
  // ── Chapter 1: the yellow house ─────────────────────────────
  { id: 'house', kind: 'cut', aspect: '3:4', size: '2K', ref: 'building.jpg',
    subject: `The exact building from the reference photo, redrawn as a storybook illustration seen
    from the front-left corner: a four-storey house with sunny yellow walls and a light grey roof edge,
    tall cobalt-blue window frames, the column of three round yellow balconies with railings and
    little air-conditioners, the wide dark entrance glowing with warm lamplight, terracotta flower pots
    and a small bush by the door. Keep its real proportions and character. No people, no ground, no sky.` },
  { id: 'mountains', kind: 'cut', aspect: '16:9',
    subject: `A wide panorama of soft rounded Mediterranean mountains (like Rumija above Bar, Montenegro):
    layered blue-green and lilac ridges, a few dark cypress trees and olive groves on the slopes,
    one tiny white stone chapel. Only the mountains, no sky behind them.` },
  { id: 'olive', kind: 'cut', aspect: '3:4',
    subject: `A gnarled old olive tree with a twisted silver-brown trunk and a full rounded crown of
    silvery olive-green leaves with a few dark olives.` },
  { id: 'cypress', kind: 'cut', aspect: '9:16',
    subject: `Two tall slender dark-green cypress trees standing side by side, one taller than the other.` },
  { id: 'kids-grass', kind: 'cut', aspect: '4:3',
    subject: `Two children (a boy in a cap and a girl with a ponytail) sitting on a patch of grass
    with daisies, both deeply absorbed in reading picture books, a small backpack next to them.` },
  { id: 'cloud', kind: 'cut', aspect: '16:9',
    subject: `One soft fluffy cumulus cloud, cream-white with lilac-blue shading.` },
  { id: 'sun', kind: 'cut', aspect: '1:1',
    subject: `A stylised hand-painted sun: a warm golden-yellow disc with wavy terracotta and yellow rays.
    No face.` },

  // ── Chapter 2: the room ─────────────────────────────────────
  { id: 'window', kind: 'cut', aspect: '3:4',
    subject: `A tall arched window with a cobalt-blue wooden frame, open shutters and a terracotta pot of
    geraniums on the sill; through the glass you see the turquoise Adriatic sea, a sailboat and a
    distant mountain under a bright sky.` },
  { id: 'bookshelf', kind: 'cut', aspect: '3:4',
    subject: `A tall warm-wood bookshelf packed with colourful books of every size (some leaning, some in
    stacks), a trailing pothos plant and a small globe on top, a toy rocket and a jar of pencils on the
    shelves.` },
  { id: 'lamp', kind: 'cut', aspect: '9:16',
    subject: `A vintage brass floor lamp with a big pleated mustard-yellow fabric shade with a little
    fringe, switched on and glowing warmly. Only the lamp.` },
  { id: 'armchair', kind: 'cut', aspect: '1:1',
    subject: `A deep, squashy patterned armchair in terracotta and cream with a knitted blue blanket over
    one arm, a striped cushion, and a wobbly stack of books on the floor next to it.` },
  { id: 'kids-cushions', kind: 'cut', aspect: '4:3',
    subject: `Three children of different ages reading on big floor cushions: a little one lying on the
    tummy with feet in the air, a girl in glasses cross-legged, a teenage boy with headphones round his
    neck leaning back with a thick novel. A teapot and a plate of cookies between them.` },

  // ── Chapter 4: the treasure chest ───────────────────────────
  { id: 'ginger-chest', kind: 'cut', aspect: '3:4',
    subject: `A cheerful, freckled, very strong girl of about nine with bright carrot-red hair in two stiff
    braids sticking straight out sideways, a patched blue-and-yellow dress, one long stocking striped and
    one plain, huge black shoes. She sits on the lid of an open wooden pirate treasure chest overflowing
    with books and gold coins, proudly holding up an open book above her head with one hand.` },
  { id: 'horse', kind: 'cut', aspect: '4:3',
    subject: `A friendly white horse with big black polka dots, a braided mane with a red ribbon, standing
    and looking curiously at the viewer.` },
  { id: 'coin-pile', kind: 'cut', aspect: '4:3',
    subject: `A small heap of shiny old gold coins and a few spilled colourful books.` },

  // ── Chapter 4: celebrations ─────────────────────────────────
  { id: 'cake', kind: 'cut', aspect: '1:1', key: 'green',
    subject: `A birthday cake made of a stack of five thick hardcover books in red, blue, yellow, teal and
    pink, with cream frosting dripping over the top book and three tall striped candles burning.` },
  { id: 'balloons', kind: 'cut', aspect: '9:16', key: 'green',
    subject: `A bunch of five round balloons (yellow, cobalt blue, terracotta, teal, pink) on curly strings
    tied together with a bow.` },
  { id: 'bunting', kind: 'cut', aspect: '16:9', key: 'green',
    subject: `A long garland of triangular fabric bunting flags in yellow, blue, terracotta, teal and cream
    with tiny patterns, hanging on a string in a gentle curve.` },
  { id: 'gifts', kind: 'cut', aspect: '1:1', key: 'green',
    subject: `A small stack of wrapped presents with ribbons, two of them book-shaped, and a little paper
    party hat on top.` },

  // ── Chapter 5: find us ──────────────────────────────────────
  { id: 'harbour', kind: 'cut', aspect: '16:9',
    subject: `A wide view of a small Montenegrin seaside town: a stone harbour wall with little boats,
    palm trees and a promenade, white houses with terracotta roofs, an old fortress on a hill, and green
    mountains behind. No sky.` },
  { id: 'sailboat', kind: 'cut', aspect: '1:1',
    subject: `A small wooden sailboat with a cream sail with a blue stripe and a little red flag.` },
  { id: 'palm', kind: 'cut', aspect: '9:16',
    subject: `A tall slightly curved palm tree with a textured trunk and lush fronds.` },
  { id: 'signpost', kind: 'cut', aspect: '3:4',
    subject: `A wooden signpost with three blank arrow-shaped boards pointing different ways, with a
    climbing flower vine and a little bird sitting on top. The boards are completely blank.` },

  // ── Hidden book-folk (collectibles) ─────────────────────────
  { id: 'critter-owl', kind: 'cut', aspect: '1:1',
    subject: `A small round tawny owl wearing tiny round glasses, holding a little book under its wing.` },
  { id: 'critter-badger', kind: 'cut', aspect: '1:1',
    subject: `A small friendly badger in a striped scarf peeking out with a cup of tea.` },
  { id: 'critter-hedgehog', kind: 'cut', aspect: '1:1',
    subject: `A tiny hedgehog carrying a red apple and a bookmark on its spines.` },
  { id: 'critter-dragon', kind: 'cut', aspect: '1:1',
    subject: `A tiny chubby teal dragon with small wings, hugging a book and puffing a little heart of smoke.` },
  { id: 'critter-cat', kind: 'cut', aspect: '1:1',
    subject: `A ginger cat curled up asleep on an open book.` },
  { id: 'critter-mouse', kind: 'cut', aspect: '1:1',
    subject: `A little grey mouse with a candle stub, reading a matchbox-sized book.` },

  // ── The red-haired librarian (chat avatar / poses) ──────────
  { id: 'ginger-hello', kind: 'cut', aspect: '1:1',
    subject: `Head-and-shoulders portrait of the same freckled girl with bright carrot-red braids sticking
    straight out sideways, a huge grin with a gap tooth, waving hello, a pencil tucked behind her ear,
    wearing a patched blue-and-yellow dress.` },
  { id: 'ginger-think', kind: 'cut', aspect: '1:1',
    subject: `Head-and-shoulders portrait of the same freckled girl with bright carrot-red braids sticking
    straight out sideways, thinking hard with a finger on her chin and eyes rolled up, a little open book
    balanced on top of her head.` },
  { id: 'ginger-read', kind: 'cut', aspect: '16:9',
    subject: `The same freckled girl with carrot-red braids sticking out sideways and mismatched stockings,
    lying on her tummy reading a big book, legs kicking up in the air, a tiny monkey in a blue hat sitting
    on her back.` },

  // ── Chapter 3: casting for the librarian's role ─────────────
  { id: 'stage-arch', kind: 'cut', aspect: '4:3',
    subject: `A miniature puppet-theatre proscenium seen straight from the front: an arch of carved gilded
    wood with a painted golden star at the top, deep red velvet curtains drawn open to both sides with gold
    tassels, a scalloped red valance, and inside the arch an empty deep-blue backdrop with tiny painted stars.` },
  { id: 'spotlight', kind: 'cut', aspect: '3:4',
    subject: `A vintage theatre spotlight on a tall three-legged stand, brass and black metal, switched on,
    with a warm golden glow at the lens.` },
  { id: 'director-chair', kind: 'cut', aspect: '1:1',
    subject: `A wooden folding director's chair with a terracotta-red canvas seat and back, a megaphone and a
    striped clapperboard leaning against it, and a script with a gold star on the seat.` },
  { id: 'critter-parrot', kind: 'cut', aspect: '1:1',
    subject: `A small colourful parrot with green, yellow and red feathers holding a tiny rolled-up script in
    its beak, perched on a paper theatre ticket.` },

  // Candidates: a headshot (chat avatar, casting card) and a full-body audition pose that is
  // generated from the headshot so the character stays the same.
  ...[
    ['cinder', `a sleek black cat with big amber-green eyes and a tiny red bow tie, a calm, mysterious
      half-smile, one ear slightly bent, a small open book in front of it`,
      `sitting elegantly upright on a small pile of old books, tail curled around its paws, looking mysterious`],
    ['patches', `a plump calico cat (white fur with big orange and black patches) with wide happy eyes,
      wearing a little brown explorer's hat with a feather, a rolled map under one paw`,
      `standing on her hind legs with a little leather backpack, holding a magnifying glass up to one eye`],
    ['mila', `an original young woman in her early twenties with soft, wavy, shoulder-length honey-blonde
      hair, light freckles and a gentle dreamy smile, wearing an oversized cream knit cardigan over a
      small-flowered 1970s-style dress, hugging a stack of books`,
      `standing and reading aloud from an open book, one hand raised expressively, cream cardigan, flowered
      dress, ankle boots`],
    ['nika', `a fourteen-year-old girl with a chin-length dark bob with one teal streak, round glasses, an
      oversized mustard-yellow hoodie and big headphones around her neck, a confident half-smile, holding a
      graphic novel`,
      `standing in sneakers and the mustard hoodie, holding a sketchbook and a pencil, headphones around her
      neck, waving`],
    ['tim', `a ten-year-old boy with messy dark curly hair, big round tortoiseshell glasses, a green knitted
      sweater vest over a white shirt with a red bow tie, a pencil behind his ear and an excited
      "did you know?" expression, holding a dinosaur encyclopedia`,
      `standing on tiptoe with a giant open dinosaur encyclopedia, pointing at it with a pencil, knee socks
      and sneakers`],
    ['marko', `a jolly old sea captain with a big fluffy white beard, rosy cheeks and twinkling eyes, a navy
      captain's cap with an anchor badge, a navy-and-white striped sailor shirt under a pea coat, holding a
      brass telescope`,
      `standing with a brass telescope tucked under one arm and an old leather logbook in the other hand,
      navy coat and boots, giving a cheerful salute`],
    ['bookmark', `a small friendly retro robot made of tin and old cloth book covers, a round head with two
      glowing round screen eyes and a smiling mouth line, a red ribbon bookmark sticking up like an antenna,
      little rivets, holding a glowing open book`,
      `rolling on small wheels, waving one hand and holding a glowing book in the other, ribbon-bookmark
      antenna on its head`],
  ].flatMap(([id, look, pose]) => [
    { id: `${id}-hello`, kind: 'cut', aspect: '1:1', subject: `Head-and-shoulders portrait of ${look}.` },
    { id: `${id}-stage`, kind: 'cut', aspect: '3:4', ref: `raw/${id}-hello.png`,
      subject: `Full-body picture of the same character as in the reference image (${look}), now ${pose}.
      Keep the face, colours and outfit exactly as in the reference.` },
  ]),
  { id: 'ginger-stage', kind: 'cut', aspect: '3:4', ref: 'raw/ginger-hello.png',
    subject: `Full-body picture of the same freckled girl as in the reference image: carrot-red braids
    sticking straight out sideways, patched blue-and-yellow dress, one striped and one plain stocking, huge
    black shoes. She stands proudly with one arm raised high holding an open book, as if taking a bow on a
    stage. Keep the face and outfit exactly as in the reference.` },

  // ── Page prints: the flat illustration printed under each pop-up spread ──
  // Seen from straight above; pale and calm so the cut-outs standing on them stay the stars.
  ...[
    ['ground-house', `a sunny courtyard: irregular cream and sand-coloured flagstones on the right half,
      a soft lawn with daisies and clover on the left half, a few fallen olive leaves`],
    ['ground-room', `a warm honey-coloured wooden floor of long planks with a big round braided rug in
      mustard, cobalt and terracotta rings in the middle, a couple of fallen pencils`],
    ['ground-chest', `an old hand-drawn treasure map: a sandy island with a wiggly coastline, a dotted
      path that ends in a big red X, a compass rose, little waves and a tiny sea serpent`],
    ['ground-stage', `a polished honey-wood theatre stage floor of long planks with a painted gold star in
      the middle, a few scattered red rose petals and two paper theatre tickets near the front edge`],
    ['ground-party', `a sunny lawn with a checked picnic blanket in yellow and blue, colourful confetti,
      curly paper streamers and a few scattered sweets`],
    ['ground-map', `an illustrated map of a small seaside town: turquoise sea with little waves along the
      bottom edge, a sandy beach and promenade with palm trees, a grid of streets with terracotta roofs,
      green hills along the top edge, one small yellow house marked with a red heart`],
  ].map(([id, subject]) => ({
    id, kind: 'plain', aspect: '3:2', size: '2K',
    subject: `Seen from directly above, flat like a picture-book page print: ${subject}.
      Pale, airy, low-contrast washes with plenty of warm cream paper showing through; the painting
      fades softly into blank cream paper near all four edges. No objects standing up, no cast shadows,
      no text, no letters, no frame, no border.`,
  })),

  // ── Textures ───────────────────────────────────────────────
  { id: 'table', kind: 'plain', aspect: '16:9',
    subject: `Seamless top-down texture of a warm honey-coloured old oak tabletop painted in gouache,
    long horizontal planks with soft grain, a few tiny scratches. Even soft light, no objects, no
    vignette, no shadows.` },
];
