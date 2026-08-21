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

  function isSingleWord(text) {
    return normalize(text)
      .split(/\s+/)
      .filter(Boolean)
      .length === 1;
  }

  function countPhraseMatches(text, phrase) {
    const spoken = normalize(text);
    const target = normalize(phrase);

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

    const isAndroid =
      /android/i.test(navigator.userAgent);

    const singleWord =
      isSingleWord(targetPhrase);

    const controller = {
      recognition: null,
      stopped: false,
      restartTimer: null,

      finalText: "",
      countedText: "",
      lastSingleWordText: "",

      start: null,
      stop: null
    };

    activeController = controller;

    function sendMatch(amount) {
      if (
        amount > 0 &&
        typeof callbacks.onMatch ===
          "function"
      ) {
        callbacks.onMatch(amount);
      }
    }

    function processSingleWord(
      text,
      confidence
    ) {
      const spoken = normalize(text);
      const target = normalize(targetPhrase);

      if (!spoken || !target) {
        return;
      }

      /*
        Single-word rule:
        1. Interim result ignore.
        2. confidence 0 ignore.
        3. Same final transcript ignore.
        4. Ek final Android result me maximum 1 count.
      */
      if (
        typeof confidence !== "number" ||
        confidence <= 0
      ) {
        return;
      }

      if (
        spoken !== target &&
        !spoken
          .split(/\s+/)
          .includes(target)
      ) {
        return;
      }

      if (
        controller.lastSingleWordText ===
        spoken
      ) {
        return;
      }

      controller.lastSingleWordText =
        spoken;

      sendMatch(1);
    }

    function processMultiWord(text) {
      const current = normalize(text);
      const previous = normalize(
        controller.countedText
      );

      if (!current) {
        return;
      }

      if (current === previous) {
        return;
      }

      let newText = current;

      if (
        previous &&
        current.startsWith(previous)
      ) {
        newText =
          current
            .slice(previous.length)
            .trim();
      }

      if (!newText) {
        return;
      }

      const added =
        countPhraseMatches(
          newText,
          targetPhrase
        );

      sendMatch(added);

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

    function handleResult(event) {
      let finalText = "";
      let finalConfidence = 0;
      let interimText = "";

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
          Number(alternative.confidence) || 0;

        /*
          Single word ke liye ONLY final result.
          Isse interim + final double count nahi hoga.
        */
        if (result.isFinal) {
          finalText =
            (
              finalText +
              " " +
              text
            ).trim();

          finalConfidence =
            Math.max(
              finalConfidence,
              confidence
            );
        } else {
          interimText =
            (
              interimText +
              " " +
              text
            ).trim();
        }
      }

      if (singleWord) {
        /*
          Interim ko display kar sakte hain,
          lekin count sirf confidence-positive
          final result par hoga.
        */
        if (finalText) {
          processSingleWord(
            finalText,
            finalConfidence
          );
        }

        const displayText =
          finalText || interimText;

        if (
          displayText &&
          typeof callbacks.onTranscript ===
            "function"
        ) {
          callbacks.onTranscript(
            normalize(displayText)
          );
        }

        return;
      }

      /*
        Multi-word ka existing correct behavior.
      */
      if (finalText) {
        processMultiWord(finalText);
      }

      const visibleText =
        (
          controller.finalText +
          " " +
          interimText
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

    function makeRecognition() {
      const instance =
        new SpeechRecognition();

      /*
        Android ke liye one-shot recognition.
        App.js ko restart logic nahi karna.
      */
      instance.continuous = !isAndroid;
      instance.interimResults = true;
      instance.lang = language;
      instance.maxAlternatives = 1;

      instance.onstart = () => {
        controller.lastSingleWordText =
          "";

        if (
          typeof callbacks.onStart ===
            "function"
        ) {
          callbacks.onStart();
        }
      };

      instance.onresult =
        handleResult;

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
          controller.stopped = true;
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
          !controller.stopped
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
      if (controller.stopped) {
        return;
      }

      if (!controller.recognition) {
        controller.recognition =
          makeRecognition();
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
      controller.stopped = false;
      controller.finalText = "";
      controller.countedText = "";
      controller.lastSingleWordText = "";

      startRecognition();
    };

    controller.stop = () => {
      controller.stopped = true;

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
