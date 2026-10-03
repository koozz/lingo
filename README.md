# lingo

This is a vibe-coded, installable offline-first language practice page.
To scratch my own itch.

- Open it at [lingo.koozz.nl](https://lingo.koozz.nl).
- Choose the language you want to learn.
- Practice translations between the chosen language and Dutch.
- Progress and settings stay in browser local storage.
- Each language starts with its first category unlocked.
- A correct answer adds 1–9 XP, equal to the word's updated review level.
- Open **Categorieën** to unlock categories in language-pack order.
- The next categories require total XP of 100, 200, 300, and so on. Unlocks do not use up XP.
- XP and category unlocks stay in browser local storage for each language.
- Existing word progress stays unchanged. The XP system starts at 0 XP.
- **Reset progress** clears word progress, XP, and category unlocks for the selected language.

The page uses plain HTML, CSS, and JavaScript. It runs on GitHub Pages. The service worker preloads the app shell and all language packs for offline use after the first visit.

Run the interaction tests with `node --test lingo.test.cjs`. No packages are required.
