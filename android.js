// android.js
(function () {
  "use strict";

  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  let activeController = null;

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

  function countExactMatches(text, phrase) {
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

    return "";
  }

  function createVoiceRecognition(
    language,
    targetPhrase,
    callbacks = {}
  ) {
    if (!SpeechRecognition) {
      return null;
    }

    const isAndroid =
      /android/i.test(navigator.userAgent);

    if (activeController) {
      activeController.stop();
    }

    const controller = {
      recognition: null,
      manuallyStopped: false,
      restartTimer: null,
      finalText: "",
      countedText: "",
      lastRawFinalText: "",
      start: null,
      stop: null
    };

    activeController = controller;

    function processResult(event) {
      let latestFinalText = "";
      let interimText = "";

      for (
        let i = event.resultIndex;
        i < event.results.length;
        i++
      ) {
        const result = event.results[i];
        const alternative = result[0];

        if (!alternative) continue;

        const text =
          alternative.transcript.trim();

        if (!text) continue;

        /*
          Android ke kuch versions interim result ko
          isFinal=true ke saath bhejte hain, lekin confidence 0 hota hai.
          Aise result ko final count nahi karna.
        */
        const isRealFinal =
          result.isFinal &&
          (
            typeof alternative.confidence !== "number" ||
            alternative.confidence > 0
          );

        if (isRealFinal) {
          latestFinalText =
            (
              latestFinalText +
              " " +
              text
            ).trim();
        } else {
          interimText =
            (
              interimText +
              " " +
              text
            ).trim();
        }
      }

      if (latestFinalText) {
        const normalizedLatest =
          normalize(latestFinalText);

        /*
          Android same final transcript ko dobara bhej sakta hai.
          Sirf tab process hoga jab transcript genuinely extend ho.
        */
        const newText = getOnlyNewText(
          normalizedLatest,
          controller.countedText
        );

        if (newText) {
          const added = countExactMatches(
            newText,
            targetPhrase
          );

          if (
            added > 0 &&
            typeof callbacks.onMatch === "function"
          ) {
            callbacks.onMatch(added);
          }

          controller.countedText =
            (
              controller.countedText +
              " " +
              newText
            ).trim();

          controller.finalText =
            (
              controller.finalText +
              " " +
              newText
            ).trim();
        }

        controller.lastRawFinalText =
          normalizedLatest;
      }

      const visibleText =
        (
          controller.finalText +
          " " +
          interimText
        ).trim();

      if (
        visibleText &&
        typeof callbacks.onTranscript === "function"
      ) {
        callbacks.onTranscript(visibleText);
      }
    }

    function createRecognition() {
      const instance =
        new SpeechRecognition();

      /*
        Android par one-shot recognition.
        Restart module khud karega.
      */
      instance.continuous = !isAndroid;
      instance.interimResults = true;
      instance.lang = language;
      instance.maxAlternatives = 1;

      instance.onstart = () => {
        if (
          typeof callbacks.onStart === "function"
        ) {
          callbacks.onStart();
        }
      };

      instance.onresult = processResult;

      instance.onerror = event => {
        if (
          typeof callbacks.onError === "function"
        ) {
          callbacks.onError(event);
        }

        if (
          event.error === "not-allowed" ||
          event.error === "service-not-allowed"
        ) {
          controller.manuallyStopped = true;
        }
      };

      instance.onend = () => {
        if (
          typeof callbacks.onEnd === "function"
        ) {
          callbacks.onEnd();
        }

        if (
          isAndroid &&
          !controller.manuallyStopped
        ) {
          clearTimeout(
            controller.restartTimer
          );

          controller.restartTimer =
            setTimeout(() => {
              startRecognition();
            }, 500);
        }
      };

      return instance;
    }

    function startRecognition() {
      if (controller.manuallyStopped) {
        return;
      }

      if (!controller.recognition) {
        controller.recognition =
          createRecognition();
      }

      try {
        controller.recognition.start();
      } catch (error) {
        clearTimeout(
          controller.restartTimer
        );

        controller.restartTimer =
          setTimeout(() => {
            startRecognition();
          }, 700);
      }
    }

    controller.start = () => {
      controller.manuallyStopped = false;
      startRecognition();
    };

    controller.stop = () => {
      controller.manuallyStopped = true;

      clearTimeout(
        controller.restartTimer
      );

      const instance =
        controller.recognition;

      controller.recognition = null;

      if (instance) {
        try {
          instance.stop();
        } catch (error) {
          // Already stopped.
        }
      }

      if (activeController === controller) {
        activeController = null;
      }
    };

    return controller;
  }

  window.createVoiceRecognition =
    createVoiceRecognition;

  window.voiceRecognitionSupported =
    Boolean(SpeechRecognition);
})();
