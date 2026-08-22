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

  function countMatches(text, phrase) {
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
      if (
        typeof callbacks.onError ===
        "function"
      ) {
        callbacks.onError({
          error: "unsupported",
          message:
            "Is browser me Speech Recognition supported nahi hai."
        });
      }

      return null;
    }

    if (activeController) {
      activeController.stop();
    }

    /*
     * User ka input screen par original rahega.
     *
     * Example:
     * Radha -> Radha
     * Jai Shri Radha -> Jai Shri Radha
     */
    const userTarget =
      normalize(targetPhrase);

    /*
     * Sirf backend counting ke liye:
     *
     * Single word:
     * Radha -> Radha Radha
     *
     * Multi-word:
     * Jai Shri Radha -> Jai Shri Radha
     */
    const backendTarget =
      isSingleWord(userTarget)
        ? `${userTarget} ${userTarget}`
        : userTarget;

    const controller = {
      recognition: null,
      stopped: true,
      started: false,
      restartTimer: null,

      /*
       * Ab tak ka final transcript.
       * Counting isi text se hogi.
       */
      finalTranscript: "",

      /*
       * Is text ko already count kiya gaya hai.
       */
      countedTranscript: "",

      start: null,
      stop: null
    };

    function emitStart() {
      if (
        typeof callbacks.onStart ===
        "function"
      ) {
        callbacks.onStart();
      }
    }

    function emitEnd() {
      if (
        typeof callbacks.onEnd ===
        "function"
      ) {
        callbacks.onEnd();
      }
    }

    function emitTranscript(text) {
      if (
        text &&
        typeof callbacks.onTranscript ===
        "function"
      ) {
        callbacks.onTranscript(text);
      }
    }

    function emitMatch(amount) {
      if (
        amount > 0 &&
        typeof callbacks.onMatch ===
        "function"
      ) {
        callbacks.onMatch(amount);
      }
    }

    function emitError(error) {
      if (
        typeof callbacks.onError ===
        "function"
      ) {
        callbacks.onError(error);
      }
    }

    function getNewTranscript(
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

    function processFinalTranscript(
      currentTranscript
    ) {
      const current =
        normalize(currentTranscript);

      if (!current) {
        return;
      }

      const newText = getNewTranscript(
        current,
        controller.countedTranscript
      );

      if (!newText) {
        return;
      }

      /*
       * Single word ke liye:
       *
       * target = Radha Radha
       *
       * Multi-word ke liye:
       *
       * target = original phrase
       */
      const amount = countMatches(
        newText,
        backendTarget
      );

      if (amount > 0) {
        emitMatch(amount);
      }

      controller.countedTranscript =
        current;
    }

    function handleResult(event) {
      let newFinalPart = "";
      let interimPart = "";

      /*
       * Sirf naye result items process kar rahe hain.
       * Purane final results dobara process nahi honge.
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
          newFinalPart = (
            newFinalPart +
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
       * Final transcript ko save karo.
       */
      if (newFinalPart) {
        controller.finalTranscript = (
          controller.finalTranscript +
          " " +
          newFinalPart
        ).trim();

        /*
         * Niche original speech text dikhana.
         */
        emitTranscript(
          controller.finalTranscript
        );

        /*
         * Backend target ke according count karna.
         */
        processFinalTranscript(
          controller.finalTranscript
        );
      }

      /*
       * Interim text sirf display hoga.
       * Interim text count nahi hoga.
       */
      if (interimPart) {
        const visibleText = (
          controller.finalTranscript +
          " " +
          interimPart
        ).trim();

        emitTranscript(visibleText);
      }
    }

    function createRecognition() {
      const recognition =
        new SpeechRecognition();

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        controller.started = true;
        emitStart();
      };

      recognition.onresult =
        handleResult;

      recognition.onerror = event => {
        emitError(event);

        /*
         * Permission error par automatic restart
         * nahi karna.
         */
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
        emitEnd();

        /*
         * Browser recognition ko automatically
         * restart karna.
         */
        if (!controller.stopped) {
          clearTimeout(
            controller.restartTimer
          );

          controller.restartTimer =
            setTimeout(() => {
              startRecognition();
            }, 350);
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

    controller.start = () => {
      controller.stopped = false;
      controller.finalTranscript = "";
      controller.countedTranscript = "";

      startRecognition();
    };

    controller.stop = () => {
      controller.stopped = true;

      clearTimeout(
        controller.restartTimer
      );

      const recognition =
        controller.recognition;

      controller.recognition = null;

      if (recognition) {
        try {
          recognition.abort();
        } catch (error) {
          try {
            recognition.stop();
          } catch (stopError) {}
        }
      }

      controller.started = false;

      if (activeController === controller) {
        activeController = null;
      }
    };

    activeController = controller;

    return controller;
  }

  window.createVoiceRecognition =
    createVoiceRecognition;

  window.voiceRecognitionSupported =
    Boolean(SpeechRecognition);
})();
