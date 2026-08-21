// android.js
function handleAndroidRecognition(language, targetPhrase, callbacks) {
  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();

  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = language;
  recognition.maxAlternatives = 1;

  let confirmedFinalText = "";
  let processedFinalTexts = new Set();

  function normalizeLocal(text) {
    return String(text)
      .toLowerCase()
      .replace(/[।,.;:!?()[\]{}"'`]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeLocal(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function countMatches(spokenText, phrase) {
    const spoken = normalizeLocal(spokenText);
    const target = normalizeLocal(phrase);

    if (!spoken || !target) return 0;

    const pattern = escapeLocal(target).replace(/\\ +/g, "\\s+");

    const regex = new RegExp(
      "(^|\\s)" + pattern + "(?=\\s|$)",
      "gi"
    );

    const matches = spoken.match(regex);
    return matches ? matches.length : 0;
  }

  recognition.onresult = event => {
    let interimText = "";
    const newFinalParts = [];

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0].transcript.trim();

      if (!text) continue;

      if (result.isFinal) {
        const normalizedText = normalizeLocal(text);
        const resultKey = i + "|" + normalizedText;

        if (!processedFinalTexts.has(resultKey)) {
          processedFinalTexts.add(resultKey);
          newFinalParts.push(text);
        }
      } else {
        interimText += " " + text;
      }
    }

    if (newFinalParts.length > 0) {
      const newFinalText = newFinalParts.join(" ");

      confirmedFinalText =
        (confirmedFinalText + " " + newFinalText).trim();

      const added = countMatches(newFinalText, targetPhrase);

      if (added > 0 && callbacks.onMatch) {
        callbacks.onMatch(added);
      }
    }

    const visibleText =
      (confirmedFinalText + " " + interimText).trim();

    if (visibleText && callbacks.onTranscript) {
      callbacks.onTranscript(visibleText);
    }
  };

  return recognition;
}
