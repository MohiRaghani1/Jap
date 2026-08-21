const SpeechRecognition =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

const STORAGE_KEYS = {
  total: "japCount",
  target: "japDailyTarget",
  history: "japHistory",
  sound: "japSound",
  vibration: "japVibration",
  language: "japLanguage",
  theme: "japTheme",
  reminderEnabled: "japReminderEnabled",
  reminderTime: "japReminderTime"
};

const mantraInput = document.getElementById("mantraInput");
const languageSelect = document.getElementById("languageSelect");
const countDisplay = document.getElementById("countDisplay");
const mantraPreview = document.getElementById("mantraPreview");
const speakInstruction = document.getElementById("speakInstruction");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const resetBtn = document.getElementById("resetBtn");
const statusText = document.getElementById("statusText");
const transcriptBox = document.getElementById("transcriptBox");
const supportText = document.getElementById("supportText");
const supportPill = document.getElementById("supportPill");
const themeToggle = document.getElementById("themeToggle");
const targetInput = document.getElementById("targetInput");
const saveTargetBtn = document.getElementById("saveTargetBtn");
const targetStatus = document.getElementById("targetStatus");
const streakValue = document.getElementById("streakValue");
const bestStreakNote = document.getElementById("bestStreakNote");
const todayValue = document.getElementById("todayValue");
const historyToggle = document.getElementById("historyToggle");
const historyContent = document.getElementById("historyContent");
const historyList = document.getElementById("historyList");
const weeklyReport = document.getElementById("weeklyReport");
const soundToggle = document.getElementById("soundToggle");
const vibrationToggle = document.getElementById("vibrationToggle");
const tapFallback = document.getElementById("tapFallback");
const tapBtn = document.getElementById("tapBtn");
const sessionTimer = document.getElementById("sessionTimer");
const sessionJap = document.getElementById("sessionJap");
const sessionSummaryCard = document.getElementById("sessionSummaryCard");
const reminderTime = document.getElementById("reminderTime");
const enableReminderBtn = document.getElementById("enableReminderBtn");
const disableReminderBtn = document.getElementById("disableReminderBtn");
const reminderStatus = document.getElementById("reminderStatus");
const installArea = document.getElementById("installArea");
const installBtn = document.getElementById("installBtn");

let recognition = null;
let listening = false;
let totalCount = 0;
let targetPhrase = "";
let sessionId = 0;
let audioContext = null;
let sessionStartedAt = null;
let sessionElapsedSeconds = 0;
let sessionCount = 0;
let sessionInterval = null;
let deferredInstallPrompt = null;

function getTodayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function formatDate(dateKey) {
  const parts = dateKey.split("-");
  if (parts.length !== 3) return dateKey;
  return parts[2] + "/" + parts[1] + "/" + parts[0];
}

function readHistory() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.history);
    const parsed = stored ? JSON.parse(stored) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function saveHistory(history) {
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
}

function getTodayCount() {
  const history = readHistory();
  return Number(history[getTodayKey()]) || 0;
}

function addToToday(amount) {
  const history = readHistory();
  const today = getTodayKey();
  history[today] = (Number(history[today]) || 0) + amount;
  saveHistory(history);
  return history[today];
}

function getSortedHistory() {
  return Object.entries(readHistory()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);
}

function calculateStreak() {
  const history = readHistory();
  let streak = 0;
  const date = new Date();
  while (true) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const key = year + "-" + month + "-" + day;
    if (Number(history[key]) > 0) {
      streak++;
      date.setDate(date.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function calculateBestStreak() {
  const history = readHistory();
  const days = Object.keys(history).filter(key => Number(history[key]) > 0).sort();
  let best = 0;
  let current = 0;
  let previousDate = null;
  days.forEach(key => {
    const currentDate = new Date(key + "T00:00:00");
    if (previousDate && currentDate - previousDate === 86400000) {
      current++;
    } else {
      current = 1;
    }
    best = Math.max(best, current);
    previousDate = currentDate;
  });
  return best;
}

function getWeekData() {
  const history = readHistory();
  const today = new Date();
  let total = 0;
  let practiceDays = 0;
  let bestDay = 0;
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const key = year + "-" + month + "-" + day;
    const count = Number(history[key]) || 0;
    total += count;
    if (count > 0) practiceDays++;
    bestDay = Math.max(bestDay, count);
  }
  return { total, practiceDays, bestDay };
}

function updateDailyTools() {
  const today = getTodayCount();
  const target = Math.max(1, Number(targetInput.value) || 108);
  todayValue.textContent = String(today);
  targetStatus.textContent = "Today: " + today + " / " + target;
  const streak = calculateStreak();
  const best = calculateBestStreak();
  streakValue.textContent = streak + (streak === 1 ? " day" : " days");
  bestStreakNote.textContent = "Your best: " + best + (best === 1 ? " day" : " days");
}

function renderHistory() {
  const items = getSortedHistory();
  historyList.innerHTML = "";
  if (items.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No jap history yet.";
    historyList.appendChild(empty);
  } else {
    items.forEach(([date, count]) => {
      const item = document.createElement("li");
      const dateText = document.createElement("span");
      const countText = document.createElement("strong");
      dateText.textContent = formatDate(date);
      countText.textContent = String(count);
      item.append(dateText, countText);
      historyList.appendChild(item);
    });
  }
  const week = getWeekData();
  weeklyReport.innerHTML =
    "<div class='report-row'><span>This week</span><strong>" + week.total + " jap</strong></div>" +
    "<div class='report-row'><span>Practice days</span><strong>" + week.practiceDays + " / 7</strong></div>" +
    "<div class='report-row'><span>Best day</span><strong>" + week.bestDay + " jap</strong></div>";
}

function registerCount(amount) {
  totalCount += amount;
  sessionCount += amount;
  countDisplay.textContent = String(totalCount);
  sessionJap.textContent = sessionCount + (sessionCount === 1 ? " jap" : " jap");
  localStorage.setItem(STORAGE_KEYS.total, String(totalCount));
  addToToday(amount);
  updateDailyTools();
  playFeedback();
}

function saveTarget() {
  const target = Math.max(1, Number(targetInput.value) || 108);
  targetInput.value = String(target);
  localStorage.setItem(STORAGE_KEYS.target, String(target));
  updateDailyTools();
  setStatus("Daily target saved.", "success");
}

function normalize(text) {
  return String(text).toLowerCase().replace(/[।,.;:!?()[\]{}"'`]/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countPhraseMatches(spokenText, phrase) {
  const spoken = normalize(spokenText);
  const target = normalize(phrase);
  if (!spoken || !target) return 0;
  const pattern = escapeRegExp(target).replace(/\\ +/g, "\\s+");
  const regex = new RegExp("(^|\\s)" + pattern + "(?=\\s|$)", "gi");
  const matches = spoken.match(regex);
  return matches ? matches.length : 0;
}

function updatePhrase() {
  targetPhrase = normalize(mantraInput.value);
  if (targetPhrase) {
    mantraPreview.textContent = 'Counting full phrase: “' + mantraInput.value.trim() + '”';
    speakInstruction.innerHTML = "<strong>Speak exactly:</strong> “" + mantraInput.value.trim() + "”";
  } else {
    mantraPreview.textContent = "Enter a phrase to begin.";
    speakInstruction.innerHTML = "<strong>Speak exactly:</strong> Enter your phrase first.";
  }
}

function setStatus(message, type = "") {
  statusText.textContent = message;
  statusText.className = "status-message";
  if (type) statusText.classList.add(type);
}

function setListening(value) {
  listening = value;
  startBtn.disabled = value;
  stopBtn.disabled = !value;
  if (value) {
    startBtn.textContent = "● Listening...";
    supportText.textContent = "Microphone active";
    startSessionTimer();
  } else {
    startBtn.textContent = "🎙 Start Listening";
    supportText.textContent = "Microphone ready";
    stopSessionTimer();
  }
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return minutes + ":" + seconds;
}

function startSessionTimer() {
  if (!sessionStartedAt) sessionStartedAt = Date.now();
  clearInterval(sessionInterval);
  sessionInterval = setInterval(() => {
    sessionElapsedSeconds = Math.floor((Date.now() - sessionStartedAt) / 1000);
    sessionTimer.textContent = formatTime(sessionElapsedSeconds);
  }, 1000);
}

function stopSessionTimer() {
  if (!sessionStartedAt) return;
  sessionElapsedSeconds = Math.floor((Date.now() - sessionStartedAt) / 1000);
  sessionTimer.textContent = formatTime(sessionElapsedSeconds);
  clearInterval(sessionInterval);
  sessionInterval = null;
  sessionSummaryCard.hidden = false;
  sessionSummaryCard.innerHTML =
    "<strong>Session complete</strong>" +
    "<span>Jap counted: " + sessionCount + "</span>" +
    "<span>Time practiced: " + formatTime(sessionElapsedSeconds) + "</span>";
  sessionStartedAt = null;
}

function resetSession() {
  sessionCount = 0;
  sessionElapsedSeconds = 0;
  sessionStartedAt = null;
  clearInterval(sessionInterval);
  sessionTimer.textContent = "00:00";
  sessionJap.textContent = "0 jap";
  sessionSummaryCard.hidden = true;
}

function playSoftSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    audioContext = audioContext || new AudioCtx();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, audioContext.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.16);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.17);
  } catch (error) {
    return;
  }
}

function playFeedback() {
  if (soundToggle.checked) playSoftSound();
  if (vibrationToggle.checked && "vibrate" in navigator) navigator.vibrate(120);
}

function showTapFallback(message) {
  tapFallback.classList.add("visible");
  if (message) setStatus(message, "error");
}

function showPlaceholder() {
  transcriptBox.innerHTML = '<span class="placeholder">Your latest recognized speech will appear here.</span>';
}

function showUnsupported() {
  supportPill.classList.add("error");
  supportText.textContent = "Speech recognition unavailable";
  showTapFallback("Voice recognition is unavailable.");
  startBtn.disabled = true;
}

function resetDailyCount() {
  totalCount = 0;
  countDisplay.textContent = "0";
  localStorage.removeItem(STORAGE_KEYS.total);
  const history = readHistory();
  history[getTodayKey()] = 0;
  saveHistory(history);
  updateDailyTools();
  showPlaceholder();
  resetSession();
  setStatus("Count reset.");
}

async function enableReminder() {
  if (!("Notification" in window)) {
    reminderStatus.textContent = "Notifications are not supported in this browser.";
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      reminderStatus.textContent = "Notification permission was not granted.";
      return;
    }
    localStorage.setItem(STORAGE_KEYS.reminderEnabled, "true");
    localStorage.setItem(STORAGE_KEYS.reminderTime, reminderTime.value);
    reminderStatus.textContent = "Reminder enabled for " + reminderTime.value + ".";
  } catch (error) {
    reminderStatus.textContent = "Reminder could not be enabled.";
  }
}

function disableReminder() {
  localStorage.setItem(STORAGE_KEYS.reminderEnabled, "false");
  reminderStatus.textContent = "Reminder is off.";
}

function getReminderState() {
  const enabled = localStorage.getItem(STORAGE_KEYS.reminderEnabled) === "true";
  const time = localStorage.getItem(STORAGE_KEYS.reminderTime) || "06:00";
  reminderTime.value = time;
  if (enabled) reminderStatus.textContent = "Reminder enabled for " + time + ".";
}

async function showReminderIfDue() {
  const enabled = localStorage.getItem(STORAGE_KEYS.reminderEnabled) === "true";
  if (!enabled) return;
  const savedTime = localStorage.getItem(STORAGE_KEYS.reminderTime) || reminderTime.value;
  const now = new Date();
  const currentTime = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  const today = getTodayKey();
  const lastShown = localStorage.getItem("japReminderLastShown");
  if (currentTime === savedTime && lastShown !== today) {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("Naam Jap Reminder", {
        body: "It is time for your Naam Jap practice.",
        icon: "./icon-192.svg",
        badge: "./icon-192.svg",
        tag: "naam-jap-reminder"
      });
    } else if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Naam Jap Reminder", { body: "It is time for your Naam Jap practice." });
    }
    localStorage.setItem("japReminderLastShown", today);
  }
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installArea.classList.add("visible");
});

installBtn.addEventListener("click", async () => {
  if (!deferredInstallPrompt) {
    setStatus("Use your browser menu and choose Add to Home screen.");
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installArea.classList.remove("visible");
});

mantraInput.addEventListener("input", updatePhrase);
languageSelect.addEventListener("change", () => {
  localStorage.setItem(STORAGE_KEYS.language, languageSelect.value);
});
saveTargetBtn.addEventListener("click", saveTarget);
targetInput.addEventListener("keydown", event => {
  if (event.key === "Enter") saveTarget();
});
historyToggle.addEventListener("click", () => {
  const isOpen = !historyContent.hidden;
  historyContent.hidden = isOpen;
  historyToggle.setAttribute("aria-expanded", String(!isOpen));
  historyToggle.textContent = isOpen ? "View history" : "Hide history";
  if (!isOpen) renderHistory();
});
soundToggle.addEventListener("change", () => {
  localStorage.setItem(STORAGE_KEYS.sound, String(soundToggle.checked));
});
vibrationToggle.addEventListener("change", () => {
  localStorage.setItem(STORAGE_KEYS.vibration, String(vibrationToggle.checked));
});
tapBtn.addEventListener("click", () => {
  registerCount(1);
  setStatus("Tap counted. +1", "success");
});
enableReminderBtn.addEventListener("click", enableReminder);
disableReminderBtn.addEventListener("click", disableReminder);
reminderTime.addEventListener("change", () => {
  localStorage.setItem(STORAGE_KEYS.reminderTime, reminderTime.value);
  const enabled = localStorage.getItem(STORAGE_KEYS.reminderEnabled) === "true";
  if (enabled) reminderStatus.textContent = "Reminder time updated to " + reminderTime.value + ".";
});

startBtn.addEventListener("click", () => {
  updatePhrase();
  tapFallback.classList.remove("visible");
  if (!targetPhrase) {
    setStatus("Enter your mantra or phrase first.", "error");
    mantraInput.focus();
    return;
  }
  if (listening) return;

  const currentSession = ++sessionId;
  let confirmedFinalText = "";
  let sessionMatchCount = 0;
  let lastProcessedIndex = 0;

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = languageSelect.value;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    if (currentSession !== sessionId) return;
    setListening(true);
    confirmedFinalText = "";
    sessionMatchCount = 0;
    lastProcessedIndex = 0;
    setStatus("Listening for: “" + mantraInput.value.trim() + "”");
  };

  recognition.onresult = event => {
    if (currentSession !== sessionId || !listening) return;

    let interimText = "";
    let newFinalText = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0].transcript.trim();
      if (result.isFinal) {
        if (i >= lastProcessedIndex) {
          newFinalText += " " + text;
          lastProcessedIndex = i + 1;
        }
      } else {
        interimText += " " + text;
      }
    }

    if (newFinalText.trim()) {
      confirmedFinalText += " " + newFinalText.trim();
      const chunkNormalized = normalize(newFinalText);
      const added = countPhraseMatches(chunkNormalized, targetPhrase);

      if (added > 0) {
        registerCount(added);
        setStatus("Phrase detected. +" + added + " counted.", "success");
      }
    }

    const visibleText = (confirmedFinalText + " " + interimText).trim();
    if (visibleText) {
      transcriptBox.textContent = visibleText;
    }
  };

  recognition.onerror = event => {
    if (currentSession !== sessionId) return;
    if (event.error === "not-allowed") {
      showTapFallback("Microphone permission was not allowed.");
    } else if (event.error === "no-speech") {
      setStatus("No speech detected. Please try again.", "error");
    } else {
      showTapFallback("Voice recognition stopped. You can use tap counting.");
    }
  };

  recognition.onend = () => {
    if (currentSession !== sessionId) return;
    if (listening) {
      try {
        recognition.start();
      } catch (error) {
        setListening(false);
      }
    } else {
      setListening(false);
    }
  };

  try {
    recognition.start();
  } catch (error) {
    showTapFallback("Recognition could not be started.");
  }
});

stopBtn.addEventListener("click", () => {
  if (!recognition || !listening) return;
  sessionId++;
  listening = false;
  const activeRecognition = recognition;
  recognition = null;
  setListening(false);
  setStatus("Listening stopped.");
  try {
    activeRecognition.stop();
  } catch (error) {
    return;
  }
});

resetBtn.addEventListener("click", resetDailyCount);

if (!SpeechRecognition) {
  showUnsupported();
}

const savedCount = localStorage.getItem(STORAGE_KEYS.total);
if (savedCount !== null) {
  totalCount = parseInt(savedCount, 10) || 0;
  countDisplay.textContent = String(totalCount);
}

const savedTarget = localStorage.getItem(STORAGE_KEYS.target);
if (savedTarget) targetInput.value = savedTarget;

const savedLanguage = localStorage.getItem(STORAGE_KEYS.language);
if (savedLanguage) languageSelect.value = savedLanguage;

soundToggle.checked = localStorage.getItem(STORAGE_KEYS.sound) === "true";
vibrationToggle.checked = localStorage.getItem(STORAGE_KEYS.vibration) === "true";

if (localStorage.getItem(STORAGE_KEYS.theme) === "dark") {
  document.body.classList.add("dark");
  themeToggle.textContent = "☀️ Light";
}

themeToggle.addEventListener("click", () => {
  const dark = document.body.classList.toggle("dark");
  localStorage.setItem(STORAGE_KEYS.theme, dark ? "dark" : "light");
  themeToggle.textContent = dark ? "☀️ Light" : "🌙 Dark";
});

updatePhrase();
updateDailyTools();
getReminderState();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js");
  });
}

setInterval(showReminderIfDue, 30000);
showReminderIfDue();
