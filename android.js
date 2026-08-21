// android.js - Dedicated Android Speech Recognition Logic
function handleAndroidRecognition(language, targetPhrase, callbacks) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = language;
  recognition.maxAlternatives = 1;

  let confirmedFinalText = "";
  let lastProcessedIndex = 0;

  recognition.onresult = event => {
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
      
      // Local normalize & count match for Android stream
      const chunkNormalized = String(newFinalText).toLowerCase().replace(/[।,.;:!?()[\]{}"'`]/g, " ").replace(/\s+/g, " ").trim();
      const targetNorm = String(targetPhrase).toLowerCase().replace(/[।,.;:!?()[\]{}"'`]/g, " ").replace(/\s+/g, " ").trim();
      
      if (chunkNormalized && targetNorm) {
        const pattern = targetNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\ +/g, "\\s+");
        const regex = new RegExp("(^|\\s)" + pattern + "(?=\\s|$)", "gi");
        const matches = chunkNormalized.match(regex);
        const added = matches ? matches.length : 0;

        if (added > 0 && callbacks.onMatch) {
          callbacks.onMatch(added);
        }
      }
    }

    const visibleText = (confirmedFinalText + " " + interimText).trim();
    if (visibleText && callbacks.onTranscript) {
      callbacks.onTranscript(visibleText);
    }
  };

  return recognition;
}
