"use strict";

const STORAGE_KEYS = {
  history: "japHistory",
  target: "japDailyTarget",
  language: "japLanguage",
  sound: "japSound",
  vibration: "japVibration",
  theme: "japTheme",
  reminderEnabled: "japReminderEnabled",
  reminderTime: "japReminderTime",
  reminderLastShown: "japReminderLastShown"
};

const MANUAL_COUNTER_URL =
  "https://mohiraghani1.github.io/Jap/Manual-Counter.html";

const mantraInput =
  document.getElementById("mantraInput");

const languageSelect =
  document.getElementById("languageSelect");

const countDisplay =
  document.getElementById("countDisplay");

const mantraPreview =
  document.getElementById("mantraPreview");

const speakInstruction =
  document.getElementById("speakInstruction");

const startBtn =
  document.getElementById("startBtn");

const stopBtn =
  document.getElementById("stopBtn");

const resetBtn =
  document.getElementById("resetBtn");

const statusText =
  document.getElementById("statusText");

const transcriptBox =
  document.getElementById("transcriptBox");

const supportText =
  document.getElementById("supportText");

const supportPill =
  document.getElementById("supportPill");

const themeToggle =
  document.getElementById("themeToggle");

const tapFallback =
  document.getElementById("tapFallback");

const tapFallbackMessage =
  document.getElementById("tapFallbackMessage");

const targetInput =
  document.getElementById("targetInput");

const saveTargetBtn =
  document.getElementById("saveTargetBtn");

const targetStatus =
  document.getElementById("targetStatus");

const streakValue =
  document.getElementById("streakValue");

const bestStreakNote =
  document.getElementById("bestStreakNote");

const todayValue =
  document.getElementById("todayValue");

const historyToggle =
  document.getElementById("historyToggle");

const historyContent =
  document.getElementById("historyContent");

const historyList =
  document.getElementById("historyList");

const weeklyReport =
  document.getElementById("weeklyReport");

const soundToggle =
  document.getElementById("soundToggle");

const vibrationToggle =
  document.getElementById("vibrationToggle");

const sessionTimer =
  document.getElementById("sessionTimer");

const sessionJap =
  document.getElementById("sessionJap");

const sessionSummaryCard =
  document.getElementById(
    "sessionSummaryCard"
  );

const reminderTime =
  document.getElementById("reminderTime");

const enableReminderBtn =
  document.getElementById(
    "enableReminderBtn"
  );

const disableReminderBtn =
  document.getElementById(
    "disableReminderBtn"
  );

const reminderStatus =
  document.getElementById(
    "reminderStatus"
  );

const installArea =
  document.getElementById("installArea");

const installBtn =
  document.getElementById("installBtn");

let recognition = null;
let listening = false;
let totalCount = 0;
let targetPhrase = "";
let recognitionSessionId = 0;
let sessionStartedAt = null;
let sessionCount = 0;
let sessionInterval = null;
let deferredInstallPrompt = null;
let audioContext = null;

function getTodayKey() {
  const date = new Date();

  return (
    date.getFullYear() +
    "-" +
    String(
      date.getMonth() + 1
    ).padStart(2, "0") +
    "-" +
    String(
      date.getDate()
    ).padStart(2, "0")
  );
}

function formatDate(dateKey) {
  const parts = dateKey.split("-");

  if (parts.length !== 3) {
    return dateKey;
  }

  return (
    parts[2] +
    "/" +
    parts[1] +
    "/" +
    parts[0]
  );
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[।,.;:!?()[\]{}"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readHistory() {
  try {
    const stored =
      localStorage.getItem(
        STORAGE_KEYS.history
      );

    const parsed = stored
      ? JSON.parse(stored)
      : {};

    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed;
    }

    return {};
  } catch (error) {
    return {};
  }
}

function saveHistory(history) {
  try {
    localStorage.setItem(
      STORAGE_KEYS.history,
      JSON.stringify(history)
    );
  } catch (error) {
    console.warn(
      "Unable to save jap history.",
      error
    );
  }
}

function getTodayCount() {
  const history = readHistory();

  return Number(
    history[getTodayKey()]
  ) || 0;
}

function addToToday(amount) {
  const history = readHistory();
  const today = getTodayKey();

  history[today] =
    (Number(history[today]) || 0) +
    amount;

  saveHistory(history);
}

function getSortedHistory() {
  return Object.entries(readHistory())
    .sort((a, b) =>
      b[0].localeCompare(a[0])
    )
    .slice(0, 14);
}

function calculateStreak() {
  const history = readHistory();
  const date = new Date();
  let streak = 0;

  while (true) {
    const key =
      date.getFullYear() +
      "-" +
      String(
        date.getMonth() + 1
      ).padStart(2, "0") +
      "-" +
      String(
        date.getDate()
      ).padStart(2, "0");

    if (Number(history[key]) > 0) {
      streak++;

      date.setDate(
        date.getDate() - 1
      );
    } else {
      break;
    }
  }

  return streak;
}

function calculateBestStreak() {
  const history = readHistory();

  const days = Object.keys(history)
    .filter(key =>
      Number(history[key]) > 0
    )
    .sort();

  let best = 0;
  let current = 0;
  let previousDate = null;

  days.forEach(key => {
    const currentDate =
      new Date(key + "T00:00:00");

    if (
      previousDate &&
      currentDate - previousDate ===
        86400000
    ) {
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

    date.setDate(
      today.getDate() - i
    );

    const key =
      date.getFullYear() +
      "-" +
      String(
        date.getMonth() + 1
      ).padStart(2, "0") +
      "-" +
      String(
        date.getDate()
      ).padStart(2, "0");

    const value =
      Number(history[key]) || 0;

    total += value;

    if (value > 0) {
      practiceDays++;
    }

    bestDay = Math.max(
      bestDay,
      value
    );
  }

  return {
    total,
    practiceDays,
    bestDay
  };
}

function updateDailyTools() {
  const today = getTodayCount();

  const target = Math.min(
    100000,
    Math.max(
      1,
      Number(targetInput.value) || 108
    )
  );

  todayValue.textContent =
    String(today);

  targetStatus.textContent =
    "Today: " +
    today +
    " / " +
    target;

  const streak =
    calculateStreak();

  const best =
    calculateBestStreak();

  streakValue.textContent =
    streak +
    (streak === 1 ? " day" : " days");

  bestStreakNote.textContent =
    "Your best: " +
    best +
    (best === 1 ? " day" : " days");
}

function renderHistory() {
  const items = getSortedHistory();

  historyList.innerHTML = "";

  if (items.length === 0) {
    const empty =
      document.createElement("li");

    empty.textContent =
      "No jap history yet.";

    historyList.appendChild(empty);
  } else {
    items.forEach(([date, value]) => {
      const item =
        document.createElement("li");

      const dateText =
        document.createElement("span");

      const countText =
        document.createElement("strong");

      dateText.textContent =
        formatDate(date);

      countText.textContent =
        String(Number(value) || 0);

      item.append(
        dateText,
        countText
      );

      historyList.appendChild(item);
    });
  }

  const week =
    getWeekData();

  weeklyReport.innerHTML =
    "<div class='report-row'>" +
    "<span>This week</span>" +
    "<strong>" +
    week.total +
    " jap</strong>" +
    "</div>" +
    "<div class='report-row'>" +
    "<span>Practice days</span>" +
    "<strong>" +
    week.practiceDays +
    " / 7</strong>" +
    "</div>" +
    "<div class='report-row'>" +
    "<span>Best day</span>" +
    "<strong>" +
    week.bestDay +
    " jap</strong>" +
    "</div>";
}

function showManualFallback(message) {
  if (!tapFallback) {
    return;
  }

  tapFallback.hidden = false;

  if (
    message &&
    tapFallbackMessage
  ) {
    tapFallbackMessage.textContent =
      message;
  }
}

function hideManualFallback() {
  if (!tapFallback) {
    return;
  }

  tapFallback.hidden = true;
}

function setStatus(
  message,
  type = ""
) {
  statusText.textContent = message;
  statusText.className =
    "status-message";

  if (type) {
    statusText.classList.add(type);
  }
}

function updatePhrase() {
  targetPhrase =
    normalize(mantraInput.value);

  const visiblePhrase =
    mantraInput.value.trim();

  if (targetPhrase) {
    mantraPreview.textContent =
      "Counting full phrase: “" +
      visiblePhrase +
      "”";

    speakInstruction.innerHTML =
      "<strong>Speak exactly:</strong> “" +
      visiblePhrase +
      "”";
  } else {
    mantraPreview.textContent =
      "Enter a phrase to begin.";

    speakInstruction.innerHTML =
      "<strong>Speak exactly:</strong> " +
      "Enter your phrase first.";
  }
}

function setListening(value) {
  listening = value;

  startBtn.disabled = value;
  stopBtn.disabled = !value;

  if (value) {
    startBtn.textContent =
      "● Listening...";

    supportText.textContent =
      "Microphone active";

    supportPill.classList.remove(
      "error"
    );

    startSessionTimer();
  } else {
    startBtn.textContent =
      "🎙 Start Listening";

    if (
      window.voiceRecognitionSupported
    ) {
      supportText.textContent =
        "Microphone ready";
    }

    stopSessionTimer();
  }
}

function formatTime(totalSeconds) {
  const minutes =
    Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, "0");

  const seconds =
    (totalSeconds % 60)
      .toString()
      .padStart(2, "0");

  return minutes + ":" + seconds;
}

function startSessionTimer() {
  if (!sessionStartedAt) {
    sessionStartedAt = Date.now();
  }

  clearInterval(sessionInterval);

  sessionInterval = setInterval(() => {
    const elapsed =
      Math.floor(
        (Date.now() - sessionStartedAt) /
          1000
      );

    sessionTimer.textContent =
      formatTime(elapsed);
  }, 1000);
}

function stopSessionTimer() {
  if (!sessionStartedAt) {
    return;
  }

  const elapsed =
    Math.floor(
      (Date.now() - sessionStartedAt) /
        1000
    );

  sessionTimer.textContent =
    formatTime(elapsed);

  clearInterval(sessionInterval);
  sessionInterval = null;

  sessionSummaryCard.hidden =
    false;

  sessionSummaryCard.innerHTML =
    "<strong>Session complete</strong>" +
    "<span>Jap counted: " +
    sessionCount +
    "</span>" +
    "<span>Time practiced: " +
    formatTime(elapsed) +
    "</span>";

  sessionStartedAt = null;
}

function resetSession() {
  sessionCount = 0;
  sessionStartedAt = null;

  clearInterval(sessionInterval);
  sessionInterval = null;

  sessionTimer.textContent =
    "00:00";

  sessionJap.textContent =
    "0 jap";

  sessionSummaryCard.hidden =
    true;
}

function playSoftSound() {
  if (
    !soundToggle ||
    !soundToggle.checked
  ) {
    return;
  }

  try {
    const AudioContext =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContext) {
      return;
    }

    audioContext =
      audioContext || new AudioContext();

    if (
      audioContext.state ===
      "suspended"
    ) {
      audioContext.resume();
    }

    const oscillator =
      audioContext.createOscillator();

    const gain =
      audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = 660;

    gain.gain.setValueAtTime(
      0.0001,
      audioContext.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.06,
      audioContext.currentTime + 0.01
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      audioContext.currentTime + 0.16
    );

    oscillator.connect(gain);
    gain.connect(
      audioContext.destination
    );

    oscillator.start();

    oscillator.stop(
      audioContext.currentTime + 0.17
    );
  } catch (error) {
    console.warn(
      "Sound feedback failed.",
      error
    );
  }
}

function playFeedback() {
  playSoftSound();

  if (
    vibrationToggle &&
    vibrationToggle.checked &&
    "vibrate" in navigator
  ) {
    navigator.vibrate(120);
  }
}

function registerCount(amount) {
  const safeAmount = Math.max(
    0,
    Number(amount) || 0
  );

  if (!safeAmount) {
    return;
  }

  totalCount += safeAmount;
  sessionCount += safeAmount;

  countDisplay.textContent =
    String(totalCount);

  sessionJap.textContent =
    sessionCount + " jap";

  addToToday(safeAmount);
  updateDailyTools();
  renderHistory();
  playFeedback();
}

function saveTarget() {
  const target = Math.min(
    100000,
    Math.max(
      1,
      Number(targetInput.value) || 108
    )
  );

  targetInput.value =
    String(target);

  localStorage.setItem(
    STORAGE_KEYS.target,
    String(target)
  );

  updateDailyTools();

  setStatus(
    "Daily target saved.",
    "success"
  );
}

function showUnsupported() {
  supportPill.classList.add(
    "error"
  );

  supportText.textContent =
    "Voice recognition unavailable";

  startBtn.disabled = true;

  showManualFallback(
    "Your browser does not support voice recognition. You can continue your practice with the manual counter."
  );

  setStatus(
    "Voice recognition unavailable. Manual counter is available below.",
    "error"
  );
}

function startVoiceRecognition() {
  updatePhrase();

  if (
    !window.voiceRecognitionSupported
  ) {
    showUnsupported();
    return;
  }

  if (!targetPhrase) {
    setStatus(
      "Enter your mantra or phrase first.",
      "error"
    );

    mantraInput.focus();
    return;
  }

  hideManualFallback();

  if (listening) {
    return;
  }

  const currentSession =
    ++recognitionSessionId;

  recognition =
    window.createVoiceRecognition(
      languageSelect.value,
      targetPhrase,
      {
        onStart: () => {
          if (
            currentSession !==
            recognitionSessionId
          ) {
            return;
          }

          hideManualFallback();
          setListening(true);

          setStatus(
            "Listening for: “" +
            mantraInput.value.trim() +
            "”"
          );
        },

        onMatch: amount => {
          if (
            currentSession !==
              recognitionSessionId ||
            !listening
          ) {
            return;
          }

          registerCount(amount);

          setStatus(
            "Phrase detected. +" +
            amount +
            " counted.",
            "success"
          );
        },

        onTranscript: text => {
          if (
            currentSession !==
            recognitionSessionId
          ) {
            return;
          }

          transcriptBox.textContent =
            text;
        },

        onError: event => {
          if (
            currentSession !==
            recognitionSessionId
          ) {
            return;
          }

          console.warn(
            "Voice recognition error:",
            event
          );

          setListening(false);

          const errorType =
            event.error || "unknown";

          if (
            errorType ===
              "not-allowed" ||
            errorType ===
              "service-not-allowed"
          ) {
            supportPill.classList.add(
              "error"
            );

            showManualFallback(
              "Microphone permission was not allowed. You can continue your practice with the manual counter."
            );

            setStatus(
              "Microphone permission was not allowed.",
              "error"
            );

            return;
          }

          if (
            errorType ===
            "no-speech"
          ) {
            showManualFallback(
              "No speech was detected. You can try voice again or continue with the manual counter."
            );

            setStatus(
              "No speech detected. Please try again.",
              "error"
            );

            return;
          }

          if (
            errorType ===
            "audio-capture"
          ) {
            showManualFallback(
              "No microphone was found or the microphone could not be accessed. Continue with the manual counter."
            );

            setStatus(
              "Microphone could not be accessed.",
              "error"
            );

            return;
          }

          if (
            errorType ===
            "network"
          ) {
            showManualFallback(
              "Voice recognition needs a working network connection. You can continue with the manual counter."
            );

            setStatus(
              "Voice recognition network error.",
              "error"
            );

            return;
          }

          showManualFallback(
            "Voice recognition stopped because of an error. You can continue with the manual counter."
          );

          setStatus(
            "Voice recognition error: " +
              errorType,
            "error"
          );
        },

        onEnd: () => {
          if (
            currentSession !==
            recognitionSessionId
          ) {
            return;
          }

          recognition = null;
          setListening(false);
        }
      }
    );

  if (!recognition) {
    showUnsupported();
    return;
  }

  try {
    recognition.start();
  } catch (error) {
    console.warn(
      "Recognition could not start.",
      error
    );

    recognition = null;
    setListening(false);

    showManualFallback(
      "Voice recognition could not start. You can continue your practice with the manual counter."
    );

    setStatus(
      "Voice recognition could not start.",
      "error"
    );
  }
}

function stopVoiceRecognition() {
  recognitionSessionId++;

  if (recognition) {
    try {
      recognition.stop();
    } catch (error) {
      console.warn(
        "Recognition stop failed.",
        error
      );
    }

    recognition = null;
  }

  setListening(false);
  setStatus("Listening stopped.");
}

function resetDailyCount() {
  recognitionSessionId++;

  if (recognition) {
    try {
      recognition.stop();
    } catch (error) {
      console.warn(
        "Recognition stop failed.",
        error
      );
    }

    recognition = null;
  }

  setListening(false);

  totalCount = 0;
  countDisplay.textContent =
    "0";

  const history =
    readHistory();

  history[getTodayKey()] = 0;
  saveHistory(history);

  updateDailyTools();
  renderHistory();
  resetSession();

  transcriptBox.innerHTML =
    "<span class='placeholder'>" +
    "Your latest recognized speech will appear here." +
    "</span>";

  setStatus("Count reset.");
}

async function enableReminder() {
  if (
    !("Notification" in window)
  ) {
    reminderStatus.textContent =
      "Notifications are not supported.";

    return;
  }

  try {
    const permission =
      await Notification.requestPermission();

    if (permission !== "granted") {
      reminderStatus.textContent =
        "Notification permission was not granted.";

      return;
    }

    localStorage.setItem(
      STORAGE_KEYS.reminderEnabled,
      "true"
    );

    localStorage.setItem(
      STORAGE_KEYS.reminderTime,
      reminderTime.value
    );

    reminderStatus.textContent =
      "Reminder enabled for " +
      reminderTime.value +
      ".";

    setStatus(
      "Daily reminder enabled.",
      "success"
    );
  } catch (error) {
    reminderStatus.textContent =
      "Reminder could not be enabled.";
  }
}

function disableReminder() {
  localStorage.setItem(
    STORAGE_KEYS.reminderEnabled,
    "false"
  );

  reminderStatus.textContent =
    "Reminder is off.";

  setStatus(
    "Reminder disabled."
  );
}

function loadReminderSettings() {
  const enabled =
    localStorage.getItem(
      STORAGE_KEYS.reminderEnabled
    ) === "true";

  const time =
    localStorage.getItem(
      STORAGE_KEYS.reminderTime
    ) || "06:00";

  reminderTime.value =
    time;

  reminderStatus.textContent =
    enabled
      ? "Reminder enabled for " +
        time +
        "."
      : "Reminder is off.";
}

async function showReminderIfDue() {
  const enabled =
    localStorage.getItem(
      STORAGE_KEYS.reminderEnabled
    ) === "true";

  if (!enabled) {
    return;
  }

  const savedTime =
    localStorage.getItem(
      STORAGE_KEYS.reminderTime
    ) || "06:00";

  const now = new Date();

  const currentTime =
    String(now.getHours()).padStart(
      2,
      "0"
    ) +
    ":" +
    String(
      now.getMinutes()
    ).padStart(2, "0");

  const today =
    getTodayKey();

  const lastShown =
    localStorage.getItem(
      STORAGE_KEYS.reminderLastShown
    );

  if (
    currentTime !== savedTime ||
    lastShown === today
  ) {
    return;
  }

  try {
    if (
      "serviceWorker" in navigator &&
      "Notification" in window &&
      Notification.permission ===
        "granted"
    ) {
      const registration =
        await navigator.serviceWorker.ready;

      await registration.showNotification(
        "Naam Jap Reminder",
        {
          body:
            "It is time for your Naam Jap practice.",
          icon: "./icon-192.svg",
          badge: "./icon-192.svg",
          tag: "naam-jap-reminder"
        }
      );
    } else if (
      "Notification" in window &&
      Notification.permission ===
        "granted"
    ) {
      new Notification(
        "Naam Jap Reminder",
        {
          body:
            "It is time for your Naam Jap practice."
        }
      );
    }

    localStorage.setItem(
      STORAGE_KEYS.reminderLastShown,
      today
    );
  } catch (error) {
    console.warn(
      "Reminder notification failed.",
      error
    );
  }
}

function loadTheme() {
  const dark =
    localStorage.getItem(
      STORAGE_KEYS.theme
    ) === "dark";

  document.body.classList.toggle(
    "dark",
    dark
  );

  themeToggle.textContent =
    dark
      ? "☀️ Light"
      : "🌙 Dark";
}

function toggleTheme() {
  const dark =
    document.body.classList.toggle(
      "dark"
    );

  localStorage.setItem(
    STORAGE_KEYS.theme,
    dark ? "dark" : "light"
  );

  themeToggle.textContent =
    dark
      ? "☀️ Light"
      : "🌙 Dark";
}

function loadSavedSettings() {
  const savedTarget =
    localStorage.getItem(
      STORAGE_KEYS.target
    );

  if (savedTarget) {
    targetInput.value =
      savedTarget;
  }

  const savedLanguage =
    localStorage.getItem(
      STORAGE_KEYS.language
    );

  if (savedLanguage) {
    languageSelect.value =
      savedLanguage;
  }

  soundToggle.checked =
    localStorage.getItem(
      STORAGE_KEYS.sound
    ) === "true";

  vibrationToggle.checked =
    localStorage.getItem(
      STORAGE_KEYS.vibration
    ) === "true";

  loadTheme();
  loadReminderSettings();
}

mantraInput.addEventListener(
  "input",
  updatePhrase
);

languageSelect.addEventListener(
  "change",
  () => {
    localStorage.setItem(
      STORAGE_KEYS.language,
      languageSelect.value
    );

    if (listening) {
      stopVoiceRecognition();
    }

    setStatus(
      "Recognition language updated."
    );
  }
);

startBtn.addEventListener(
  "click",
  startVoiceRecognition
);

stopBtn.addEventListener(
  "click",
  stopVoiceRecognition
);

resetBtn.addEventListener(
  "click",
  resetDailyCount
);

saveTargetBtn.addEventListener(
  "click",
  saveTarget
);

targetInput.addEventListener(
  "keydown",
  event => {
    if (event.key === "Enter") {
      saveTarget();
    }
  }
);

historyToggle.addEventListener(
  "click",
  () => {
    const shouldOpen =
      historyContent.hidden;

    historyContent.hidden =
      !shouldOpen;

    historyToggle.textContent =
      shouldOpen
        ? "Hide history"
        : "View history";

    historyToggle.setAttribute(
      "aria-expanded",
      String(shouldOpen)
    );

    if (shouldOpen) {
      renderHistory();
    }
  }
);

soundToggle.addEventListener(
  "change",
  () => {
    localStorage.setItem(
      STORAGE_KEYS.sound,
      String(soundToggle.checked)
    );
  }
);

vibrationToggle.addEventListener(
  "change",
  () => {
    localStorage.setItem(
      STORAGE_KEYS.vibration,
      String(
        vibrationToggle.checked
      )
    );
  }
);

enableReminderBtn.addEventListener(
  "click",
  enableReminder
);

disableReminderBtn.addEventListener(
  "click",
  disableReminder
);

reminderTime.addEventListener(
  "change",
  () => {
    localStorage.setItem(
      STORAGE_KEYS.reminderTime,
      reminderTime.value
    );

    const enabled =
      localStorage.getItem(
        STORAGE_KEYS.reminderEnabled
      ) === "true";

    if (enabled) {
      reminderStatus.textContent =
        "Reminder time updated to " +
        reminderTime.value +
        ".";
    }
  }
);

themeToggle.addEventListener(
  "click",
  toggleTheme
);

window.addEventListener(
  "storage",
  event => {
    if (
      event.key ===
      STORAGE_KEYS.history
    ) {
      totalCount =
        getTodayCount();

      countDisplay.textContent =
        String(totalCount);

      updateDailyTools();
      renderHistory();
    }

    if (
      event.key ===
      STORAGE_KEYS.theme
    ) {
      loadTheme();
    }
  }
);

window.addEventListener(
  "beforeinstallprompt",
  event => {
    event.preventDefault();

    deferredInstallPrompt =
      event;

    installArea.classList.add(
      "visible"
    );
  }
);

installBtn.addEventListener(
  "click",
  async () => {
    if (!deferredInstallPrompt) {
      setStatus(
        "Browser menu se Add to Home screen choose karo."
      );

      return;
    }

    deferredInstallPrompt.prompt();

    try {
      await deferredInstallPrompt.userChoice;
    } catch (error) {
      console.warn(
        "Install prompt closed.",
        error
      );
    }

    deferredInstallPrompt = null;

    installArea.classList.remove(
      "visible"
    );
  }
);

if (
  "serviceWorker" in navigator
) {
  window.addEventListener(
    "load",
    () => {
      navigator.serviceWorker
        .register("./sw.js")
        .catch(error => {
          console.warn(
            "Service worker registration failed.",
            error
          );
        });
    }
  );
}

totalCount =
  getTodayCount();

countDisplay.textContent =
  String(totalCount);

loadSavedSettings();
updatePhrase();
updateDailyTools();
renderHistory();

if (
  !window.voiceRecognitionSupported
) {
  showUnsupported();
} else {
  supportText.textContent =
    "Microphone ready";
}

setInterval(
  showReminderIfDue,
  30000
);

showReminderIfDue();
