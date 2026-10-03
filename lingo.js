(() => {
  'use strict';
  const DAY = 86400000;
  const KEYS = { language: 'lingo-language', progress: 'lingo-progress', settings: 'lingo-settings', streak: 'lingo-streak', unlocks: 'lingo-unlocks' };
  const defaults = { mode: 'mixed', typingProbability: 30, frequencyLevel: 0 };
  const $ = id => document.getElementById(id);
  const ui = { prompt: $('prompt'), answers: $('answerArea'), next: $('nextArea'), feedback: $('feedback'), category: $('category'), due: $('dueCount'), progress: $('progressBar'), streak: $('streak'), listen: $('listenButton') };
  let config, language, words = [], categories = [], progress = {}, unlocks = { xp: 0, unlockedCategories: 1 }, settings = { ...defaults }, current, answered = false;

  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (error) { console.error(`Cannot read ${key}`, error); return fallback; } };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const progressKey = () => `${KEYS.progress}-${language.id}`;
  const unlocksKey = () => `${KEYS.unlocks}-${language.id}`;
  const availableWords = () => words.filter(word => categories.indexOf(word.category) < unlocks.unlockedCategories);
  const categoryCost = index =>
    Math.min(index, 5) * 50 +
    Math.min(Math.max(index - 5, 0), 10) * 75 +
    Math.max(index - 15, 0) * 100;
  const choose = list => list[Math.floor(Math.random() * list.length)];
  const shuffle = list => list.sort(() => Math.random() - .5);
  const normalize = text => text.toLowerCase().replace(/[.,!?;:()[\]{}'"“”'’]/g, '').replace(/\s+/g, ' ').trim();
  const daysForLevel = level => Math.min(365, [0, 1, 2, 4, 7, 14, 30, 60, 120, 240][Math.min(9, Math.max(0, level))]);
  const due = word => !progress[word.id]?.reviewed || Date.now() >= Date.parse(progress[word.id].reviewed) + daysForLevel(progress[word.id].level) * DAY;
  const answerText = item => current.direction === 'toDutch' ? item.word.dutch : item.word.foreign;
  const spoken = word => {
    const text = word.foreign.includes(':') ? word.foreign.split(':').pop() : word.foreign;
    return text.split('/')[0].replace(/\s*\[\d+\]\s*$/, '').trim();
  };

  function voice() {
    if (!('speechSynthesis' in window)) return null;
    const voices = speechSynthesis.getVoices();
    return voices.find(item => item.lang.toLowerCase() === language.speech.toLowerCase()) || voices.find(item => item.lang.toLowerCase().startsWith(language.speech.slice(0, 2))) || null;
  }
  function speak() {
    if (!current || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spoken(current.word));
    utterance.lang = language.speech; utterance.voice = voice(); speechSynthesis.speak(utterance);
  }
  function chooseMode() {
    if (settings.mode !== 'mixed') return settings.mode;
    const roll = Math.random() * 100;
    if (roll < Number(settings.typingProbability)) return 'typing';
    return 'choice';
  }
  function renderInput(mode) {
    if (mode === 'choice') {
      const available = availableWords();
      const same = available.filter(item => item.category === current.word.category && item.id !== current.word.id);
      const other = available.filter(item => item.category !== current.word.category && item.id !== current.word.id);
      const usedAnswers = new Set([answerText(current)]);
      const wrong = [...shuffle(same), ...shuffle(other)].filter(item => {
        const text = answerText({ word: item });
        if (usedAnswers.has(text)) return false;
        usedAnswers.add(text);
        return true;
      }).slice(0, 3);
      ui.answers.className = 'answers';
      ui.answers.replaceChildren(...shuffle([current.word, ...wrong]).map(item => {
        const button = document.createElement('button'); button.className = 'answer-button'; button.type = 'button'; button.textContent = current.direction === 'toDutch' ? item.dutch : item.foreign;
        button.onclick = () => check(item === current.word, button); return button;
      }));
    } else {
      ui.answers.className = 'answer-form';
      const input = document.createElement('input'); input.className = 'answer-input'; input.placeholder = 'Typ je antwoord…'; input.autocomplete = 'off';
      const button = document.createElement('button'); button.className = 'submit'; button.type = 'button'; button.textContent = 'Controleer';
      button.onclick = () => check(normalize(input.value) === normalize(answerText(current)), button);
      input.onkeydown = event => { if (event.key === 'Enter') button.click(); };
      ui.answers.replaceChildren(input, button); setTimeout(() => input.focus(), 0);
    }
  }
  function check(correct, control) {
    if (answered || !current) return;
    answered = true;
    const record = progress[current.word.id] || { level: 0 };
    record.level = correct ? Math.min(9, Number(record.level) + 1) : Math.max(0, Number(record.level) - 1); record.reviewed = new Date().toISOString(); progress[current.word.id] = record; save(progressKey(), progress);
    if (correct) { unlocks.xp += record.level; save(unlocksKey(), unlocks); }
    ui.feedback.textContent = correct ? `Goed! +${record.level} XP. Volgende herhaling over ${daysForLevel(record.level)} dag${daysForLevel(record.level) === 1 ? '' : 'en'}.` : `Nog niet. Het juiste antwoord is: ${answerText(current)}.`;
    ui.feedback.className = `feedback ${correct ? 'good' : 'bad'}`; control.classList.add(correct ? 'correct' : 'wrong');
    const correctButton = [...ui.answers.querySelectorAll('button')].find(button => button.textContent === answerText(current));
    if (correctButton) correctButton.classList.add('correct');
    ui.answers.querySelectorAll('button, input').forEach(item => { item.disabled = true; });
    const nextButton = document.createElement('button');
    nextButton.className = 'submit'; nextButton.type = 'button'; nextButton.textContent = 'Verder >>'; nextButton.onclick = next;
    ui.next.replaceChildren(nextButton);
    ui.listen.disabled = !('speechSynthesis' in window);
    if (current.direction === 'fromDutch') speak();
    updateMeta();
  }
  function next() { makeQuestion(); }
  function makeQuestion() {
    const available = availableWords();
    if (!available.length) return;
    const dueWords = available.filter(due); current = { word: choose(dueWords.length ? dueWords : available), direction: Math.random() < .5 ? 'toDutch' : 'fromDutch' }; answered = false;
    ui.category.textContent = current.word.category;
    ui.prompt.replaceChildren(document.createTextNode('Vertaal: '), Object.assign(document.createElement('em'), { textContent: current.direction === 'toDutch' ? current.word.foreign : current.word.dutch }));
    ui.feedback.textContent = ''; ui.feedback.className = 'feedback'; ui.listen.disabled = current.direction !== 'toDutch' || !('speechSynthesis' in window); ui.next.replaceChildren();
    current.mode = chooseMode();
    renderInput(current.mode); updateMeta();
    if (current.direction === 'toDutch') speak();
  }
  function updateMeta() {
    const available = availableWords();
    const dueWords = available.filter(due).length; ui.due.textContent = `${dueWords} te oefenen`; ui.progress.style.width = `${Math.round((available.length - dueWords) / Math.max(1, available.length) * 100)}%`;
    $('xp').textContent = `${unlocks.xp} XP`;
    const eligible = unlocks.unlockedCategories < categories.length && unlocks.xp >= categoryCost(unlocks.unlockedCategories);
    $('categoriesButton').textContent = `Categorieën ${unlocks.unlockedCategories}/${categories.length}${eligible ? ' · Ontgrendel' : ''}`;
    $('categoriesButton').classList.toggle('eligible', eligible);
    renderCategories();
  }
  function renderCategories() {
    $('categoryList').replaceChildren(...categories.map((name, index) => {
      const row = document.createElement('div'); row.className = 'category-row';
      const label = document.createElement('span'); label.textContent = name;
      if (index < unlocks.unlockedCategories) {
        const status = document.createElement('span'); status.className = 'unlocked'; status.textContent = 'Ontgrendeld';
        row.append(label, status);
      } else {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'unlock-button';
        const cost = categoryCost(index);
        button.textContent = `${cost} XP · Ontgrendel`;
        button.disabled = index !== unlocks.unlockedCategories || unlocks.xp < cost;
        const hint = document.createElement('small');
        hint.textContent = index !== unlocks.unlockedCategories ? `Eerst ${categories[index - 1]} ontgrendelen${unlocks.xp >= cost ? ' · Voldoende XP' : ''}` : unlocks.xp < cost ? `Nog ${cost - unlocks.xp} XP nodig` : 'Klaar om te ontgrendelen';
        label.append(document.createElement('br'), hint);
        button.onclick = () => {
          if (index !== unlocks.unlockedCategories || unlocks.xp < cost) return;
          unlocks.unlockedCategories += 1;
          save(unlocksKey(), unlocks);
          updateMeta();
          $('categoryList').querySelector('button:not(:disabled)')?.focus();
        };
        row.append(label, button);
      }
      return row;
    }));
  }
  async function loadPack() {
    const loadingLanguage = language;
    current = null; answered = true; words = []; categories = [];
    ui.answers.replaceChildren(); ui.next.replaceChildren(); ui.listen.disabled = true;
    ui.prompt.textContent = 'Woorden laden…'; ui.feedback.textContent = ''; $('categoriesButton').disabled = true;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    const response = await fetch(loadingLanguage.pack, { cache: 'no-store' }); if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (language !== loadingLanguage) return;
    if (!Array.isArray(data.categories) || !data.categories.length || data.categories.some(category => !Object.keys(category.words).length)) throw new Error('Het taalbestand bevat geen woorden.');
    categories = data.categories.map(category => category.name);
    words = data.categories.flatMap(category => Object.entries(category.words).map(([foreign, dutch]) => ({ id: `${category.name}:${foreign}`, category: category.name, foreign, dutch })));
    const stored = read(unlocksKey(), { xp: 0, unlockedCategories: 1 });
    if (!stored || !Number.isSafeInteger(stored.xp) || stored.xp < 0 || !Number.isSafeInteger(stored.unlockedCategories) || stored.unlockedCategories < 1 || stored.xp < categoryCost(stored.unlockedCategories - 1)) {
      console.error(`Invalid category progress in ${unlocksKey()}`);
      unlocks = { xp: 0, unlockedCategories: 1 };
    } else {
      unlocks = { xp: stored.xp, unlockedCategories: Math.min(categories.length, stored.unlockedCategories) };
    }
    save(unlocksKey(), unlocks); $('categoriesButton').disabled = false;
    $('languageLabel').textContent = language.nativeName; makeQuestion();
  }
  function applySettings() {
    $('questionMode').value = settings.mode; $('typingProbability').value = settings.typingProbability; $('typingValue').textContent = `${settings.typingProbability}%`;
  }
  async function start() {
    config = await (await fetch('lingo.json', { cache: 'no-store' })).json(); language = config.languages.find(item => item.id === localStorage.getItem(KEYS.language)) || config.languages[0];
    progress = read(progressKey(), {}); settings = { ...defaults, ...read(KEYS.settings, {}) }; $('languageSelect').replaceChildren(...config.languages.map(item => new Option(`${item.nativeName} · ${item.name}`, item.id))); $('languageSelect').value = language.id; applySettings(); await loadPack();
  }
  $('settingsButton').onclick = () => { const open = $('settings').hidden; $('settings').hidden = !open; $('settingsButton').setAttribute('aria-expanded', open); };
  const showError = error => { ui.prompt.textContent = 'Kan de taal niet laden.'; ui.feedback.textContent = error.message; ui.feedback.className = 'feedback bad'; };
  $('languageSelect').onchange = async event => { language = config.languages.find(item => item.id === event.target.value); localStorage.setItem(KEYS.language, language.id); progress = read(progressKey(), {}); try { await loadPack(); } catch (error) { showError(error); } };
  $('questionMode').onchange = event => { settings.mode = event.target.value; save(KEYS.settings, settings); makeQuestion(); };
  $('typingProbability').oninput = event => { settings.typingProbability = Number(event.target.value); $('typingValue').textContent = `${settings.typingProbability}%`; save(KEYS.settings, settings); };
  $('resetButton').onclick = () => { if (confirm('Alle voortgang voor deze taal wissen, inclusief XP en categorieën?')) { progress = {}; unlocks = { xp: 0, unlockedCategories: 1 }; save(progressKey(), progress); save(unlocksKey(), unlocks); makeQuestion(); } };
  $('categoriesButton').onclick = () => $('categoriesDialog').showModal();
  $('closeCategories').onclick = () => $('categoriesDialog').close();
  ui.listen.onclick = speak;
  $('streak').textContent = `${read(KEYS.streak, 0)} day streak`;
  start().catch(showError);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
