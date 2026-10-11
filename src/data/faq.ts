// The questions on /faq. `html` is the answer as it is shown; `text` is the same answer as plain
// text for the FAQPage JSON-LD (search engines read that one). Keep the two saying the same thing.
//
// Every fact comes from the rustyAC repo; the source is named above each answer. The answer to
// "who made it, and was AI used?" is a placeholder the owner fills in: do not write it.
import { LINKS, TRADEMARK_LINE } from '../lib/site';

export interface Faq {
  id: string;
  question: string;
  html: string;
  text: string;
}

export interface FaqGroup {
  title: string;
  items: Faq[];
}

export const AI_DISCLAIMER = 'put ai disclaimer here';

const a = (href: string, label: string) => `<a href="${href}"${href.startsWith('/') ? '' : ' rel="noopener"'}>${label}</a>`;

export const FAQ: FaqGroup[] = [
  {
    title: 'The project',
    items: [
      {
        // rustyAC LICENSING.md, "Trademark"; packaging/HOW_TO_RUN.txt, section 4
        id: 'official',
        question: 'Is this affiliated with Kunos, or official?',
        html: `<p>No. ${TRADEMARK_LINE}</p>`,
        text: `No. ${TRADEMARK_LINE}`,
      },
      {
        // LICENSING.md ("No Assetto Corsa files"); HOW_TO_RUN.txt, section 1
        id: 'legal',
        question: 'Is it legal?',
        html: '<p>These are the facts; this is not legal advice. You need your own copy of Assetto Corsa to use rustyAC. rustyAC ships no game files: not the program, not its cars or tracks, not its sounds. It reads them from your own install, and it writes nothing into the game’s folder. rustyAC’s own code is open source.</p>',
        text: 'These are the facts; this is not legal advice. You need your own copy of Assetto Corsa to use rustyAC. rustyAC ships no game files: not the program, not its cars or tracks, not its sounds. It reads them from your own install, and it writes nothing into the game’s folder. rustyAC’s own code is open source.',
      },
      {
        // docs/port/sctm.md, section 4 ("Rust never contracts or reorders float operations on its own"); docs/port/web.md (the same crates as WebAssembly)
        id: 'rust',
        question: 'Why Rust?',
        html: `<p>rustyAC is a rewrite of the game (still in progress), not a patch on the original program, and Rust is the language it is written in. Two things about Rust help a port like this. Built the way rustyAC builds it, it never reorders or merges floating-point operations by itself, so the code computes exactly what is written, which a bit-exact port depends on. And the same code compiles to WebAssembly, which is how the browser preview runs the same physics. ${a('/how-it-works', 'How it works')} has the whole method.</p>`,
        text: 'rustyAC is a rewrite of the game (still in progress), not a patch on the original program, and Rust is the language it is written in. Two things about Rust help a port like this. Built the way rustyAC builds it, it never reorders or merges floating-point operations by itself, so the code computes exactly what is written, which a bit-exact port depends on. And the same code compiles to WebAssembly, which is how the browser preview runs the same physics.',
      },
      {
        id: 'who',
        question: 'Who made it, and was AI used?',
        html: `<p>${AI_DISCLAIMER}</p>`,
        text: AI_DISCLAIMER,
      },
      {
        // README.md, "Contributing" and the Discord line
        id: 'help',
        question: 'How can I help?',
        html: `<p>Try it and say what broke: join the ${a(LINKS.discord, 'Discord')} or open an ${a(`${LINKS.github}/issues`, 'issue on GitHub')}. Pull requests are welcome too; every one gets reviewed.</p>`,
        text: 'Try it and say what broke: join the Discord or open an issue on GitHub. Pull requests are welcome too; every one gets reviewed.',
      },
    ],
  },
  {
    title: 'What you need',
    items: [
      {
        // HOW_TO_RUN.txt, section 1
        id: 'need-ac',
        question: 'Do I need Assetto Corsa?',
        html: '<p>Yes. The tracks, the car models, the car data and the sound are all read from your own Assetto Corsa install. rustyAC finds it by itself in Steam’s usual place and in every other Steam library.</p>',
        text: 'Yes. The tracks, the car models, the car data and the sound are all read from your own Assetto Corsa install. rustyAC finds it by itself in Steam’s usual place and in every other Steam library.',
      },
      {
        // docs/port/tracks.md, sections 6 and 8; docs/port/suspensions.md, section 4; README.md
        id: 'csp',
        question: 'Does Custom Shaders Patch (CSP) work?',
        html: `<p>No. rustyAC is plain Assetto Corsa and does not implement CSP. Cars and tracks made only for CSP are refused with a message that says so, and CSP’s extras on a plain track are ignored. ${a('/compatibility', 'Compatibility')} lists what loads.</p><p>It also means a car will not handle the same in rustyAC as in your own game if CSP is switched on there: CSP changes the physics.</p>`,
        text: 'No. rustyAC is plain Assetto Corsa and does not implement CSP. Cars and tracks made only for CSP are refused with a message that says so, and CSP’s extras on a plain track are ignored. It also means a car will not handle the same in rustyAC as in your own game if CSP is switched on there: CSP changes the physics.',
      },
      {
        // HOW_TO_RUN.txt, section 2 (race.ini and assists.ini); docs/port/conditions.md
        id: 'content-manager',
        question: 'Does it work with Content Manager?',
        html: '<p>rustyAC is started on its own, from the command line. It reads the session you last set up (temperatures, grip, wind and driving aids) from Assetto Corsa’s own settings files, and those are the files Content Manager writes too. So the conditions and aids of a session set up in Content Manager are the ones rustyAC drives with; the car and track still come from the command line.</p>',
        text: 'rustyAC is started on its own, from the command line. It reads the session you last set up (temperatures, grip, wind and driving aids) from Assetto Corsa’s own settings files, and those are the files Content Manager writes too. So the conditions and aids of a session set up in Content Manager are the ones rustyAC drives with; the car and track still come from the command line.',
      },
      {
        // HOW_TO_RUN.txt, section 1; docs/port/suspensions.md, section 5
        id: 'mods',
        question: 'Do mods work?',
        html: `<p>A mod car or track that plain Assetto Corsa can load works in rustyAC too. One that needs CSP does not. See ${a('/compatibility', 'compatibility')}.</p>`,
        text: 'A mod car or track that plain Assetto Corsa can load works in rustyAC too. One that needs CSP does not.',
      },
      {
        // HOW_TO_RUN.txt, section 1; docs/web.md
        id: 'mac-linux',
        question: 'Does it run on Mac or Linux?',
        html: `<p>The desktop build is Windows only (Windows 10 or 11, 64-bit). The ${a('/play', 'browser preview')} runs in Chrome or Edge on a computer (tested in Chrome only), and still needs your own Assetto Corsa folder.</p>`,
        text: 'The desktop build is Windows only (Windows 10 or 11, 64-bit). The browser preview runs in Chrome or Edge on a computer (tested in Chrome only), and still needs your own Assetto Corsa folder.',
      },
    ],
  },
  {
    title: 'What it can do',
    items: [
      {
        // brainstorm.md ROADMAP, phase 4 (tasks M1, M2)
        id: 'multiplayer',
        question: 'Is there multiplayer?',
        html: `<p>Not yet. It is planned, by porting Assetto Corsa’s own network protocol. ${a('/progress', 'Progress')} shows where it sits.</p>`,
        text: 'Not yet. It is planned, by porting Assetto Corsa’s own network protocol.',
      },
      {
        // brainstorm.md ROADMAP, phase 4 (task 25); HOW_TO_RUN.txt, section 2 (--autodrive)
        id: 'ai',
        question: 'Are there AI opponents?',
        html: '<p>Not yet. AI drivers are planned. Today you drive alone; <code>--autodrive</code> lets you watch a simple driver follow the track’s line.</p>',
        text: 'Not yet. AI drivers are planned. Today you drive alone; the --autodrive option lets you watch a simple driver follow the track’s line.',
      },
      {
        // brainstorm.md ROADMAP, phase 5 (tasks 27-28); docs/port/renderer_leftovers.md ("rustyAC has no menu")
        id: 'menus',
        question: 'Are there menus?',
        html: `<p>Not yet. You start rustyAC from the command line and pick the car and track with options. ${a('/download#options', 'The common ones')} are on the download page.</p>`,
        text: 'Not yet. You start rustyAC from the command line and pick the car and track with options.',
      },
    ],
  },
];
