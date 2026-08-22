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

  /*
   * Ye sirf mic-recognition side ke liye hai.
   *
   * Single word:
   * Radha -> Radha Radha
   *
   * Multi-word:
   * Jai Shri Radha -> Jai Shri Radha
   */
  function getMicTarget(userPhrase) {
    const phrase = normalize(userPhrase);

    if (!phrase) {
      return "";
    }

    if (isSingleWord(phrase)) {
      return phrase + " " + phrase;
    }

    return phrase;
  }

  /*
   * Latest recognized speech mein
   * single word jitni baar aaya,
   * utna hi count.
   *
   * Radha Radha Radha Radha = 4
   */
  function countSingleWord(
    speechText,
    userPhrase
  ) {
    const speech = normalize(speechText);
    const word = normalize(userPhrase);

    if (!speech || !word) {
      return 0;
    }

    const regex = new RegExp(
      "(^|\\s)" +
        escapeRegExp(word) +
        "(?=\\s|$)",
      "gi"
    );

    return Array.from(
      speech.matchAll(regex)
    ).length;
  }

  /*
   * Multi-word phrase ko original hi rakho.
   *
   * Jai Shri Radha =
   * 1 complete match
   *
   * Jai Shri Radha Jai Shri Radha =
   * 2 complete matches
   */
  function countMultiWord(
    speechText,
    userPhrase
  ) {
    const speech = normalize(speechText);
    const phrase = normalize(userPhrase);

    if (!speech || !phrase) {
      return 0;
    }

    const regex = new RegExp(
      "(^|\\s)" +
        escapeRegExp(phrase)
          .replace(/\\ +/g, "\\s+") +
        "(?=\\s|$)",
      "gi"
    );

    return Array.from(
      speech.matchAll(regex)
    ).length;
  }

  function countRecognizedText(
    speechText,
    userPhrase
  ) {
    if (isSingleWord(userPhrase)) {
      return countSingleWord(
        speechText,
        userPhrase
      );
    }

    return countMultiWord(
      speechText,
      userPhrase
    );
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

    const micTarget =
      getMicTarget(userPhrase);

    const controller = {
      recognition: null,
      stopped: true,
      started: false,
      restartTimer: null,

      /*
       * Screen par dikhne wala complete
       * latest final speech.
       */
      finalText: "",

      /*
       * Har recognition instance ke final
       * result indexes yahan track honge.
       */
      processedIndexes: new Set(),

      start() {
        this.stopped = false;
        this.started = false;
        this.finalText = "";
        this.processedIndexes =
          new Set();

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
       * Android/mic ke single-word issue
       * ke liye internally prepared target.
       *
       * Actual counting mein micTarget use
       * nahi hota.
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
            /*
             * Same final result dobara count
             * nahi hoga.
             */
            if (
              controller.processedIndexes
                .has(i)
            ) {
              continue;
            }

            controller.processedIndexes.add(i);

            /*
             * Latest recognized speech ke
             * original text ko preserve karo.
             */
            controller.finalText = (
              controller.finalText +
              " " +
              text
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
             * Sirf current final result count
             * hoga, poora old transcript nahi.
             */
            const amount =
              countRecognizedText(
                text,
                userPhrase
              );

            if (
              amount > 0 &&
              typeof callbacks.onMatch ===
                "function"
            ) {
              callbacks.onMatch(amount);
            }
          } else {
            interimText = (
              interimText +
              " " +
              text
            ).trim();
          }
        }

        /*
         * Interim text display only.
         * Interim text count nahi hoga.
         */
        if (interimText) {
          const visibleText = (
            controller.finalText +
            " " +
            interimText
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

      /*
       * Har automatic restart par naya
       * recognition object banao.
       *
       * Isse purane indexes ke saath
       * collision nahi hogi.
       */
      controller.recognition =
        createRecognition();

      try {
        controller.recognition.start();
      } catch (error) {
        controller.recognition = null;

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
