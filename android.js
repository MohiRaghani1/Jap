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
    return text.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
  }

  function isSingleWord(phrase) {
    return normalize(phrase)
      .split(/\s+/)
      .filter(Boolean)
      .length === 1;
  }

  function countMultiWordMatches(
    spokenText,
    targetPhrase
  ) {
    const spoken = normalize(spokenText);
    const target = normalize(targetPhrase);

    if (!spoken || !target) {
      return 0;
    }

    const pattern = escapeRegExp(target)
      .replace(/\\ +/g, "\\s+");

    const regex = new RegExp(
      "(^|\\s)" +
      pattern +
      "(?=\\s|$)",
      "gi"
    );

    const matches = spoken.match(regex);

    return matches ? matches.length : 0;
  }

  function isExactSingleWord(
    spokenText,
    targetPhrase
  ) {
    const spoken = normalize(spokenText);
    const target = normalize(targetPhrase);

    return (
      spoken === target ||
      spoken.split(/\s+/).includes(target)
    );
  }

  function createVoiceRecognition(
    language,
    targetPhrase,
    callbacks = {}
  ) {
    if (!SpeechRecognition) {
      return null;
    }

    if (activeController) {
      activeController.stop();
    }

    const phrase = normalize(targetPhrase);
    const singleWordMode = isSingleWord(phrase);

    const controller = {
      recognition: null,
      manuallyStopped: false,
      restartTimer: null,
      finalTranscript: "",
      lastProcessedTranscript: "",
      singleWordDetectedInCycle: false,
      start: null,
      stop: null
    };

    activeController = controller;

    function emitMatch(amount) {
      if (
        amount > 0 &&
        typeof callbacks.onMatch === "function"
      ) {
        callbacks.onMatch(amount);
      }
    }

    function processSingleWordResult(text) {
      const normalizedText = normalize(text);

      if (!normalizedText) {
        return;
      }

      /*
        Ek Android recognition cycle me same single word
        ko sirf ek baar count karo.
      */
      if (
        controller.singleWordDetectedInCycle
      ) {
        return;
      }

      if (
        isExactSingleWord(
          normalizedText,
          phrase
        )
      ) {
        controller.singleWordDetectedInCycle =
          true;

        emitMatch(1);
      }
    }

    function processMultiWordResult(text) {
      const normalizedText = normalize(text);

      if (!normalizedText) {
        return;
      }

      if (
        normalizedText ===
        controller.lastProcessedTranscript
      ) {
        return;
      }

      let newText = normalizedText;

      if (
        controller.lastProcessedTranscript &&
        normalizedText.startsWith(
          controller.lastProcessedTranscript
        )
      ) {
        newText = normalizedText
          .slice(
            controller.lastProcessedTranscript.length
          )
          .trim();
      }

      if (!newText) {
        return;
      }

      const added =
        countMultiWordMatches(
          newText,
          phrase
        );

      emitMatch(added);

      controller.lastProcessedTranscript =
        normalizedText;

      controller.finalTranscript =
        (
          controller.finalTranscript +
          " " +
          newText
        ).trim();
    }

    function processResult(event) {
      let currentFinalText = "";
      let currentInterimText = "";

      for (
        let i = event.resultIndex;
        i < event.results.length;
        i++
      ) {
        const result = event.results[i];
        const alternative = result[0];

        if (!alternative) {
          continue;
        }

        const text =
          alternative.transcript.trim();

        if (!text) {
          continue;
        }

        const confidence =
          alternative.confidence;

        /*
          Single-word ke case me confidence 0 ko reject
          nahi karna, kyunki Android usse interim/final
          dono tarah bhej sakta hai.
        */
        const usableText =
          result.isFinal ||
          (
            singleWordMode &&
            (
              typeof confidence !== "number" ||
              confidence >= 0
            )
          );

        if (!usableText) {
          continue;
        }

        if (result.isFinal) {
          currentFinalText =
            (
              currentFinalText +
              " " +
              text
            ).trim();
        } else {
          currentInterimText =
            (
              currentInterimText +
              " " +
              text
            ).trim();
        }
      }

      if (singleWordMode) {
        /*
          Single word ke liye latest final/interim text dono
          ko check karte hain, lekin cycle me count maximum 1.
        */
        const candidate =
          currentFinalText ||
          currentInterimText;

        if (candidate) {
          processSingleWordResult(
            candidate
          );

          if (
            typeof callbacks.onTranscript ===
            "function"
          ) {
            callbacks.onTranscript(
              normalize(candidate)
            );
          }
        }

        return;
      }

      if (currentFinalText) {
        processMultiWordResult(
          currentFinalText
        );
      }

      const visibleText =
        (
          controller.finalTranscript +
          " " +
          currentInterimText
        ).trim();

      if (
        visibleText &&
        typeof callbacks.onTranscript ===
          "function"
      ) {
        callbacks.onTranscript(
          visibleText
        );
      }
    }

    function createRecognition() {
      const instance =
        new SpeechRecognition();

      const isAndroid =
        /android/i.test(
          navigator.userAgent
        );

      instance.continuous = !isAndroid;
      instance.interimResults = true;
      instance.lang = language;
      instance.maxAlternatives = 1;

      instance.onstart = () => {
        controller.singleWordDetectedInCycle =
          false;

        if (
          typeof callbacks.onStart ===
          "function"
        ) {
          callbacks.onStart();
        }
      };

      instance.onresult =
        processResult;

      instance.onerror = event => {
        if (
          typeof callbacks.onError ===
          "function"
        ) {
          callbacks.onError(event);
        }

        if (
          event.error === "not-allowed" ||
          event.error ===
            "service-not-allowed"
        ) {
          controller.manuallyStopped =
            true;
        }
      };

      instance.onend = () => {
        if (
          typeof callbacks.onEnd ===
          "function"
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

          /*
            New Android cycle ke liye single-word
            detection flag reset hoga onstart par.
          */
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
      controller.manuallyStopped =
        false;

      controller.finalTranscript = "";
      controller.lastProcessedTranscript = "";
      controller.singleWordDetectedInCycle =
        false;

      startRecognition();
    };

    controller.stop = () => {
      controller.manuallyStopped =
        true;

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
