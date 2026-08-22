(function () {
  "use strict";

  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  const RENDER_URL =
    "https://naam-jap-vosk.onrender.com";

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

    return matches
      ? matches.length
      : 0;
  }

  function getRecorderMimeType() {
    const options = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4"
    ];

    for (const type of options) {
      if (
        window.MediaRecorder &&
        MediaRecorder.isTypeSupported(type)
      ) {
        return type;
      }
    }

    return "";
  }

  function createDeepgramController(
    language,
    targetPhrase,
    callbacks
  ) {
    const controller = {
      stream: null,
      recorder: null,
      socket: null,
      stopped: false,
      started: false,
      start: null,
      stop: null
    };

    function reportError(error, message) {
      if (
        typeof callbacks.onError ===
        "function"
      ) {
        callbacks.onError({
          error,
          message
        });
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

    async function getTemporaryToken() {
      const response = await fetch(
        RENDER_URL + "/deepgram-token"
      );

      if (!response.ok) {
        throw new Error(
          await response.text()
        );
      }

      const result = await response.json();

      if (!result.token) {
        throw new Error(
          "Deepgram token missing."
        );
      }

      return result.token;
    }

    function startRecorder() {
      const mimeType =
        getRecorderMimeType();

      controller.recorder = mimeType
        ? new MediaRecorder(
            controller.stream,
            { mimeType }
          )
        : new MediaRecorder(
            controller.stream
          );

      controller.recorder.ondataavailable =
        event => {
          if (
            event.data &&
            event.data.size > 0 &&
            controller.socket &&
            controller.socket.readyState ===
              WebSocket.OPEN
          ) {
            controller.socket.send(event.data);
          }
        };

      controller.recorder.start(250);
    }

    function handleDeepgramMessage(message) {
      if (message.type !== "Results") {
        return;
      }

      const transcript = normalize(
        message.channel?.alternatives?.[0]
          ?.transcript || ""
      );

      if (!transcript) {
        return;
      }

      emitTranscript(transcript);

      if (!message.is_final) {
        return;
      }

      const added = countMatches(
        transcript,
        targetPhrase
      );

      if (added > 0) {
        emitMatch(added);
      }
    }

    controller.start = async () => {
      if (controller.started) {
        return;
      }

      controller.started = true;
      controller.stopped = false;

      try {
        const token =
          await getTemporaryToken();

        if (controller.stopped) {
          return;
        }

        const params =
          new URLSearchParams({
            model: "nova-3",
            language: language || "en-IN",
            interim_results: "true",
            smart_format: "false",
            punctuate: "false",
            endpointing: "300",
            keyterm: targetPhrase
          });

        controller.socket = new WebSocket(
          "wss://api.deepgram.com/v1/listen?" +
            params.toString(),
          ["token", token]
        );

        controller.socket.onopen = async () => {
          try {
            controller.stream =
              await navigator.mediaDevices.getUserMedia(
                {
                  audio: true
                }
              );

            if (controller.stopped) {
              controller.stream
                .getTracks()
                .forEach(track => track.stop());

              return;
            }

            startRecorder();

            if (
              typeof callbacks.onStart ===
              "function"
            ) {
              callbacks.onStart();
            }
          } catch (error) {
            reportError(
              "not-allowed",
              "Microphone permission was not allowed."
            );
          }
        };

        controller.socket.onmessage = event => {
          try {
            handleDeepgramMessage(
              JSON.parse(event.data)
            );
          } catch (error) {
            console.error(error);
          }
        };

        controller.socket.onerror = () => {
          if (!controller.stopped) {
            reportError(
              "deepgram-error",
              "Deepgram connection failed."
            );
          }
        };

        controller.socket.onclose = () => {
          if (
            !controller.stopped &&
            typeof callbacks.onEnd ===
            "function"
          ) {
            callbacks.onEnd();
          }
        };
      } catch (error) {
        controller.started = false;

        reportError(
          "deepgram-error",
          error.message ||
          "Deepgram could not start."
        );
      }
    };

    controller.stop = () => {
      controller.stopped = true;

      if (
        controller.recorder &&
        controller.recorder.state !== "inactive"
      ) {
        try {
          controller.recorder.stop();
        } catch (error) {
          // Already stopped.
        }
      }

      if (controller.stream) {
        controller.stream
          .getTracks()
          .forEach(track => track.stop());
      }

      if (controller.socket) {
        try {
          controller.socket.close();
        } catch (error) {
          // Already closed.
        }
      }

      if (
        typeof callbacks.onEnd ===
        "function"
      ) {
        callbacks.onEnd();
      }

      if (activeController === controller) {
        activeController = null;
      }
    };

    return controller;
  }

  function createVoiceRecognition(
    language,
    targetPhrase,
    callbacks = {}
  ) {
    const isAndroid =
      /android/i.test(
        navigator.userAgent
      );

    const singleWord =
      isSingleWord(targetPhrase);

    if (isAndroid && singleWord) {
      if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia ||
        !window.MediaRecorder
      ) {
        return null;
      }

      if (activeController) {
        activeController.stop();
      }

      const controller =
        createDeepgramController(
          language,
          targetPhrase,
          callbacks
        );

      activeController = controller;

      return controller;
    }

    if (!SpeechRecognition) {
      return null;
    }

    if (activeController) {
      activeController.stop();
    }

    const controller = {
      recognition: null,
      stopped: false,
      restartTimer: null,

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

      const added = countMatches(
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

      for (
        let i = 0;
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

      recognition.continuous =
        !isAndroid;

      recognition.interimResults =
        true;

      recognition.lang = language;
      recognition.maxAlternatives = 1;

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
      controller.stopped = false;

      controller.multiWordSeenText =
        "";

      controller.multiWordCountedText =
        "";

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
    Boolean(
      SpeechRecognition ||
      (
        navigator.mediaDevices &&
        navigator.mediaDevices.getUserMedia &&
        window.MediaRecorder
      )
    );
})();
