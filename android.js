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

  function countPhraseMatches(
    text,
    phrase
  ) {
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

    const matches =
      spoken.match(regex);

    return matches
      ? matches.length
      : 0;
  }

  function getNewTranscript(
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

    /*
      Android kabhi result ko shorter/revised form me bhejta hai.
      Aise result ko duplicate count nahi karna.
    */
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
        Single-word ke liye separate state.
      */
      singleWordCountedText: "",
      singleWordDisplayText: "",

      /*
        Multi-word ka existing state.
      */
      multiWordCountedText: "",
      multiWordDisplayText: "",

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
      ONLY SINGLE-WORD LOGIC
    */
    function processSingleWord(
      finalText,
      confidence
    ) {
      const current =
        normalize(finalText);

      if (!current) {
        return;
      }

      /*
        Single-word ke liye sirf final,
        positive-confidence result count hoga.
      */
      if (
        typeof confidence !== "number" ||
        confidence <= 0
      ) {
        return;
      }

      const newText =
        getNewTranscript(
          current,
          controller.singleWordCountedText
        );

      if (!newText) {
        return;
      }

      /*
        Example:
        current = "radha radha radha"
        previous = "radha"
        newText = "radha radha"
        added = 2
      */
      const added =
        countPhraseMatches(
          newText,
          targetPhrase
        );

      if (added > 0) {
        sendMatch(added);
      }

      controller.singleWordCountedText =
        current;

      controller.singleWordDisplayText =
        current;
    }

    /*
      MULTI-WORD LOGIC
      Isko intentionally previous working logic
      ke jaise hi rakha gaya hai.
    */
    function processMultiWord(
      finalText
    ) {
      const current =
        normalize(finalText);

      const previous =
        controller.multiWordCountedText;

      if (!current) {
        return;
      }

      if (current === previous) {
        return;
      }

      const newText =
        getNewTranscript(
          current,
          previous
        );

      if (!newText) {
        return;
      }

      const added =
        countPhraseMatches(
          newText,
          targetPhrase
        );

      if (added > 0) {
        sendMatch(added);
      }

      controller.multiWordCountedText =
        current;

      controller.multiWordDisplayText =
        current;
    }

    function handleResult(event) {
      let finalText = "";
      let finalConfidence = 0;
      let interimText = "";

      /*
        Entire result list read kar rahe hain.
        Sirf resultIndex par depend nahi kar rahe.
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
          finalText =
            (
              finalText +
              " " +
              text
            ).trim();

          finalConfidence =
            Math.max(
              finalConfidence,
              Number(
                alternative.confidence
              ) || 0
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

      /*
        SINGLE-WORD CONDITION
      */
      if (singleWord) {
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
        MULTI-WORD CONDITION
        Is branch ko touch nahi kiya gaya.
      */
      if (finalText) {
        processMultiWord(finalText);
      }

      const visibleText =
        (
          controller.multiWordDisplayText +
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

    function createRecognition() {
      const recognition =
        new SpeechRecognition();

      /*
        Android one-shot mode.
        Android restart isi file ke andar hoga.
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
        /*
          Har new Android recognition session me
          single-word ka duplicate state reset.
        */
        if (singleWord) {
          controller.singleWordCountedText =
            "";

          controller.singleWordDisplayText =
            "";
        }

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
      controller.stopped =
        false;

      controller.singleWordCountedText =
        "";

      controller.singleWordDisplayText =
        "";

      controller.multiWordCountedText =
        "";

      controller.multiWordDisplayText =
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
