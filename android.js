(function () {
  "use strict";

  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  const SINGLE_WORD_API =
    "https://naam-jap-vosk.onrender.com/transcribe";

  const SINGLE_WORD_CHUNK_MS = 3000;
  const SINGLE_WORD_OVERLAP_MS = 500;

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
    const current = normalize(currentText);
    const previous = normalize(previousText);

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

  function createSingleWordBackendController(
    language,
    targetPhrase,
    callbacks
  ) {
    const controller = {
      stream: null,
      recorder: null,
      stopped: false,
      started: false,
      processing: false,
      queue: [],
      requestController: null,
      chunks: [],
      chunkTimer: null,
      lastTranscript: "",
      start: null,
      stop: null
    };

    function reportError(message) {
      if (
        typeof callbacks.onError ===
          "function"
      ) {
        callbacks.onError({
          error: "backend-error",
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

    async function uploadAudio(blob) {
      if (
        controller.stopped ||
        !blob ||
        blob.size < 1500
      ) {
        return;
      }

      const formData = new FormData();

      formData.append(
        "audio",
        blob,
        "single-word.webm"
      );

      formData.append(
        "target",
        targetPhrase
      );

      controller.requestController =
        new AbortController();

      const response = await fetch(
        SINGLE_WORD_API,
        {
          method: "POST",
          body: formData,
          signal:
            controller.requestController.signal
        }
      );

      if (!response.ok) {
        throw new Error(
          "Backend response: " +
          response.status
        );
      }

      const result = await response.json();

      if (controller.stopped) {
        return;
      }

      const transcript = normalize(
        result.transcript || ""
      );

      /*
        Backend har complete audio chunk ka
        independent count return karta hai.
      */
      const added = Number(result.count) || 0;

      if (transcript) {
        controller.lastTranscript =
          (
            controller.lastTranscript +
            " " +
            transcript
          ).trim();

        emitTranscript(
          controller.lastTranscript
        );
      }

      if (added > 0) {
        emitMatch(added);
      }
    }

    async function processQueue() {
      if (
        controller.processing ||
        controller.stopped
      ) {
        return;
      }

      controller.processing = true;

      while (
        controller.queue.length > 0 &&
        !controller.stopped
      ) {
        const blob =
          controller.queue.shift();

        try {
          await uploadAudio(blob);
        } catch (error) {
          if (
            error.name !== "AbortError" &&
            !controller.stopped
          ) {
            reportError(
              "Single-word voice server could not process audio."
            );
          }
        }
      }

      controller.processing = false;
    }

    function queueBlob(blob) {
      if (
        controller.stopped ||
        !blob ||
        blob.size < 1500
      ) {
        return;
      }

      controller.queue.push(blob);
      processQueue();
    }

    function startNewRecorder() {
      if (
        controller.stopped ||
        !controller.stream
      ) {
        return;
      }

      const mimeType =
        getRecorderMimeType();

      try {
        controller.recorder = mimeType
          ? new MediaRecorder(
              controller.stream,
              { mimeType }
            )
          : new MediaRecorder(
              controller.stream
            );
      } catch (error) {
        reportError(
          "Audio recording is not supported on this device."
        );

        return;
      }

      controller.chunks = [];

      controller.recorder.ondataavailable =
        event => {
          if (
            event.data &&
            event.data.size > 0
          ) {
            controller.chunks.push(
              event.data
            );
          }
        };

      controller.recorder.onstop = () => {
        const mime =
          controller.recorder &&
          controller.recorder.mimeType
            ? controller.recorder.mimeType
            : "audio/webm";

        const blob = new Blob(
          controller.chunks,
          { type: mime }
        );

        queueBlob(blob);

        if (!controller.stopped) {
          setTimeout(
            startNewRecorder,
            SINGLE_WORD_OVERLAP_MS
          );
        }
      };

      controller.recorder.start();

      controller.chunkTimer =
        setTimeout(() => {
          if (
            controller.recorder &&
            controller.recorder.state ===
              "recording"
          ) {
            controller.recorder.stop();
          }
        }, SINGLE_WORD_CHUNK_MS);
    }

    controller.start = async () => {
      if (controller.started) {
        return;
      }

      controller.started = true;
      controller.stopped = false;

      try {
        controller.stream =
          await navigator.mediaDevices.getUserMedia(
            {
              audio: {
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              }
            }
          );

        if (
          typeof callbacks.onStart ===
            "function"
        ) {
          callbacks.onStart();
        }

        startNewRecorder();
      } catch (error) {
        controller.stopped = true;

        if (
          typeof callbacks.onError ===
            "function"
        ) {
          callbacks.onError({
            error: "not-allowed",
            message:
              "Microphone permission was not allowed."
          });
        }
      }
    };

    controller.stop = () => {
      controller.stopped = true;

      clearTimeout(
        controller.chunkTimer
      );

      if (controller.requestController) {
        controller.requestController.abort();
      }

      controller.queue = [];

      if (
        controller.recorder &&
        controller.recorder.state ===
          "recording"
      ) {
        try {
          controller.recorder.stop();
        } catch (error) {
          // Recorder already stopped.
        }
      }

      if (controller.stream) {
        controller.stream
          .getTracks()
          .forEach(track => track.stop());
      }

      controller.stream = null;
      controller.recorder = null;

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

    /*
      ANDROID + SINGLE WORD:
      Browser SpeechRecognition use nahi hoga.
      Direct mic audio Render/Vosk backend par jayega.
    */
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

      const backendController =
        createSingleWordBackendController(
          language,
          targetPhrase,
          callbacks
        );

      activeController =
        backendController;

      return backendController;
    }

    /*
      Baaki:
      iPhone, desktop, aur Android multi-word
      ka current existing logic same.
    */
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
