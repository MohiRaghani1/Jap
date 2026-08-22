(function () {
  "use strict";

  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  const isAndroid =
    /Android/i.test(
      navigator.userAgent || ""
    );

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

  function phraseWords(text) {
    return normalize(text)
      .split(/\s+/)
      .filter(Boolean);
  }

  function countSingleWord(
    speechText,
    userPhrase
  ) {
    const speech =
      normalize(speechText);

    const word =
      normalize(userPhrase);

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

  function countMultiWord(
    speechText,
    userPhrase
  ) {
    const speech =
      normalize(speechText);

    const phrase =
      normalize(userPhrase);

    if (!speech || !phrase) {
      return 0;
    }

    const regex = new RegExp(
      "(^|\\s)" +
        phrase
          .split(/\s+/)
          .map(escapeRegExp)
          .join("\\s+") +
        "(?=\\s|$)",
      "gi"
    );

    return Array.from(
      speech.matchAll(regex)
    ).length;
  }

  function countSpeech(
    speechText,
    userPhrase
  ) {
    const words =
      phraseWords(userPhrase);

    if (words.length === 1) {
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
            "Speech recognition is not supported."
        });
      }

      return null;
    }

    /*
     * Sirf Android par active controller
     * stop karo.
     *
     * iPhone par existing behavior preserve
     * rahega.
     */
    if (
      isAndroid &&
      activeController
    ) {
      activeController.stop();
    }

    const controller = {
      recognition: null,
      stopped: true,
      restartTimer: null,
      finalText: "",
      lastCountedText: "",
      lastCountedAt: 0,

      start() {
        this.stopped = false;
        this.finalText = "";
        this.lastCountedText = "";
        this.lastCountedAt = 0;

        startRecognition();
      },

      stop() {
        this.stopped = true;

        clearTimeout(
          this.restartTimer
        );

        const current =
          this.recognition;

        this.recognition = null;

        if (current) {
          try {
            current.abort();
          } catch (error) {
            try {
              current.stop();
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

    function buildRecognition() {
      const recognition =
        new SpeechRecognition();

      recognition.lang = language;

      /*
       * Android ke liye continuous mode.
       */
      recognition.continuous = true;

      /*
       * Android mein interim results
       * count nahi honge.
       */
      recognition.interimResults =
        isAndroid ? false : true;

      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        if (
          typeof callbacks.onStart ===
          "function"
        ) {
          callbacks.onStart();
        }
      };

      recognition.onresult = event => {
        let changedText = "";

        /*
         * Sirf changed result read karo.
         * Poora results array dobara count
         * nahi karna.
         */
        for (
          let i = event.resultIndex;
          i < event.results.length;
          i++
        ) {
          const result =
            event.results[i];

          if (
            !result ||
            !result[0]
          ) {
            continue;
          }

          if (
            isAndroid &&
            !result.isFinal
          ) {
            continue;
          }

          const text =
            result[0].transcript.trim();

          if (text) {
            changedText +=
              " " + text;
          }
        }

        changedText = changedText
          .replace(/\s+/g, " ")
          .trim();

        if (!changedText) {
          return;
        }

        /*
         * Android same final result ko
         * kabhi-kabhi repeat bhej sakta hai.
         */
        if (isAndroid) {
          const now = Date.now();

          if (
            changedText ===
              controller.lastCountedText &&
            now -
              controller.lastCountedAt <
              4000
          ) {
            return;
          }

          controller.lastCountedText =
            changedText;

          controller.lastCountedAt =
            now;
        }

        controller.finalText = (
          controller.finalText +
          " " +
          changedText
        )
          .replace(/\s+/g, " ")
          .trim();

        if (
          typeof callbacks.onTranscript ===
          "function"
        ) {
          callbacks.onTranscript(
            isAndroid
              ? changedText
              : controller.finalText
          );
        }

        /*
         * Android aur iPhone dono mein
         * current changed result hi count hoga.
         */
        const amount =
          countSpeech(
            changedText,
            userPhrase
          );

        if (
          amount > 0 &&
          typeof callbacks.onMatch ===
            "function"
        ) {
          callbacks.onMatch(amount);
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
        if (
          typeof callbacks.onEnd ===
          "function"
        ) {
          callbacks.onEnd();
        }

        if (
          controller.stopped
        ) {
          return;
        }

        /*
         * Sirf Android par automatic restart.
         */
        if (isAndroid) {
          clearTimeout(
            controller.restartTimer
          );

          controller.restartTimer =
            setTimeout(() => {
              if (
                controller.stopped
              ) {
                return;
              }

              /*
               * Restart ke baad same
               * stale transcript count nahi hoga.
               */
              controller.lastCountedText =
                "";

              controller.lastCountedAt =
                0;

              startRecognition();
            }, 600);
        }
      };

      return recognition;
    }

    function startRecognition() {
      if (
        controller.stopped
      ) {
        return;
      }

      controller.recognition =
        buildRecognition();

      try {
        controller.recognition.start();
      } catch (error) {
        clearTimeout(
          controller.restartTimer
        );

        if (isAndroid) {
          controller.restartTimer =
            setTimeout(() => {
              startRecognition();
            }, 800);
        }
      }
    }

    activeController = controller;

    return controller;
  }

  window.voiceRecognitionSupported =
    Boolean(SpeechRecognition);

  window.createVoiceRecognition =
    createVoiceRecognition;
})();
