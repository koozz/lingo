# Application requirements

These requirements come from the project owner's requests.
When a request changes an earlier rule, use the newer rule.

## Platform and files

- Build `lingo` as a static page with HTML, CSS, and minimal JavaScript.
  Keep it mobile-friendly. The main practice page must fit the screen without scrolling.
- Host the page on GitHub Pages at `lingo.koozz.nl`.
  Keep `CNAME` as a single line with that domain.
- Make the page installable as a web app.
  Preload and cache the app files and language packs for offline use.
- Use `lingo.js`, `lingo.css`, `lingo.json`, and `lingo_(code).json`.
  Keep the application free of runtime dependencies.

## Languages and storage

- Support Italian-Dutch, Spanish-Dutch, and Danish-Dutch practice.
  Do not use Italian as the translation language in the Spanish or Danish packs.
- Configure available languages, pack files, and speech language codes in `lingo.json`.
- Start with the last selected language.
  Store the language, settings, word review levels, XP, and unlocked categories in localStorage.
- Keep progress separate for each language.
  Keep the calculation from review level to review interval in code so it can be adjusted.

## Page layout

- Use a cogwheel in the top-right corner to open a settings popover.
  Include language selection, question types, and typing probability.
- Write practice instructions in Dutch.
  Show `vertaal: ` followed by the word or phrase in italics.
  Use lowercase questions and answers unless correct spelling requires a capital.
  Keep required capitals in names, Dutch language names, acronyms, and pronouns.
- Do not show a footer or the text `Elke vraag is in het Nederlands.`
  Show the selected language after `learn daily` in the header.
  Separate them with a middle dot and two spaces on each side.
- Put the answer controls above the listen and next buttons.
  After an answer, show a clear button to move to the next question.

## Speech

- Use browser text-to-speech with the selected language's speech code.
  Do not add speech-to-text input.
- When the prompt is a foreign word and the answers are Dutch, speak the foreign word immediately.
  Do not speak it again when the user selects a Dutch answer.
- When the prompt is Dutch, do not speak the foreign answer before the user answers.
  Speak the correct foreign answer after it is shown or highlighted.
- Keep the `Beluister` button visible.
  Disable it when listening is not available or would reveal the answer.
  Do not pronounce reference markers such as `[2]`.

## Vocabulary and categories

- Use the same short, unique Dutch category names and category order in all three packs.
  Start with basic knowledge and build toward more complex topics.
  Aim for 20 to 50 words per category.
- Keep Italian words and their meanings when categories change.
  Do not carry Italian regional terms or specialties, such as Bruschetta, into the Spanish and Danish packs.
- Remove course-book labels such as `hier:` and verb references before example sentences.
  For example, change `stare*: Sto bene.` to `sto bene`.
  Keep articles and grammatical endings.
- Keep Dutch answers unique across each complete language pack.
  Distinguish real meanings, such as singular and plural pronouns.
  Keep meaning labels that prevent ambiguity.
- Use `alstublieft (geven)` for `prego` and `alstublieft (vragen)` for `per favore`.
  Apply the same distinction to Spanish and Danish.
  Entries that become identical after cleanup may be merged.
  Preserve saved review progress for renamed or merged entries.

## Questions and answer feedback

- Ask questions in both directions: foreign language to Dutch and Dutch to foreign language.
  Support multiple-choice and typed answers with a configurable mix.
- A multiple-choice question must have one correct choice and three distractors.
  Prefer distractors from the same category.
  Use other unlocked categories when needed.
- Remove course-book prefixes and suffixes from displayed answers before comparing choices.
  All four choices must have distinct text.
  Do not use an answer that becomes the same as the correct choice after cleanup.
- Each fresh question must show answer buttons with the same border color and no previous result highlight.
  Hover must not make one fresh choice look like the correct answer.
  Show the correct answer in green after an answer is given.
- Typed answers must support a configurable accuracy percentage, with a default of 90%.
  Accept answers that meet the threshold.
  If an accepted answer is not exact, show `Bijna goed! Je schrijft het zo: ` followed by the correct spelling.

## Reviews and daily completion

- Correct answers raise the word's review score and affect its next review interval.
  Do not ask a word again while its review is on cooldown.
- Incorrect answers must leave the word open for further practice.
- A user can finish the day by correctly answering all open words in unlocked categories.
  Do not fall back to words that are on cooldown when no open words remain.
- When practice is complete, show `Lekker bezig! Je bent klaar voor vandaag.`
  If the user unlocks a category with open words, allow practice to continue.

## XP and category unlocks

- Start with category 1 unlocked for free.
  A correct answer adds the word's updated review score to XP.
- Increase the cumulative unlock threshold by 50 XP for each category from 2 through 6,
  by 75 XP for each category from 7 through 16, and by 100 XP from category 17 onward.
  Unlocking a category does not spend XP.
- Enough XP makes a category eligible, but unlocking requires an explicit click.
  Unlock categories only in order, even when several are eligible.
- Store XP and unlocked categories in localStorage.
  Preserve existing XP and valid unlocks when thresholds change.

## License, documentation, and validation

- Keep the project under AGPL-3.0.
  Include a link to the source repository in the settings popover.
- Keep `README.md` succinct. State that the project is vibe-coded, what it does, and where to find it.
- Keep `CONTRIBUTING.md` clear that pull requests with language packs are welcome.
  Write Markdown documentation and code comments in ASD-STE100 Simplified Technical English.
- Run `node --test lingo.test.cjs` after application or vocabulary changes.
  Check fresh answer styles in a browser when styles change.
  Update the service-worker cache version when cached application files change.
