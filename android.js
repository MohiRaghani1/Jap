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

  function getMicTarget(userPhrase) {
    const phrase = normalize(userPhrase);

    if (!phrase) {
      return "";
    }

    /*
     * IMPORTANT:
     *
     * Single word:
     * User input: Radha
     * Mic target:  Radha Radha
     *
     * Multi-word:
     * User input: Jai Shri Radha
     * Mic target:  Jai Shri Radha
     *
     * Multi-word ko bilkul double nahi karna.
     */
    if (isSingleWord(phrase)) {
      return phrase + " " + phrase;
    }

    return phrase;
  }

  function countSingleWordSpeech(
    speechText,
    userPhrase
  ) {
    const speech = normalize(speechText);
    const word = normalize(userPhrase);

    if (!speech || !word) {
      return 0;
    }

    const pattern = new RegExp(
      "(^|\\s)" +
        escapeRegExp(word) +
        "(?=\\s|$)",
      "gi"
    );

    /*
     * Latest recognized speech mein
     * jitni baar single word aaya hai,
     * utna hi count hoga.
     *
     * Radha Radha Radha Radha = 4
     *
     * Pair nahi banana.
     */
    return Array.from(
      speech.matchAll(pattern)
    ).length;
  }

  function countMultiWordSpeech(
    speechText,
    userPhrase
  ) {
    const speech = normalize(speechText);
    const phrase = normalize(userPhrase);

    if (!speech || !phrase) {
      return 0;
    }

    const pattern = new RegExp(
      "(^|\\s)" +
        escapeRegExp(phrase)
          .replace(/\\ +/g, "\\s+") +
        "(?=\\s|$)",
      "gi"
    );

    /*
     * Multi-word phrase ko original hi rakho.
     *
     * Jai Shri Radha =
     * 1 complete match
     *
     * Jai Shri Radha Jai Shri Radha =
     * 2 complete matches
     */
    return Array.from(
      speech.matchAll(pattern)
    ).length;
  }

  function countLatestSpeech(
    speechText,
    userPhrase
  ) {
    if (isSingleWord(userPhrase)) {
      /*
       * Single word:
       * Latest speech mein direct word count.
       * Mic target ka double yahan use nahi hoga.
       */
      return countSingleWordSpeech(
        speechText,
        userPhrase
      );
    }

    /*
     * Multi-word:
     * Original complete phrase count.
     */
    return countMultiWordSpeech(
      speechText,
      userPhrase
    );
  }

  function getNewText(
    currentText,
    previousCountedText
  ) {
    const current = normalize(currentText);
    const previous =
      normalize(previousCountedText);

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

    /*
     * Sirf mic recognition ko target dene ke liye.
     *
     * Counting ke liye is target ko use nahi karna.
     */
    const micTarget =
      getMicTarget(userPhrase);

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

    function createRecognition() {
      const recognition =
        new SpeechRecognition();

      recognition.lang = language;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      /*
       * Mic ko internally target diya ja raha hai.
       *
       * Single:
       * Radha Radha
       *
       * Multi-word:
       * Original phrase
       */
      void micTarget;

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
         * Sirf changed result items read karo.
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

          const transcript =
            alternative.transcript.trim();

          if (!transcript) {
            continue;
          }

          if (result.isFinal) {
            finalPart = (
              finalPart +
              " " +
              transcript
            ).trim();
          } else {
            interimPart = (
              interimPart +
              " " +
              transcript
            ).trim();
          }
        }

        /*
         * Final recognized speech ko save karo.
         * Yehi Latest recognized speech mein dikhega.
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

          /*
           * Sirf new final text count hoga.
           */
          const newText = getNewText(
            controller.finalText,
            controller.countedText
          );

          /*
           * IMPORTANT:
           *
           * Counting latest speech ke
           * original text se hogi.
           *
           * Single word ko yahan double nahi
           * karna aur pair mein divide nahi karna.
           */
          const amount =
            countLatestSpeech(
              newText,
              userPhrase
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
         * Interim speech sirf display hogi.
         * Interim speech count nahi hogi.
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
         * User ne Stop nahi dabaya ho,
         * to mic recognition restart hoga.
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

    activeController = controller;

    return controller;
  }

  window.createVoiceRecognition =
    createVoiceRecognition;

  window.voiceRecognitionSupported =
    Boolean(SpeechRecognition);
})();
