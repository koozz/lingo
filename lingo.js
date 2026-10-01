(() => {
  'use strict';
  const DAY = 86400000;
  const KEYS = { language: 'lingo-language', progress: 'lingo-progress', settings: 'lingo-settings', streak: 'lingo-streak' };
  const defaults = { mode: 'mixed', typingProbability: 30, frequencyLevel: 0 };
  const $ = id => document.getElementById(id);
  const ui = { prompt: $('prompt'), answers: $('answerArea'), next: $('nextArea'), feedback: $('feedback'), category: $('category'), due: $('dueCount'), progress: $('progressBar'), streak: $('streak'), listen: $('listenButton') };
  let config, language, words = [], progress = {}, settings = { ...defaults }, current, answered = false;

  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; } };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const progressKey = () => `${KEYS.progress}-${language.id}`;
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
      const same = words.filter(item => item.category === current.word.category && item.id !== current.word.id);
      const other = words.filter(item => item.category !== current.word.category && item.id !== current.word.id);
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
    if (answered) { next(); return; } answered = true;
    const record = progress[current.word.id] || { level: 0 };
    record.level = correct ? Math.min(9, Number(record.level) + 1) : Math.max(0, Number(record.level) - 1); record.reviewed = new Date().toISOString(); progress[current.word.id] = record; save(progressKey(), progress);
    ui.feedback.textContent = correct ? `Goed! Volgende herhaling over ${daysForLevel(record.level)} dag${daysForLevel(record.level) === 1 ? '' : 'en'}.` : `Nog niet. Het juiste antwoord is: ${answerText(current)}.`;
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
    const dueWords = words.filter(due); current = { word: choose(dueWords.length ? dueWords : words), direction: Math.random() < .5 ? 'toDutch' : 'fromDutch' }; answered = false;
    ui.category.textContent = current.word.category;
    ui.prompt.replaceChildren(document.createTextNode('Vertaal: '), Object.assign(document.createElement('em'), { textContent: current.direction === 'toDutch' ? current.word.foreign : current.word.dutch }));
    ui.feedback.textContent = ''; ui.feedback.className = 'feedback'; ui.listen.disabled = current.direction !== 'toDutch' || !('speechSynthesis' in window); ui.next.replaceChildren();
    current.mode = chooseMode();
    renderInput(current.mode); updateMeta();
    if (current.direction === 'toDutch') speak();
  }
  function updateMeta() {
    const dueWords = words.filter(due).length; ui.due.textContent = `${dueWords} te oefenen`; ui.progress.style.width = `${Math.round((words.length - dueWords) / Math.max(1, words.length) * 100)}%`;
  }
  async function loadPack() {
    const response = await fetch(language.pack, { cache: 'no-store' }); if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json(); words = data.categories.flatMap(category => Object.entries(category.words).map(([foreign, dutch]) => ({ id: `${category.name}:${foreign}`, category: category.name, foreign, dutch })));
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
  $('languageSelect').onchange = async event => { language = config.languages.find(item => item.id === event.target.value); localStorage.setItem(KEYS.language, language.id); progress = read(progressKey(), {}); await loadPack(); };
  $('questionMode').onchange = event => { settings.mode = event.target.value; save(KEYS.settings, settings); makeQuestion(); };
  $('typingProbability').oninput = event => { settings.typingProbability = Number(event.target.value); $('typingValue').textContent = `${settings.typingProbability}%`; save(KEYS.settings, settings); };
  $('resetButton').onclick = () => { if (confirm('Alle voortgang wissen?')) { progress = {}; save(progressKey(), progress); makeQuestion(); } };
  ui.listen.onclick = speak;
  $('streak').textContent = `${read(KEYS.streak, 0)} day streak`;
  start().catch(error => { ui.prompt.textContent = 'Kan de taal niet laden.'; ui.feedback.textContent = error.message; ui.feedback.className = 'feedback bad'; });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
