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

    const android =
      /android/i.test(
        navigator.userAgent
      );

    const singleWord =
      isSingleWord(targetPhrase);

    const controller = {
      recognition: null,
      stopped: false,
      restartTimer: null,
      finalText: "",
      countedText: "",
      countedThisCycle: false,
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

    function processSingleWord(text) {
      const spoken = normalize(text);
      const target = normalize(targetPhrase);

      if (!spoken || !target) {
        return;
      }

      /*
        Android single-word mode:
        transcript me target word milte hi 1 count.
        Ek recognition cycle me maximum 1 count.
      */
      if (
        !controller.countedThisCycle &&
        spoken
          .split(/\s+/)
          .includes(target)
      ) {
        controller.countedThisCycle = true;
        sendMatch(1);
      }
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
        newText = current
          .slice(previous.length)
          .trim();
      }

      if (!newText) {
        return;
      }

      const added = countPhraseMatches(
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

        if (result.isFinal) {
          finalText =
            (
              finalText +
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

      /*
        Single-word aur multi-word ki conditions alag.
      */
      if (singleWord) {
        const candidate =
          finalText || interimText;

        if (candidate) {
          processSingleWord(candidate);

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

      if (finalText) {
        processMultiWord(finalText);
      }

      const visible =
        (
          controller.finalText +
          " " +
          interimText
        ).trim();

      if (
        visible &&
        typeof callbacks.onTranscript ===
          "function"
      ) {
        callbacks.onTranscript(visible);
      }
    }

    function makeRecognition() {
      const instance =
        new SpeechRecognition();

      /*
        Android one-shot mode.
        iPhone/desktop ka behavior same rahega.
      */
      instance.continuous = !android;
      instance.interimResults = true;
      instance.lang = language;
      instance.maxAlternatives = 1;

      instance.onstart = () => {
        controller.countedThisCycle =
          false;

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
          android &&
          !controller.stopped
        ) {
          clearTimeout(
            controller.restartTimer
          );

          controller.restartTimer =
            setTimeout(() => {
              startRecognition();
            }, 450);
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
          }, 650);
      }
    }

    controller.start = () => {
      controller.stopped = false;
      controller.finalText = "";
      controller.countedText = "";
      controller.countedThisCycle = false;

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
