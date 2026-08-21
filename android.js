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

  function getNewText(
    currentText,
    previousText
  ) {
    const current =
      normalize(currentText);

    const previous =
      normalize(previousText);

    if (!current) {
      return "";
    }

    if (!previous) {
      return current;
    }

    if (current === previous) {
      return "";
    }

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

    if (activeController) {
      activeController.stop();
    }

    const isAndroid =
      /android/i.test(
        navigator.userAgent
      );

    const singleWord =
      isSingleWord(targetPhrase);

    const controller = {
      recognition: null,
      stopped: false,
      restartTimer: null,

      /*
        Single-word state.
      */
      singleWordSeenText: "",
      singleWordCountedText: "",

      /*
        Multi-word state.
        Isko previous working behavior ke
        liye separate rakha gaya hai.
      */
      multiWordSeenText: "",
      multiWordCountedText: "",

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

    /*
      SINGLE-WORD ONLY
    */
    function processSingleWord(
      currentText
    ) {
      const current =
        normalize(currentText);

      if (!current) {
        return;
      }

      const previous =
        controller.singleWordCountedText;

      /*
        Android result same ya shorter ho gaya
        to duplicate/revision ignore.
      */
      if (
        current === previous ||
        (
          previous &&
          !current.startsWith(previous)
        )
      ) {
        return;
      }

      let newText = current;

      if (previous) {
        newText =
          current
            .slice(previous.length)
            .trim();
      }

      if (!newText) {
        return;
      }

      /*
        Example:
        previous: "radha"
        current:  "radha radha radha"
        newText:  "radha radha"
        result: +2
      */
      const added =
        countMatches(
          newText,
          targetPhrase
        );

      if (added > 0) {
        sendMatch(added);
      }

      controller.singleWordCountedText =
        current;

      controller.singleWordSeenText =
        current;
    }

    /*
      MULTI-WORD ONLY
      Previous working logic preserved.
    */
    function processMultiWord(
      currentText
    ) {
      const current =
        normalize(currentText);

      const previous =
        controller.multiWordCountedText;

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
        countMatches(
          newText,
          targetPhrase
        );

      if (added > 0) {
        sendMatch(added);
      }

      controller.multiWordCountedText =
        current;

      controller.multiWordSeenText =
        current;
    }

    function handleResult(event) {
      let fullFinalText = "";
      let interimText = "";

      /*
        Android me resultIndex kabhi 0 se
        poora result dobara de sakta hai,
        isliye complete results list read karte hain.
      */
      for (
        let i = 0;
        i < event.results.length;
        i++
      ) {
        const result =
          event.results[i];

        const alternative =
          result[0];

        if (!alternative) {
          continue;
        }

        const text =
          alternative.transcript.trim();

        if (!text) {
          continue;
        }

        if (result.isFinal) {
          fullFinalText =
            (
              fullFinalText +
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
        SINGLE-WORD:
        Final aur interim dono transcript ko
        candidate maana jayega, taaki slow speech
        miss na ho.
      */
      if (singleWord) {
        const candidate =
          (
            fullFinalText +
            " " +
            interimText
          ).trim();

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

      /*
        MULTI-WORD:
        Existing final-result behavior.
      */
      if (fullFinalText) {
        processMultiWord(
          fullFinalText
        );
      }

      const visibleText =
        (
          controller.multiWordSeenText +
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
      const recognition =
        new SpeechRecognition();

      /*
        Android one-shot mode.
        Android restart isi file me hoga.
      */
      recognition.continuous =
        !isAndroid;

      recognition.interimResults =
        true;

      recognition.lang =
        language;

      recognition.maxAlternatives =
        1;

      recognition.onstart = () => {
        if (
          typeof callbacks.onStart ===
            "function"
        ) {
          callbacks.onStart();
        }
      };

      recognition.onresult =
        handleResult;

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
          controller.stopped =
            true;
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
          isAndroid &&
          !controller.stopped
        ) {
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
          }, 600);
      }
    }

    controller.start = () => {
      controller.stopped =
        false;

      controller.singleWordSeenText =
        "";

      controller.singleWordCountedText =
        "";

      controller.multiWordSeenText =
        "";

      controller.multiWordCountedText =
        "";

      startRecognition();
    };

    controller.stop = () => {
      controller.stopped =
        true;

      clearTimeout(
        controller.restartTimer
      );

      const recognition =
        controller.recognition;

      controller.recognition =
        null;

      if (recognition) {
        try {
          recognition.abort();
        } catch (error) {
          try {
            recognition.stop();
          } catch (stopError) {
            // Already stopped.
          }
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
