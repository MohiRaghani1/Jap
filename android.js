// android.js
function handleAndroidRecognition(language, targetPhrase, callbacks) {
  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();

  // Android par continuous mode unreliable ho sakta hai,
  // isliye app.js onend par recognition restart karega.
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = language;
  recognition.maxAlternatives = 1;

  let finalText = "";
  let lastCountedFinalText = "";

  function normalize(text) {
    return String(text)
      .toLowerCase()
      .normalize("NFC")
      .replace(/[।,.;:!?()[\]{}"'`]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function countMatches(text, phrase) {
    const spoken = normalize(text);
    const target = normalize(phrase);

    if (!spoken || !target) return 0;

    const pattern = escapeRegExp(target)
      .replace(/\\ +/g, "\\s+");

    const regex = new RegExp(
      "(^|\\s)" + pattern + "(?=\\s|$)",
      "gi"
    );

    const matches = spoken.match(regex);

    return matches ? matches.length : 0;
  }

  function getOnlyNewText(currentText, previousText) {
    const current = normalize(currentText);
    const previous = normalize(previousText);

    if (!current) return "";
    if (!previous) return current;
    if (current === previous) return "";

    if (current.startsWith(previous)) {
      return current
        .slice(previous.length)
        .trim();
    }

    return current;
  }

  recognition.onresult = event => {
    let interimText = "";
    let latestFinalText = "";

    /*
      Android kabhi-kabhi resultIndex = 0 bhejkar
      poora current transcript dobara bhejta hai.
      Isliye sirf resultIndex par depend nahi karna.
    */
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0].transcript.trim();

      if (!text) continue;

      if (result.isFinal) {
        latestFinalText =
          (latestFinalText + " " + text).trim();
      } else {
        interimText =
          (interimText + " " + text).trim();
      }
    }

    if (latestFinalText) {
      const newFinalText = getOnlyNewText(
        latestFinalText,
        lastCountedFinalText
      );

      if (newFinalText) {
        const added = countMatches(
          newFinalText,
          targetPhrase
        );

        if (added > 0 && callbacks.onMatch) {
          callbacks.onMatch(added);
        }

        lastCountedFinalText =
          (
            lastCountedFinalText +
            " " +
            newFinalText
          ).trim();

        finalText =
          (
            finalText +
            " " +
            newFinalText
          ).trim();
      }
    }

    const visibleText =
      (
        finalText +
        " " +
        interimText
      ).trim();

    if (
      visibleText &&
      callbacks.onTranscript
    ) {
      callbacks.onTranscript(visibleText);
    }
  };

  return recognition;
}
