import { defineCollection, z } from 'astro:content';

// ---- Rooms ----
// One entry per Dojo room. Slug = URL path (vision.md -> /vision).
const rooms = defineCollection({
  type: 'content',
  schema: z.object({
    doorNum: z.string(),                                                 // "01"..."07"
    doorLabel: z.string(),                                               // "The Gate", "War Room", ...
    title: z.string(),                                                   // "The Vision — Found in KC"
    subtitle: z.string(),                                                // door sub on the wall
    order: z.number(),                                                   // ordering on the wall
    guide: z.enum(['sensei', 'creative', 'architect', 'ally']),          // which lil-ninja leads
    accent: z.enum(['orange', 'deep']).default('orange'),                // door lintel accent
    parked: z.boolean().default(false),                                  // "Someday" tiles
    variant: z.enum(['content', 'crew', 'floor']).default('content'),    // page template
    cta: z.string().optional(),                                          // bottom action line
    ref: z.string().optional(),                                          // "Full detail: ..." reference
  }),
});

// ---- Partners ----
// One entry per person on the Crew page's "Three Doors" section.
// Editing here changes the doorcards without touching any component.
const partners = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),                                                    // "Gabe"
    role: z.string(),                                                    // "Creative Director"
    avatar: z.enum(['sensei', 'creative', 'architect', 'ally']),         // which lil-ninja chip renders
    order: z.number(),                                                   // display order on the Crew page
    emblem: z.string(),                                                  // crew emblem asset filename
    banner: z.string(),                                                  // crew banner asset filename
    photo: z.string(),                                                   // headshot asset filename
    linkedin: z.string().url(),                                          // LinkedIn profile URL
    bio: z.string(),                                                     // one-line bio
    roadmap: z.string().optional(),                                      // optional roadmap route
    pitch: z.string(),                                                   // one-line framing (renders above the quote)
    say: z.string(),                                                     // the italic quote (orange box)
  }),
});

export const collections = { rooms, partners };
