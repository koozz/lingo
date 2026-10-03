const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

const script = readFileSync(`${__dirname}/lingo.js`, 'utf8');
const config = JSON.parse(readFileSync(`${__dirname}/lingo.json`, 'utf8'));
const packs = Object.fromEntries(config.languages.map(language => [
  language.pack, JSON.parse(readFileSync(`${__dirname}/${language.pack}`, 'utf8'))
]));

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
  const verbs = packs['lingo_it.json'].categories[0];
  assert.equal(app.get('dueCount').textContent, `${Object.keys(verbs.words).length} te oefenen`);
  for (let index = 0; index < 20; index++) {
    assert.equal(app.get('category').textContent, verbs.name);
    assert.ok(app.get('answerArea').children.every(button => Object.values(verbs.words).includes(button.textContent)));
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

  const progress = Object.fromEntries(Object.keys(packs['lingo_it.json'].categories[0].words).map(foreign => [`verbs:${foreign}`, { level: 8 }]));
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
  const app = await launch({ 'lingo-unlocks-it': '{"xp":350,"unlockedCategories":1}' });
  assert.equal(app.stored('lingo-unlocks-it').unlockedCategories, 1);
  app.get('categoriesButton').click();
  assert.equal(app.get('categoriesDialog').open, true);
  const skipped = app.get('categoryList').children[2].children[1];
  assert.equal(skipped.disabled, true);
  skipped.onclick();
  assert.equal(app.stored('lingo-unlocks-it').unlockedCategories, 1);
  for (const cost of [100, 200, 300]) {
    const button = app.get('categoryList').querySelector('button:not(:disabled)');
    assert.equal(button.textContent, `${cost} XP · Ontgrendel`);
    button.click();
    assert.equal(app.stored('lingo-unlocks-it').xp, 350);
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
  assert.equal(restored.get('categoriesButton').textContent, 'Categorieën 4/25');
});

test('unlock thresholds include the exact boundary', async () => {
  for (const xp of [99, 100]) {
    const app = await launch({ 'lingo-unlocks-it': JSON.stringify({ xp, unlockedCategories: 1 }) });
    assert.equal(app.get('categoryList').children[1].children[1].disabled, xp < 100);
  }
  const app = await launch({ 'lingo-settings': '{"mode":"choice"}', 'lingo-unlocks-it': '{"xp":99,"unlockedCategories":1}' });
  app.answer(true);
  assert.equal(app.stored('lingo-unlocks-it').xp, 100);
  assert.equal(app.stored('lingo-unlocks-it').unlockedCategories, 1);
  assert.equal(app.get('categoryList').children[1].children[1].disabled, false);
  assert.match(app.get('categoriesButton').textContent, /Ontgrendel/);
});

test('progress stays separate per language; reset clears only the selected language', async () => {
  const app = await launch({
    'lingo-settings': '{"mode":"choice"}',
    'lingo-unlocks-it': '{"xp":200,"unlockedCategories":2}',
    'lingo-progress-it': '{"verbs:abbinare":{"level":4}}'
  });
  await app.get('languageSelect').onchange({ target: { value: 'es' } });
  assert.deepEqual(app.stored('lingo-unlocks-es'), { xp: 0, unlockedCategories: 1 });
  app.answer(true);
  await app.get('languageSelect').onchange({ target: { value: 'it' } });
  assert.equal(app.get('xp').textContent, '200 XP');
  assert.equal(app.stored('lingo-progress-it')['verbs:abbinare'].level, 4);
  app.get('resetButton').click();
  assert.deepEqual(app.stored('lingo-unlocks-it'), { xp: 0, unlockedCategories: 1 });
  assert.deepEqual(app.stored('lingo-progress-it'), {});
  assert.equal(app.stored('lingo-unlocks-es').xp, 1);
});

test('invalid saved XP is reported and cannot unlock categories', async () => {
  for (const stored of ['null', '{', '{"xp":-1,"unlockedCategories":1}', '{"xp":0,"unlockedCategories":3}', '{"xp":"200","unlockedCategories":2}']) {
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
