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

test('Italian topics contain 20 to 50 words and 1120 unique entries after merging an identical phrase', () => {
  assert.equal(new Set(italianCategories.map(category => category.name)).size, italianCategories.length);
  const words = italianCategories.flatMap(category => {
    const entries = Object.entries(category.words);
    assert.ok(entries.length >= 20 && entries.length <= 50, category.name);
    assert.ok(entries.every(([word, translation]) => word && typeof translation === 'string' && translation));
    return entries.map(([word]) => word);
  });
  assert.equal(words.length, 1120);
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
  for (const [file, expectedCount] of [['lingo_es.json', 1102], ['lingo_da.json', 1100]]) {
    const entries = packs[file].categories.flatMap(category => Object.entries(category.words));
    const translations = new Set(entries.map(([, translation]) => translation));
    assert.equal(entries.length, expectedCount);
    assert.ok(specialties.every(translation => !translations.has(translation)), file);
    assert.ok(['de pasta', 'kleine pizza', 'Parmezaanse kaas', 'espresso', 'Italië', 'Italiaans']
      .every(translation => translations.has(translation)), file);
  }
});

test('vocabulary has unique Dutch answers, no book annotations, and distinct polite meanings', () => {
  const normalize = text => text.normalize('NFC').toLowerCase().replace(/[.,!?;:()[\]{}'"“”'’]/g, '').replace(/\s+/g, ' ').trim();
  for (const pack of Object.values(packs)) {
    const entries = pack.categories.flatMap(category => Object.entries(category.words));
    const translations = entries.map(([, dutch]) => normalize(dutch));
    assert.equal(new Set(translations).size, translations.length);
    assert.ok(entries.every(([foreign, dutch]) => !/[:*]|\[\d+\]/.test(foreign) && !/^hier:/i.test(dutch)));
    const polite = pack.categories[0].words;
    assert.ok(Object.values(polite).includes('alstublieft (geven)'));
    assert.ok(Object.values(polite).includes('alstublieft (vragen)'));
    const ids = new Set(pack.categories.flatMap(category => Object.keys(category.words).map(word => `${category.name}:${word}`)));
    assert.ok(Object.values(pack.aliases).every(id => ids.has(id)));
  }
  assert.equal(firstItalianCategory.words.prego, 'alstublieft (geven)');
  assert.equal(firstItalianCategory.words['per favore'], 'alstublieft (vragen)');
  assert.equal(firstItalianCategory.words['Sto bene'], 'Met mij gaat het goed');
  assert.ok(italianCategories.some(category => Object.hasOwn(category.words, 'alto/-a')));
  assert.ok(italianCategories.some(category => Object.hasOwn(category.words, 'il biscotto')));
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

async function launch(values = {}, speech = true, options = {}) {
  const storage = new Map(Object.entries(values));
  const elements = new Map();
  const errors = [];
  const app = {
    storage, errors, roll: options.roll ?? .25, now: options.now ?? Date.now(), packs: options.packs || packs,
    get: id => {
      if (!elements.has(id)) elements.set(id, new Element());
      return elements.get(id);
    },
    stored: key => JSON.parse(storage.get(key)),
    flush: () => new Promise(resolve => setImmediate(resolve))
  };
  const speechSynthesis = { cancel() {}, speak() {}, getVoices: () => [] };
  app.fetch = async path => ({ ok: true, json: async () => path === 'lingo.json' ? config : app.packs[path] });
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [app.now])); }
    static now() { return app.now; }
  }
  vm.runInNewContext(script, {
    document: { getElementById: app.get, createElement: tag => new Element(tag), createTextNode: text => Object.assign(new Element('#text'), { textContent: text }) },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    fetch: (...args) => app.fetch(...args),
    window: speech ? { speechSynthesis } : {},
    speechSynthesis,
    SpeechSynthesisUtterance: function (text) { this.text = text; },
    Option: function (text, value) { return Object.assign(new Element('option'), { textContent: text, value }); },
    Math: Object.assign(Object.create(Math), { random: () => app.roll }),
    Date: Clock, Set, Number, navigator: {}, confirm: () => true,
    console: { error: (...args) => errors.push(args) },
    setTimeout: callback => callback()
  });
  await app.flush();
  assert.notEqual(app.get('prompt').textContent, 'Kan de taal niet laden.');
  app.word = () => {
    const language = config.languages.find(item => item.id === (storage.get('lingo-language') || 'it'));
    const category = app.packs[language.pack].categories.find(item => item.name === app.get('category').textContent);
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
  assert.doesNotMatch(css, /\.answer-button[^{}]*:hover[^{}]*\{[^}]*border-color/);
  assert.match(css, /\.answer-button:focus-visible \{ outline: 2px solid var\(--accent-2\); outline-offset: 2px; \}/);
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

test('choices remove book labels and duplicate visible answers in both directions', async () => {
  const fixture = { categories: [{ name: 'Begroetingen', words: {
    'verb: Alpha [1]': 'hier: Een [1]',
    'label: Beta [1]': 'hier: Twee [1]',
    'Beta [2]': 'Twee [2]',
    'label: Gamma': 'Drie',
    'label: Delta': 'Vier',
    'verb: Alpha [2]': 'Anders'
  } }] };
  for (const roll of [0, .75]) {
    const app = await launch({ 'lingo-settings': '{"mode":"choice"}' }, true, {
      roll, packs: { ...packs, 'lingo_it.json': fixture }
    });
    const choices = app.get('answerArea').children.map(button => button.textContent);
    assert.equal(choices.length, 4);
    assert.equal(new Set(choices.map(text => text.toLowerCase())).size, 4);
    assert.ok(choices.every(text => !/[:*]|\[\d+\]/.test(text)));
    assert.deepEqual([...choices].sort(), roll === 0 ? ['Drie', 'Een', 'Twee', 'Vier'] : ['Alpha', 'Beta', 'Delta', 'Gamma']);
    assert.equal(app.get('prompt').children[1].textContent, roll === 0 ? 'Alpha' : 'Vier');
    app.get('answerArea').children.find(button => button.textContent === (roll === 0 ? 'Een' : 'Delta')).click();
    assert.equal(app.stored('lingo-unlocks-it').xp, 1);
  }
});

test('insufficient distinct choices use typing with an explicit explanation', async () => {
  const fixture = { categories: [{ name: 'Begroetingen', words: {
    Alpha: 'Een', Beta: 'Twee', Gamma: 'Drie', 'Gamma [1]': 'Drie [1]'
  } }] };
  const app = await launch({ 'lingo-settings': '{"mode":"choice"}' }, true, {
    roll: 0, packs: { ...packs, 'lingo_it.json': fixture }
  });
  assert.equal(app.get('answerArea').children[0].tagName, 'input');
  assert.equal(app.get('feedback').textContent, 'Te weinig verschillende keuzes. Typ je antwoord.');
});

const typingFixture = { categories: [{ name: 'Begroetingen', words: {
  uno: 'een', due: 'twee', tre: 'drie', buongiorno: 'goedemorgen'
} }] };

test('typing similarity accepts 90 percent with correction feedback, not lower scores or empty answers', async () => {
  for (const [input, correct, near] of [
    ['buongiorno', true, false], [' BUONGIORNO! ', true, false],
    ['buongiorna', true, true], ['buongiorn', true, true], ['buongiornoo', true, true],
    ['buongior', false, false], ['buongioron', false, false],
    ['', false, false], ['   ', false, false], ['junk: buongiorno', false, false]
  ]) {
    const app = await launch({ 'lingo-settings': '{"mode":"typing"}' }, true, {
      roll: .75, packs: { ...packs, 'lingo_it.json': typingFixture }
    });
    assert.equal(app.get('accuracyValue').textContent, '90%');
    assert.equal(app.word().answer, 'buongiorno');
    app.get('answerArea').children[0].value = input;
    const button = app.get('answerArea').children[1];
    button.click();
    assert.equal(app.stored('lingo-unlocks-it').xp, correct ? 1 : 0, input);
    assert.equal(app.stored('lingo-progress-it')['Begroetingen:buongiorno'].correct, correct);
    assert.equal(app.get('dueCount').textContent, `${correct ? 3 : 4} te oefenen`);
    if (near) assert.equal(app.get('feedback').textContent, 'Bijna goed! Je schrijft het zo: buongiorno');
    else assert.ok(app.get('feedback').textContent.startsWith(correct ? 'Goed!' : 'Nog niet.'));
    button.onclick();
    assert.equal(app.stored('lingo-unlocks-it').xp, correct ? 1 : 0);
  }
});

test('typing similarity works in the Dutch direction and with Unicode accents', async () => {
  for (const [foreign, dutch, input] of [
    ['buongiorno', 'goedemorgen', 'goedemorgem'],
    ['università', 'universiteit', 'universita'],
    ['università', 'universiteit', 'universita\u0300']
  ]) {
    const fixture = { categories: [{ name: 'Begroetingen', words: {
      uno: 'een', [foreign]: dutch, due: 'twee', tre: 'drie'
    } }] };
    const roll = foreign === 'buongiorno' ? .25 : .75;
    if (roll === .75) {
      fixture.categories[0].words = { uno: 'een', due: 'twee', tre: 'drie', [foreign]: dutch };
    }
    const app = await launch({ 'lingo-settings': '{"mode":"typing"}' }, true, {
      roll, packs: { ...packs, 'lingo_it.json': fixture }
    });
    app.get('answerArea').children[0].value = input;
    app.get('answerArea').children[1].click();
    assert.equal(app.stored('lingo-unlocks-it').xp, 1);
    assert.ok(app.get('feedback').textContent.startsWith(input.endsWith('\u0300') ? 'Goed!' : 'Bijna goed!'));
  }
});

test('answer accuracy is configurable, persisted, and validated', async () => {
  for (const [accuracy, input, correct] of [[95, 'buongiorna', false], [80, 'buongior', true], [100, 'buongiorna', false], [100, 'buongiorno', true], [1, '', false]]) {
    const app = await launch({ 'lingo-settings': '{"mode":"typing"}' }, true, {
      roll: .75, packs: { ...packs, 'lingo_it.json': typingFixture }
    });
    app.get('answerAccuracy').oninput({ target: { value: String(accuracy) } });
    assert.equal(app.stored('lingo-settings').answerAccuracy, accuracy);
    assert.equal(app.get('accuracyValue').textContent, `${accuracy}%`);
    app.get('answerArea').children[0].value = input;
    app.get('answerArea').children[1].click();
    assert.equal(app.stored('lingo-unlocks-it').xp, correct ? 1 : 0);
    const restored = await launch(Object.fromEntries(app.storage));
    assert.equal(Number(restored.get('answerAccuracy').value), accuracy);
  }
  for (const invalid of [0, 101, 90.5, '90', null]) {
    const app = await launch({ 'lingo-settings': JSON.stringify({ answerAccuracy: invalid }) });
    assert.ok(app.errors.some(args => args[0].includes('Invalid answer accuracy')));
    assert.equal(app.stored('lingo-settings').answerAccuracy, 90);
    app.get('answerAccuracy').oninput({ target: { value: '101' } });
    assert.equal(app.stored('lingo-settings').answerAccuracy, 90);
    assert.equal(app.get('answerAccuracy').value, 90);
  }
});

const DAY = 86400000;
const reviewedWords = (category, now, level = 1) => Object.fromEntries(Object.keys(category.words).map(word => [
  `${category.name}:${word}`, { level, reviewed: new Date(now).toISOString(), correct: true }
]));

test('correct words stay on cooldown, and finishing all open words completes the day', async () => {
  const now = Date.now();
  const app = await launch({ 'lingo-settings': '{"mode":"choice"}' }, true, { now });
  const seen = new Set();
  const total = Object.keys(firstItalianCategory.words).length;
  for (let index = 0; index < total; index++) {
    const word = app.word();
    assert.ok(!seen.has(word.id));
    seen.add(word.id);
    app.answer(true);
    assert.equal(app.get('dueCount').textContent, `${total - index - 1} te oefenen`);
    app.get('nextArea').children[0].click();
  }
  assert.equal(app.get('prompt').textContent, 'Lekker bezig! Je bent klaar voor vandaag.');
  assert.equal(app.get('answerArea').children.length, 0);
  assert.equal(app.get('nextArea').children.length, 0);
  assert.equal(app.get('listenButton').disabled, true);
  assert.equal(app.get('progressBar').style.width, '100%');
  const restored = await launch(Object.fromEntries(app.storage), true, { now });
  assert.equal(restored.get('prompt').textContent, app.get('prompt').textContent);
  restored.now += DAY - 1;
  restored.get('questionMode').onchange({ target: { value: 'choice' } });
  assert.equal(restored.get('prompt').textContent, app.get('prompt').textContent);
  restored.now += 1;
  restored.get('questionMode').onchange({ target: { value: 'choice' } });
  assert.equal(restored.get('dueCount').textContent, `${total} te oefenen`);
  assert.equal(restored.get('answerArea').children.length, 4);
});

test('incorrect reviews remain open, even at a high review level', async () => {
  const now = Date.now();
  const progress = reviewedWords(firstItalianCategory, now);
  const wordId = Object.keys(progress)[0];
  progress[wordId] = { level: 8, reviewed: new Date(now - 121 * DAY).toISOString(), correct: true };
  const app = await launch({
    'lingo-settings': '{"mode":"choice"}', 'lingo-progress-it': JSON.stringify(progress)
  }, true, { now });
  assert.equal(app.word().id, wordId);
  app.answer(false);
  assert.equal(app.stored('lingo-progress-it')[wordId].level, 7);
  assert.equal(app.get('dueCount').textContent, '1 te oefenen');
  app.get('nextArea').children[0].click();
  assert.equal(app.word().id, wordId);
  app.answer(true);
  app.get('nextArea').children[0].click();
  assert.equal(app.get('prompt').textContent, 'Lekker bezig! Je bent klaar voor vandaag.');
});

test('unlocking another category resumes a completed day; reset also resumes practice', async () => {
  const now = Date.now();
  const app = await launch({
    'lingo-unlocks-it': '{"xp":50,"unlockedCategories":1}',
    'lingo-progress-it': JSON.stringify(reviewedWords(firstItalianCategory, now))
  }, true, { now });
  assert.equal(app.get('prompt').textContent, 'Lekker bezig! Je bent klaar voor vandaag.');
  app.get('categoryList').querySelector('button:not(:disabled)').click();
  assert.equal(app.get('category').textContent, italianCategories[1].name);
  assert.equal(app.get('dueCount').textContent, `${Object.keys(italianCategories[1].words).length} te oefenen`);
  app.get('resetButton').click();
  assert.equal(app.get('category').textContent, firstItalianCategory.name);
  assert.equal(app.get('dueCount').textContent, `${Object.keys(firstItalianCategory.words).length} te oefenen`);
});

test('renamed words retain cooldown and progress in each language', async () => {
  const now = Date.now();
  for (const [language, oldId, id] of [
    ['it', 'Begroetingen:stare*: Sto bene.', 'Begroetingen:Sto bene'],
    ['es', 'Begroetingen:por favor (para una solicitud)', 'Begroetingen:por favor'],
    ['da', 'Begroetingen:Jeg har det godt.', 'Begroetingen:Jeg har det godt']
  ]) {
    const category = packs[`lingo_${language}.json`].categories[0];
    const progress = reviewedWords(category, now);
    progress[oldId] = { ...progress[id], level: 4 };
    delete progress[id];
    const app = await launch({
      'lingo-language': language, [`lingo-progress-${language}`]: JSON.stringify(progress)
    }, true, { now });
    assert.equal(app.get('prompt').textContent, 'Lekker bezig! Je bent klaar voor vandaag.');
    const stored = app.stored(`lingo-progress-${language}`);
    assert.equal(stored[id].level, 4);
    assert.equal(Object.hasOwn(stored, oldId), false);
  }
});

test('merged word progress keeps the latest review, not the highest older level', async () => {
  const now = Date.now();
  for (const newerAlias of [true, false]) {
    const previous = { level: 8, reviewed: new Date(now - DAY).toISOString(), correct: true };
    const latest = { level: 2, reviewed: new Date(now).toISOString(), correct: false };
    const oldId = 'Plaats en richting:fronte: di fronte a', id = 'Plaats en richting:di fronte a';
    const app = await launch({ 'lingo-progress-it': JSON.stringify({
      [oldId]: newerAlias ? latest : previous, [id]: newerAlias ? previous : latest
    }) }, true, { now });
    assert.deepEqual(app.stored('lingo-progress-it')[id], latest);
    assert.equal(Object.hasOwn(app.stored('lingo-progress-it'), oldId), false);
  }
});
