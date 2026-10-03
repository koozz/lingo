# Contributing

Pull requests are welcome.

The main contribution is a new language pack:

1. Add a file named `lingo_(code).json`.
2. Use the chosen-language word or phrase as each key and its Dutch translation as the value.
3. Use the same category and word structure as the existing packs.
4. Add the language to `lingo.json`.
5. Set its text-to-speech language code.
6. Set its Dutch name, such as `Italiaans`.
7. Test the page in a browser.

Keep changes small. Use clear names. Write documentation in simple English.

For the Italian pack, use specific topics with 20 to 50 words per category.
Use the same short Dutch category names and category order in all packs.
Start with greetings and basic words. Put more complex topics later.
Keep existing words and translations unchanged when you move them between categories.
Do not add Italian regional terms or specialties to other language packs.

Keep Dutch answers unique within each pack, including case and punctuation variants.
Remove course-book labels such as `hier:` and verb references before example sentences.
Keep articles, grammatical endings, and labels that distinguish meanings.
Use lowercase vocabulary unless a name, acronym, or language rule requires a capital.
When you rename or merge an entry, add its old `category:word` ID to the pack's
`aliases` object. Map it to the new ID so saved review progress is kept.
