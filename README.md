# lingo

This is a vibe-coded, installable offline-first language practice page.
To scratch my own itch.

- Open it at [lingo.koozz.nl](https://lingo.koozz.nl).
- Choose the language you want to learn.
- Practice translations between the chosen language and Dutch.
- Questions and answers use lowercase unless correct spelling requires a capital.
- Progress and settings stay in browser local storage.
- Each language starts with its first category unlocked.
- A correct answer adds 1–9 XP, equal to the word's updated review level.
- Correct words return after 1, 2, 4, 8, 16, 32, 64, 128, or 256 local calendar days, based on their review level. The time of the answer does not affect the due date. When no unlocked words are due, the page shows **Lekker bezig! Je bent klaar voor vandaag.**
- **Answer accuracy** sets the minimum typing similarity. The default is 90%. Case and punctuation do not affect the score. The score is 100% minus the percentage of character edits. That percentage uses the longer answer length.
- An accepted typo earns XP and shows **Bijna goed! Je schrijft het zo:** with the correct answer. At 100%, the normalized answer must match exactly.
- Multiple-choice questions use four distinct answers without book annotations. Articles, grammatical endings, and meaning labels such as **(geven)** and **(vragen)** stay visible.
- Open **Categorieën** to unlock categories in language-pack order.
- Unlock thresholds increase by 50 XP for categories 2-6, by 75 XP for categories 7-16, and by 100 XP from category 17. Unlocks do not use up XP.
- XP and category unlocks stay in browser local storage for each language.
- Existing word progress stays unchanged. The XP system starts at 0 XP.
- Renamed and merged vocabulary entries retain their saved review progress. For a merge, the latest review is kept.
- **Reset progress** clears word progress, XP, and category unlocks for the selected language.

The page uses plain HTML, CSS, and JavaScript. It runs on GitHub Pages. The service worker preloads the app shell and all language packs for offline use after the first visit.

Run the interaction tests with `node --test lingo.test.cjs`. No packages are required.

## License

Copyright (c) 2026 Jan van den Berg (koozz).

This project uses the [GNU Affero General Public License, version 3](LICENSE) (AGPL-3.0-only).
The source code is available on [GitHub](https://github.com/koozz/lingo) and through the link in Settings.
