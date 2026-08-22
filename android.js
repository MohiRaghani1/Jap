(function () {
  "use strict";

  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  let activeController = null;

  function normalize(text) {
    return String(text || "")
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

  function getBackendTarget(userPhrase) {
    const phrase = normalize(userPhrase);

    if (!phrase) {
      return "";
    }

    /*
     * User input:
     * Radha
     *
     * Backend target:
     * Radha Radha
     *
     * Multi-word phrase unchanged rahega.
     */
    if (isSingleWord(phrase)) {
      return phrase + " " + phrase;
    }

    return phrase;
  }

  function countPhraseMatches(
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

  function getOnlyNewText(
    currentText,
    previousText
  ) {
    const current = normalize(currentText);
    const previous = normalize(previousText);

    if (!current) {
      return "";
    }

    if (
      previous &&
      current.startsWith(previous)
    ) {
      return current
        .slice(previous.length)
        .trim();
    }

    return current;
  }

  function createVoiceRecognition(
    language,
    userPhrase,
    callbacks = {}
  ) {
    if (!SpeechRecognition) {
      if (
        typeof callbacks.onError ===
        "function"
      ) {
        callbacks.onError({
          error: "unsupported",
          message:
            "Speech recognition is not supported in this browser."
        });
      }

      return null;
    }

    if (activeController) {
      activeController.stop();
    }

    const controller = {
      recognition: null,
      stopped: true,
      started: false,
      restartTimer: null,
      finalText: "",
      countedText: "",

      start() {
        this.stopped = false;
        this.started = false;
        this.finalText = "";
        this.countedText = "";

        startRecognition();
      },

      stop() {
        this.stopped = true;
        this.started = false;

        clearTimeout(this.restartTimer);

        const currentRecognition =
          this.recognition;

        this.recognition = null;

        if (currentRecognition) {
          try {
            currentRecognition.abort();
          } catch (error) {
            try {
              currentRecognition.stop();
            } catch (stopError) {}
          }
        }

        if (
          typeof callbacks.onEnd ===
          "function"
        ) {
          callbacks.onEnd();
        }

        if (activeController === this) {
          activeController = null;
        }
      }
    };

    function startRecognition() {
      if (controller.stopped) {
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
          }, 600);
      }
    }

    function createRecognition() {
      const recognition =
        new SpeechRecognition();

      recognition.lang = language;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        controller.started = true;

        if (
          typeof callbacks.onStart ===
          "function"
        ) {
          callbacks.onStart();
        }
      };

      recognition.onresult = event => {
        let finalPart = "";
        let interimPart = "";

        /*
         * Sirf changed results process honge.
         * Purane final results dobara count nahi honge.
         */
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
            finalPart = (
              finalPart +
              " " +
              text
            ).trim();
          } else {
            interimPart = (
              interimPart +
              " " +
              text
            ).trim();
          }
        }

        /*
         * Final transcript save karo.
         */
        if (finalPart) {
          controller.finalText = (
            controller.finalText +
            " " +
            finalPart
          ).trim();

          if (
            typeof callbacks.onTranscript ===
            "function"
          ) {
            callbacks.onTranscript(
              controller.finalText
            );
          }

          const newText =
            getOnlyNewText(
              controller.finalText,
              controller.countedText
            );

          const backendTarget =
            getBackendTarget(userPhrase);

          const amount =
            countPhraseMatches(
              newText,
              backendTarget
            );

          if (
            amount > 0 &&
            typeof callbacks.onMatch ===
              "function"
          ) {
            callbacks.onMatch(amount);
          }

          controller.countedText =
            controller.finalText;
        }

        /*
         * Interim result sirf display hoga.
         * Interim result count nahi hoga.
         */
        if (interimPart) {
          const visibleText = (
            controller.finalText +
            " " +
            interimPart
          ).trim();

          if (
            typeof callbacks.onTranscript ===
            "function"
          ) {
            callbacks.onTranscript(
              visibleText
            );
          }
        }
      };

      recognition.onerror = event => {
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

      recognition.onend = () => {
        controller.started = false;

        if (
          typeof callbacks.onEnd ===
          "function"
        ) {
          callbacks.onEnd();
        }

        /*
         * Stop button nahi dabaya gaya ho
         * to recognition restart hota rahega.
         */
        if (!controller.stopped) {
          clearTimeout(
            controller.restartTimer
          );

          controller.restartTimer =
            setTimeout(() => {
              startRecognition();
            }, 400);
        }
      };

      return recognition;
    }

    activeController = controller;

    return controller;
  }

  window.createVoiceRecognition =
    createVoiceRecognition;

  window.voiceRecognitionSupported =
    Boolean(SpeechRecognition);
})();
