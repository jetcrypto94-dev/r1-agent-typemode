// Agent Type Mode for rabbit r1 (240x282)

// ---- CONFIG ----
// Ollama on TheHuub (LAN). Ollama must listen on 0.0.0.0 with OLLAMA_ORIGINS=*.
const OLLAMA_URL = "http://192.168.1.142:11434/v1/chat/completions";
const OLLAMA_MODEL = "qwen3:8b";
const PC_NAME = "TheHuub";
const REPLY_TIMEOUT_MS = 30000;

(function () {
  const AGENTS = [
    { id: "pc", name: "PC", kind: "pc" },
    { id: "ollama", name: "OLLAMA", kind: "ollama" },
    { id: "codex", name: "CODEX" },
    { id: "cursor", name: "CURSOR" },
    { id: "openclaw", name: "OPENCLAW" },
    { id: "claude", name: "CLAUDE" },
    { id: "grok", name: "GROK BOT" }
  ];

  let currentAgentIdx = 0;
  let text = "";
  let isListening = false;
  let kbMode = "alpha"; // "alpha" | "num"
  let currentScreen = "input"; // "input" | "quick" | "status"
  let quickIdx = 0;

  // DOM Elements
  const targetNameEl = document.getElementById("target-name");
  const charBadgeEl = document.getElementById("char-badge");
  const textDisplayEl = document.getElementById("text-display");
  const screenInput = document.getElementById("screen-input");
  const screenQuick = document.getElementById("screen-quick");
  const screenStatus = document.getElementById("screen-status");
  const quickListEl = document.getElementById("quick-list");
  const statusMetaEl = document.getElementById("status-meta");
  const statusIconEl = document.getElementById("status-icon");
  const statusTitleEl = document.getElementById("status-title");
  const statusDescEl = document.getElementById("status-desc");
  const statusReplyEl = document.getElementById("status-reply");
  let pending = null; // { id, timer }
  let sendSeq = 0;
  const footerTipEl = document.getElementById("footer-tip");
  const keyboardEl = document.getElementById("keyboard");

  // Load saved state if any
  async function loadState() {
    try {
      if (window.creationStorage && window.creationStorage.plain) {
        const raw = await window.creationStorage.plain.getItem("type_state");
        if (raw) {
          const state = JSON.parse(decodeURIComponent(escape(atob(raw))));
          if (state && typeof state.agentIdx === "number") {
            currentAgentIdx = state.agentIdx % AGENTS.length;
          }
        }
      } else {
        const raw = localStorage.getItem("type_state");
        if (raw) {
          const state = JSON.parse(raw);
          if (state && typeof state.agentIdx === "number") {
            currentAgentIdx = state.agentIdx % AGENTS.length;
          }
        }
      }
    } catch (e) {
      console.warn("Storage load error", e);
    }
    updateAgentUI();
  }

  async function saveState() {
    const payload = JSON.stringify({ agentIdx: currentAgentIdx });
    try {
      if (window.creationStorage && window.creationStorage.plain) {
        await window.creationStorage.plain.setItem(
          "type_state",
          btoa(unescape(encodeURIComponent(payload)))
        );
      } else {
        localStorage.setItem("type_state", payload);
      }
    } catch (e) {}
  }

  function updateAgentUI() {
    const agent = AGENTS[currentAgentIdx];
    targetNameEl.textContent = agent.name;
    saveState();
  }

  function updateTextUI() {
    if (text.length === 0) {
      textDisplayEl.textContent = "Hold side button to speak or tap keys...";
      textDisplayEl.className = "placeholder";
      charBadgeEl.textContent = "0";
    } else {
      textDisplayEl.textContent = text;
      textDisplayEl.className = "";
      charBadgeEl.textContent = String(text.length);
    }
  }

  function switchScreen(name) {
    currentScreen = name;
    screenInput.classList.toggle("active", name === "input");
    screenQuick.classList.toggle("active", name === "quick");
    screenStatus.classList.toggle("active", name === "status");

    if (name === "input") {
      footerTipEl.textContent = "Wheel: Agent • Side Tap: Send";
    } else if (name === "quick") {
      footerTipEl.textContent = "Wheel: Scroll • Side Tap: Select";
    } else if (name === "status") {
      footerTipEl.textContent = "Wheel: Scroll • Side Tap: Back";
    }
  }

  // Keyboard layout rendering
  const ALPHA_ROWS = [
    ["Q","W","E","R","T","Y","U","I","O","P"],
    ["A","S","D","F","G","H","J","K","L"],
    ["⚡","Z","X","C","V","B","N","M","⌫"],
    ["123","SPACE","SEND"]
  ];

  const NUM_ROWS = [
    ["1","2","3","4","5","6","7","8","9","0"],
    ["-","/",":",";","(",")","$","&","@"],
    ["⚡",".",",","?","!","'","\"","_","⌫"],
    ["ABC","SPACE","SEND"]
  ];

  function renderKeyboard() {
    const rows = kbMode === "alpha" ? ALPHA_ROWS : NUM_ROWS;
    keyboardEl.innerHTML = "";

    rows.forEach((rowItems) => {
      const rowDiv = document.createElement("div");
      rowDiv.className = "kb-row";

      rowItems.forEach((item) => {
        const btn = document.createElement("button");
        btn.className = "key";

        if (item === "SPACE") {
          btn.classList.add("space-key");
          btn.dataset.k = " ";
          btn.textContent = "SPACE";
        } else if (item === "SEND") {
          btn.classList.add("send-key");
          btn.dataset.action = "send";
          btn.textContent = "SEND";
        } else if (item === "⌫") {
          btn.classList.add("action-key");
          btn.dataset.action = "back";
          btn.textContent = "⌫";
        } else if (item === "⚡") {
          btn.classList.add("action-key");
          btn.dataset.action = "quick";
          btn.textContent = "⚡";
        } else if (item === "123" || item === "ABC") {
          btn.classList.add("action-key");
          btn.dataset.action = "mode";
          btn.textContent = item;
        } else {
          btn.dataset.k = item;
          btn.textContent = item;
        }

        rowDiv.appendChild(btn);
      });

      keyboardEl.appendChild(rowDiv);
    });
  }

  // Keyboard actions
  keyboardEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button.key");
    if (!btn) return;

    const action = btn.dataset.action;
    const key = btn.dataset.k;

    if (key !== undefined) {
      text += key;
      updateTextUI();
    } else if (action === "back") {
      text = text.slice(0, -1);
      updateTextUI();
    } else if (action === "mode") {
      kbMode = kbMode === "alpha" ? "num" : "alpha";
      renderKeyboard();
    } else if (action === "quick") {
      switchScreen("quick");
    } else if (action === "send") {
      dispatchPrompt();
    }
  });

  // Quick Action List Handling
  function updateQuickSelection() {
    const items = quickListEl.querySelectorAll(".quick-item");
    items.forEach((item, idx) => {
      item.classList.toggle("active", idx === quickIdx);
    });
  }

  quickListEl.addEventListener("click", (e) => {
    const item = e.target.closest(".quick-item");
    if (!item) return;
    text = item.dataset.text || "";
    updateTextUI();
    switchScreen("input");
  });

  function selectActiveQuick() {
    const items = quickListEl.querySelectorAll(".quick-item");
    if (items[quickIdx]) {
      text = items[quickIdx].dataset.text || "";
      updateTextUI();
      switchScreen("input");
    }
  }

  // ---- Status screen helpers ----
  function setStatus(icon, title, desc, reply, isErr) {
    statusIconEl.textContent = icon;
    statusIconEl.classList.toggle("err", !!isErr);
    statusTitleEl.textContent = title;
    statusDescEl.textContent = desc || "";
    statusReplyEl.textContent = reply || "";
    statusReplyEl.scrollTop = 0;
    screenStatus.classList.toggle("has-reply", !!reply);
  }

  function clearPending() {
    if (pending && pending.timer) clearTimeout(pending.timer);
    pending = null;
  }

  function extractReply(data) {
    if (!data) return "";
    let d = data.data !== undefined ? data.data : data.message;
    if (d === undefined || d === null) return "";
    if (typeof d === "string") {
      try {
        const o = JSON.parse(d);
        if (o && typeof o === "object") d = o;
        else return d;
      } catch (e) {
        return d;
      }
    }
    if (typeof d === "object") {
      return String(d.message || d.text || d.response || d.content || JSON.stringify(d));
    }
    return String(d);
  }

  function stripThink(s) {
    return String(s || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^\s*<think>[\s\S]*$/i, "").trim();
  }

  // PC: best-effort bridge via the r1's own assistant (no documented direct API to rabbit agent).
  function sendToPc(prompt, id) {
    if (typeof PluginMessageHandler === "undefined") {
      clearPending();
      setStatus("!", "Not on r1", "PluginMessageHandler missing; can't reach Rabbit.", "", true);
      return;
    }
    const msg =
      "Use OS3 to run this task on my connected computer \"" + PC_NAME +
      "\" via rabbit agent: " + prompt;
    try {
      PluginMessageHandler.postMessage(
        JSON.stringify({
          message: msg,
          useLLM: true,
          wantsR1Response: false,
          wantsJournalEntry: false
        })
      );
    } catch (e) {
      clearPending();
      setStatus("!", "Send failed", String(e && e.message ? e.message : e), "", true);
      return;
    }
    setStatus("…", "Sending…", "Waiting for a reply from Rabbit (best-effort bridge)…", "");
    pending.timer = setTimeout(() => {
      if (!pending || pending.id !== id) return;
      clearPending();
      setStatus("!", "No reply", "Sent to Rabbit; no reply received (30s). Check OS3 for the task.", "", true);
    }, REPLY_TIMEOUT_MS);
  }

  // OLLAMA: direct call to local model on the PC over LAN.
  async function sendToOllama(prompt, id) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    pending.timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, REPLY_TIMEOUT_MS);
    try {
      const res = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: [
            { role: "system", content: "You are a concise assistant shown on a tiny 240x282 screen. Answer briefly." },
            { role: "user", content: "/no_think " + prompt }
          ],
          max_tokens: 300,
          reasoning_effort: "none", // Ollama ignores /no_think now; this disables qwen3 thinking
          stream: false
        }),
        signal: ctrl ? ctrl.signal : undefined
      });
      if (!pending || pending.id !== id) return;
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error("HTTP " + res.status + (t ? ": " + t.slice(0, 200) : ""));
      }
      const j = await res.json();
      const out = stripThink(j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content);
      if (!pending || pending.id !== id) return;
      clearPending();
      setStatus("✓", "Reply", OLLAMA_MODEL, out || "(empty reply)");
    } catch (e) {
      if (!pending || pending.id !== id) return;
      clearPending();
      const aborted = e && e.name === "AbortError";
      if (!aborted && location.protocol === "https:" && OLLAMA_URL.indexOf("http:") === 0) {
        setStatus("!", "OLLAMA blocked", "OLLAMA blocked: page is HTTPS, PC is HTTP. Install the LAN (http) version of this creation to use OLLAMA.", "", true);
        return;
      }
      setStatus("!", aborted ? "Timed out" : "Error",
        aborted ? "No reply from Ollama in 30s." : "Can't reach Ollama: " + (e && e.message ? e.message : e),
        "", true);
    }
  }

  function dispatchPrompt() {
    if (!text.trim()) {
      textDisplayEl.classList.add("listening");
      setTimeout(() => textDisplayEl.classList.remove("listening"), 400);
      return;
    }

    const agent = AGENTS[currentAgentIdx];
    const prompt = text.trim();
    clearPending();
    const id = ++sendSeq;
    pending = { id: id, timer: null, agent: agent.id };

    statusMetaEl.textContent = "TARGET: " + agent.name + " (" + prompt.length + " chars)";
    setStatus("…", "Sending…", "", "");
    switchScreen("status");
    text = "";
    updateTextUI();

    if (agent.kind === "ollama") {
      sendToOllama(prompt, id);
    } else if (agent.kind === "pc") {
      sendToPc(prompt, id);
    } else {
      // Other agents: same best-effort bridge via the r1 assistant.
      if (typeof PluginMessageHandler === "undefined") {
        clearPending();
        setStatus("!", "Not on r1", "PluginMessageHandler missing; nothing sent.", "", true);
        return;
      }
      try {
        PluginMessageHandler.postMessage(JSON.stringify({
          message: "[AGENT TASK -> " + agent.name + "]: " + prompt,
          useLLM: true,
          wantsR1Response: false,
          wantsJournalEntry: false
        }));
      } catch (e) {
        clearPending();
        setStatus("!", "Send failed", String(e && e.message ? e.message : e), "", true);
        return;
      }
      setStatus("…", "Sending…", "Waiting for a reply from Rabbit…", "");
      pending.timer = setTimeout(() => {
        if (!pending || pending.id !== id) return;
        clearPending();
        setStatus("!", "No reply", "Sent to Rabbit; no reply received (30s).", "", true);
      }, REPLY_TIMEOUT_MS);
    }
  }

  // Hardware events (r1 bridge)
  window.addEventListener("sideClick", () => {
    if (currentScreen === "input") {
      dispatchPrompt();
    } else if (currentScreen === "quick") {
      selectActiveQuick();
    } else if (currentScreen === "status") {
      if (pending && pending.agent !== "ollama") clearPending();
      switchScreen("input");
    }
  });

  window.addEventListener("scrollUp", () => {
    if (currentScreen === "input") {
      currentAgentIdx = (currentAgentIdx - 1 + AGENTS.length) % AGENTS.length;
      updateAgentUI();
    } else if (currentScreen === "quick") {
      const count = quickListEl.children.length;
      quickIdx = (quickIdx - 1 + count) % count;
      updateQuickSelection();
    } else if (currentScreen === "status") {
      statusReplyEl.scrollTop -= 40;
    }
  });

  window.addEventListener("scrollDown", () => {
    if (currentScreen === "input") {
      currentAgentIdx = (currentAgentIdx + 1) % AGENTS.length;
      updateAgentUI();
    } else if (currentScreen === "quick") {
      const count = quickListEl.children.length;
      quickIdx = (quickIdx + 1) % count;
      updateQuickSelection();
    } else if (currentScreen === "status") {
      statusReplyEl.scrollTop += 40;
    }
  });

  // Voice STT support on side button hold
  window.addEventListener("longPressStart", () => {
    if (currentScreen === "input") {
      isListening = true;
      textDisplayEl.textContent = "Listening...";
      textDisplayEl.className = "listening";
      if (typeof CreationVoiceHandler !== "undefined") {
        CreationVoiceHandler.postMessage("start");
      }
    }
  });

  window.addEventListener("longPressEnd", () => {
    if (currentScreen === "input" && isListening) {
      isListening = false;
      if (typeof CreationVoiceHandler !== "undefined") {
        CreationVoiceHandler.postMessage("stop");
      }
    }
  });

  window.onPluginMessage = (data) => {
    if (!data) return;
    if (data.type === "sttEnded" && data.transcript) {
      text = (text ? text + " " : "") + data.transcript;
      updateTextUI();
      return;
    }
    if (data.type === "sttEnded") return;
    // Replies from the r1 assistant (bridge sends)
    if (pending && pending.agent !== "ollama") {
      const reply = extractReply(data);
      if (reply) {
        clearPending();
        setStatus("✓", "Reply", "From Rabbit", reply);
      }
    }
  };

  // Keyboard support for desktop simulation / testing
  window.addEventListener("keydown", (e) => {
    if (e.key === " " && e.target === document.body) {
      // Space simulation for sideClick
      window.dispatchEvent(new Event("sideClick"));
    } else if (e.key === "ArrowUp") {
      window.dispatchEvent(new Event("scrollUp"));
    } else if (e.key === "ArrowDown") {
      window.dispatchEvent(new Event("scrollDown"));
    }
  });

  // Init
  renderKeyboard();
  updateTextUI();
  loadState();
})();
