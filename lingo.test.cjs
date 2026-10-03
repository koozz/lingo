const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

const script = readFileSync(`${__dirname}/lingo.js`, 'utf8');
const config = JSON.parse(readFileSync(`${__dirname}/lingo.json`, 'utf8'));
const packs = Object.fromEntries(config.languages.map(language => [
  language.pack, JSON.parse(readFileSync(`${__dirname}/${language.pack}`, 'utf8'))
]));
const italianCategories = packs['lingo_it.json'].categories;
const firstItalianCategory = italianCategories[0];

test('Italian topics contain 20 to 50 words and keep all 1121 unique entries', () => {
  assert.equal(new Set(italianCategories.map(category => category.name)).size, italianCategories.length);
  const words = italianCategories.flatMap(category => {
    const entries = Object.entries(category.words);
    assert.ok(entries.length >= 20 && entries.length <= 50, category.name);
    assert.ok(entries.every(([word, translation]) => word && typeof translation === 'string' && translation));
    return entries.map(([word]) => word);
  });
  assert.equal(words.length, 1121);
  assert.equal(new Set(words).size, words.length);
});

test('all packs share short Dutch topics in the same learning order', () => {
  const names = italianCategories.map(category => category.name);
  assert.equal(names.length, 41);
  assert.ok(names.every(name => name.length <= 24));
  assert.deepEqual(names.slice(0, 5), [
    'Begroetingen', 'Voornaamwoorden', 'Basiswerkwoorden', 'Getallen 0-29', 'Familie'
  ]);
  for (const pack of Object.values(packs)) {
    assert.deepEqual(pack.categories.map(category => category.name), names);
    for (const category of pack.categories) {
      const entries = Object.entries(category.words);
      assert.ok(entries.length > 0 && entries.length <= 50, category.name);
      assert.ok(entries.every(([word, translation]) => word && typeof translation === 'string' && translation));
    }
  }
});

test('Spanish and Danish omit Italian specialties but keep everyday vocabulary', () => {
  const specialties = [
    'op Siciliaanse wijze', 'uit/van Emilia-Romagna', 'Umbrisch', 'Venetiaans',
    'sneetje geroosterd brood met knoflook, zout en olie', 'soort pasta',
    'minestrone, groentesoep', 'de tiramisu', 'espresso met een scheut grappa of cognac',
    'Italiaans koffieapparaat', 'op Florentijnse wijze', 'op de wijze van vissers',
    'witte, zoete dessertwijn'
  ];
  const italianTranslations = new Set(italianCategories.flatMap(category => Object.values(category.words)));
  assert.ok(specialties.every(translation => italianTranslations.has(translation)));
  for (const [file, expectedCount] of [['lingo_es.json', 1103], ['lingo_da.json', 1102]]) {
    const entries = packs[file].categories.flatMap(category => Object.entries(category.words));
    const translations = new Set(entries.map(([, translation]) => translation));
    assert.equal(entries.length, expectedCount);
    assert.ok(specialties.every(translation => !translations.has(translation)), file);
    assert.ok(['de pasta', 'kleine pizza', 'Parmezaanse kaas', 'espresso', 'Italië', 'Italiaans']
      .every(translation => translations.has(translation)), file);
  }
});

class Element {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.className = '';
    this.disabled = false;
    this.style = {};
    this.classList = {
      add: name => this.classList.toggle(name, true),
      toggle: (name, enabled) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        if (enabled) classes.add(name); else classes.delete(name);
        this.className = [...classes].join(' ');
      }
    };
  }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return (this.text || '') + this.children.map(child => child.textContent).join(''); }
  replaceChildren(...children) { this.text = ''; this.children = children; }
  append(...children) { this.children.push(...children); }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [
      ...(selector.split(', ').includes(child.tagName) || selector === 'button:not(:disabled)' && child.tagName === 'button' && !child.disabled ? [child] : []),
      ...child.querySelectorAll(selector)
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  click() { if (!this.disabled) this.onclick?.(); }
  focus() {}
  setAttribute() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
}

async function launch(values = {}, speech = true) {
  const storage = new Map(Object.entries(values));
  const elements = new Map();
  const errors = [];
  const app = {
    storage, errors, roll: .25,
    get: id => {
      if (!elements.has(id)) elements.set(id, new Element());
      return elements.get(id);
    },
    stored: key => JSON.parse(storage.get(key)),
    flush: () => new Promise(resolve => setImmediate(resolve))
  };
  const speechSynthesis = { cancel() {}, speak() {}, getVoices: () => [] };
  app.fetch = async path => ({ ok: true, json: async () => path === 'lingo.json' ? config : packs[path] });
  vm.runInNewContext(script, {
    document: { getElementById: app.get, createElement: tag => new Element(tag), createTextNode: text => Object.assign(new Element('#text'), { textContent: text }) },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    fetch: (...args) => app.fetch(...args),
    window: speech ? { speechSynthesis } : {},
    speechSynthesis,
    SpeechSynthesisUtterance: function (text) { this.text = text; },
    Option: function (text, value) { return Object.assign(new Element('option'), { textContent: text, value }); },
    Math: Object.assign(Object.create(Math), { random: () => app.roll }),
    Date, Set, Number, navigator: {}, confirm: () => true,
    console: { error: (...args) => errors.push(args) },
    setTimeout: callback => callback()
  });
  await app.flush();
  assert.notEqual(app.get('prompt').textContent, 'Kan de taal niet laden.');
  app.word = () => {
    const language = config.languages.find(item => item.id === (storage.get('lingo-language') || 'it'));
    const category = packs[language.pack].categories.find(item => item.name === app.get('category').textContent);
    const prompt = app.get('prompt').children[1].textContent;
    const [foreign, dutch] = Object.entries(category.words).find(([foreign, dutch]) => foreign === prompt || dutch === prompt);
    return { id: `${category.name}:${foreign}`, answer: foreign === prompt ? dutch : foreign };
  };
  app.answer = correct => {
    const answer = app.word().answer;
    const button = app.get('answerArea').querySelectorAll('button').find(item => (item.textContent === answer) === correct);
    button.click();
    return button;
  };
  return app;
}

test('new users start with one category; locked words are not used', async () => {
  const app = await launch({ 'lingo-settings': '{"mode":"choice"}' });
  assert.deepEqual(app.stored('lingo-unlocks-it'), { xp: 0, unlockedCategories: 1 });
  assert.equal(app.get('dueCount').textContent, `${Object.keys(firstItalianCategory.words).length} te oefenen`);
  for (let index = 0; index < 20; index++) {
    assert.equal(app.get('category').textContent, firstItalianCategory.name);
    assert.ok(app.get('answerArea').children.every(button => Object.values(firstItalianCategory.words).includes(button.textContent)));
    app.answer(true);
    app.get('nextArea').children[0].click();
  }
});

test('XP uses the updated review level, preserves review intervals, and only awards once', async () => {
  const app = await launch({ 'lingo-settings': '{"mode":"choice"}' });
  const word = app.word();
  const button = app.answer(true);
  assert.equal(app.stored('lingo-unlocks-it').xp, 1);
  assert.equal(app.stored('lingo-progress-it')[word.id].level, 1);
  assert.match(app.get('feedback').textContent, /\+1 XP.*1 dag\./);
  button.onclick();
  assert.equal(app.stored('lingo-unlocks-it').xp, 1);
  assert.equal(app.get('nextArea').children.length, 1);

  const progress = Object.fromEntries(Object.keys(firstItalianCategory.words).map(foreign => [`${firstItalianCategory.name}:${foreign}`, { level: 8 }]));
  const advanced = await launch({ 'lingo-settings': '{"mode":"choice"}', 'lingo-progress-it': JSON.stringify(progress) });
  advanced.answer(true);
  assert.equal(advanced.stored('lingo-unlocks-it').xp, 9);
  assert.match(advanced.get('feedback').textContent, /240 dagen/);
  const capped = await launch({
    'lingo-settings': '{"mode":"choice"}',
    'lingo-progress-it': JSON.stringify(Object.fromEntries(Object.entries(progress).map(([id]) => [id, { level: 9 }])))
  });
  const cappedWord = capped.word();
  capped.answer(true);
  assert.equal(capped.stored('lingo-unlocks-it').xp, 9);
  assert.equal(capped.stored('lingo-progress-it')[cappedWord.id].level, 9);
  advanced.get('nextArea').children[0].click();
  const wrongWord = advanced.word();
  advanced.answer(false);
  assert.equal(advanced.stored('lingo-unlocks-it').xp, 9);
  assert.equal(advanced.stored('lingo-progress-it')[wrongWord.id].level, 7);
});

test('new questions have no answer result classes, in either direction', async () => {
  for (const speech of [true, false]) {
    const app = await launch({ 'lingo-settings': '{"mode":"choice"}' }, speech);
    for (const roll of [.25, .75, .25]) {
      app.answer(false);
      assert.ok(app.get('answerArea').children.some(button => button.className.includes('correct')));
      app.roll = roll;
      app.get('nextArea').children[0].click();
      assert.ok(app.get('answerArea').children.every(button => button.className === 'answer-button' && !button.disabled));
      assert.equal(app.get('listenButton').disabled, !speech || roll >= .5);
    }
  }
  const css = readFileSync(`${__dirname}/lingo.css`, 'utf8');
  assert.match(css, /\.answer-button:not\(:disabled\):hover \{ border-color: var\(--accent-2\); \}/);
});

test('typing awards XP and clears feedback on the next question', async () => {
  const app = await launch({ 'lingo-settings': '{"mode":"typing"}' });
  app.get('answerArea').children[0].value = app.word().answer;
  app.get('answerArea').children[1].click();
  assert.equal(app.stored('lingo-unlocks-it').xp, 1);
  app.get('nextArea').children[0].click();
  assert.equal(app.get('feedback').textContent, '');
  assert.equal(app.get('answerArea').children[1].className, 'submit');
});

test('thresholds require explicit clicks in order and do not spend XP', async () => {
  const app = await launch({ 'lingo-unlocks-it': '{"xp":175,"unlockedCategories":1}' });
  assert.equal(app.stored('lingo-unlocks-it').unlockedCategories, 1);
  app.get('categoriesButton').click();
  assert.equal(app.get('categoriesDialog').open, true);
  const skipped = app.get('categoryList').children[2].children[1];
  assert.equal(skipped.disabled, true);
  skipped.onclick();
  assert.equal(app.stored('lingo-unlocks-it').unlockedCategories, 1);
  for (const cost of [50, 100, 150]) {
    const button = app.get('categoryList').querySelector('button:not(:disabled)');
    assert.equal(button.textContent, `${cost} XP · Ontgrendel`);
    button.click();
    assert.equal(app.stored('lingo-unlocks-it').xp, 175);
  }
  assert.equal(app.stored('lingo-unlocks-it').unlockedCategories, 4);
  assert.equal(app.get('categoryList').querySelector('button:not(:disabled)'), null);
  app.roll = .99;
  app.get('questionMode').onchange({ target: { value: 'choice' } });
  assert.equal(app.get('category').textContent, packs['lingo_it.json'].categories[3].name);
  const availableCount = packs['lingo_it.json'].categories.slice(0, 4).reduce((total, category) => total + Object.keys(category.words).length, 0);
  assert.equal(app.get('dueCount').textContent, `${availableCount} te oefenen`);
  app.get('closeCategories').click();
  assert.equal(app.get('categoriesDialog').open, false);
  const restored = await launch(Object.fromEntries(app.storage));
  assert.equal(restored.get('categoriesButton').textContent, `Categorieën 4/${italianCategories.length}`);
});

test('all languages use cumulative 50, 75, and 100 XP tiers', async () => {
  for (const language of config.languages) {
    const app = await launch({ 'lingo-language': language.id });
    const rows = app.get('categoryList').children;
    assert.equal(rows[0].children[1].textContent, 'Ontgrendeld');
    let total = 0;
    for (let index = 1; index < rows.length; index++) {
      const categoryNumber = index + 1;
      total += categoryNumber <= 6 ? 50 : categoryNumber <= 16 ? 75 : 100;
      assert.equal(rows[index].children[1].textContent, `${total} XP · Ontgrendel`);
      assert.equal(rows[index].children[1].disabled, true);
    }
  }
});

test('unlock thresholds include exact boundaries at tier transitions and later categories', async () => {
  for (const [index, cost] of [[1, 50], [5, 250], [6, 325], [15, 1000], [16, 1100], [40, 3500]]) {
    for (const xp of [cost - 1, cost]) {
      const app = await launch({ 'lingo-unlocks-it': JSON.stringify({ xp, unlockedCategories: index }) });
      assert.deepEqual(app.errors, []);
      const row = app.get('categoryList').children[index];
      const button = row.children[1];
      assert.equal(button.textContent, `${cost} XP · Ontgrendel`);
      assert.equal(button.disabled, xp < cost);
      assert.equal(row.children[0].children[1].textContent, xp < cost ? 'Nog 1 XP nodig' : 'Klaar om te ontgrendelen');
      button.onclick();
      const unlockedCategories = xp < cost ? index : index + 1;
      assert.deepEqual(app.stored('lingo-unlocks-it'), { xp, unlockedCategories });
      const restored = await launch(Object.fromEntries(app.storage));
      assert.deepEqual(restored.errors, []);
      assert.deepEqual(restored.stored('lingo-unlocks-it'), { xp, unlockedCategories });
    }
  }
});

test('earning XP can reach the lower first unlock threshold', async () => {
  const app = await launch({ 'lingo-settings': '{"mode":"choice"}', 'lingo-unlocks-it': '{"xp":49,"unlockedCategories":1}' });
  app.answer(true);
  assert.equal(app.stored('lingo-unlocks-it').xp, 50);
  assert.equal(app.stored('lingo-unlocks-it').unlockedCategories, 1);
  assert.equal(app.get('categoryList').children[1].children[1].disabled, false);
  assert.match(app.get('categoriesButton').textContent, /Ontgrendel/);
});

test('the lower thresholds preserve XP and previously unlocked categories', async () => {
  for (const stored of [
    { xp: 400, unlockedCategories: 5 },
    { xp: 1400, unlockedCategories: 15 },
    { xp: 4000, unlockedCategories: 41 }
  ]) {
    const app = await launch({ 'lingo-unlocks-it': JSON.stringify(stored) });
    assert.deepEqual(app.errors, []);
    assert.deepEqual(app.stored('lingo-unlocks-it'), stored);
    assert.equal(app.get('xp').textContent, `${stored.xp} XP`);
    assert.equal(app.get('categoryList').querySelector('button:not(:disabled)') !== null, stored.unlockedCategories < 41);
  }
});

test('progress stays separate per language; reset clears only the selected language', async () => {
  const wordId = `${firstItalianCategory.name}:${Object.keys(firstItalianCategory.words)[0]}`;
  const app = await launch({
    'lingo-settings': '{"mode":"choice"}',
    'lingo-unlocks-it': '{"xp":200,"unlockedCategories":2}',
    'lingo-progress-it': JSON.stringify({ [wordId]: { level: 4 } })
  });
  await app.get('languageSelect').onchange({ target: { value: 'es' } });
  assert.deepEqual(app.stored('lingo-unlocks-es'), { xp: 0, unlockedCategories: 1 });
  app.answer(true);
  await app.get('languageSelect').onchange({ target: { value: 'it' } });
  assert.equal(app.get('xp').textContent, '200 XP');
  assert.equal(app.stored('lingo-progress-it')[wordId].level, 4);
  app.get('resetButton').click();
  assert.deepEqual(app.stored('lingo-unlocks-it'), { xp: 0, unlockedCategories: 1 });
  assert.deepEqual(app.stored('lingo-progress-it'), {});
  assert.equal(app.stored('lingo-unlocks-es').xp, 1);
});

test('invalid saved XP is reported and cannot unlock categories', async () => {
  for (const stored of [
    'null', '{', '{"xp":-1,"unlockedCategories":1}', '{"xp":0,"unlockedCategories":3}',
    '{"xp":"200","unlockedCategories":2}', '{"xp":199,"unlockedCategories":5}',
    '{"xp":999,"unlockedCategories":16}', '{"xp":1099,"unlockedCategories":17}'
  ]) {
    const app = await launch({ 'lingo-unlocks-it': stored });
    assert.deepEqual(app.stored('lingo-unlocks-it'), { xp: 0, unlockedCategories: 1 });
    if (stored !== 'null') assert.ok(app.errors.length);
  }
});

test('rapid language changes cannot apply an earlier language pack', async () => {
  const app = await launch();
  const fetch = app.fetch;
  let release;
  app.fetch = path => path === 'lingo_es.json' ? new Promise(resolve => { release = () => resolve(fetch(path)); }) : fetch(path);
  const pending = app.get('languageSelect').onchange({ target: { value: 'es' } });
  assert.equal(app.get('answerArea').children.length, 0);
  assert.equal(app.get('listenButton').disabled, true);
  await app.get('languageSelect').onchange({ target: { value: 'da' } });
  release();
  await pending;
  assert.equal(app.get('languageLabel').textContent, 'Dansk');
  assert.equal(app.storage.has('lingo-unlocks-es'), false);
  assert.deepEqual(app.stored('lingo-unlocks-da'), { xp: 0, unlockedCategories: 1 });
});
