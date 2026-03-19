/* app.js — shared runtime for index + board + admin
   - Data access (mock JSON)
   - URL/query helpers
   - Local stamp store (localStorage)
   - Board rendering for board.html
*/

(function () {
  "use strict";

  const App = {
    config: {
      paths: {
        sessions: "data/sessions.json",
        boards: "data/boards.json",
        items: "data/items.json"
      },
      storagePrefix: "mhbingo.v1"
    },

    cache: {
      sessions: null,
      boards: null,
      items: null
    },

    // ---------- Utilities ----------
    util: {
      qs(sel, root = document) { return root.querySelector(sel); },
      qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); },

      clamp(n, min, max) { return Math.max(min, Math.min(max, n)); },

      normCode(s) {
        return String(s || "").trim().toUpperCase();
      },

      params() {
        return new URLSearchParams(window.location.search);
      },

      getParam(name, fallback = null) {
        const v = App.util.params().get(name);
        return v == null || v === "" ? fallback : v;
      },

      setStatus(el, msg, kind) {
        if (!el) return;
        el.textContent = msg || "";
        el.classList.remove("status--ok", "status--bad");
        if (kind === "ok") el.classList.add("status--ok");
        if (kind === "bad") el.classList.add("status--bad");
      },

      async fetchJson(path) {
        const res = await fetch(path, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
        return await res.json();
      },

      escapeHtml(s) {
        return String(s)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");
      }
    },

    // ---------- Data layer ----------
    data: {
      async sessions() {
        if (App.cache.sessions) return App.cache.sessions;
        const json = await App.util.fetchJson(App.config.paths.sessions);
        App.cache.sessions = json;
        return json;
      },

      async boards() {
        if (App.cache.boards) return App.cache.boards;
        const json = await App.util.fetchJson(App.config.paths.boards);
        App.cache.boards = json;
        return json;
      },

      async items() {
        if (App.cache.items) return App.cache.items;
        const json = await App.util.fetchJson(App.config.paths.items);
        App.cache.items = json;
        return json;
      },

      async getSession(sessionId) {
        const { sessions } = await App.data.sessions();
        return sessions.find(s => s.id === sessionId) || null;
      },

      async findTeamByCode(teamCode) {
        const code = App.util.normCode(teamCode);
        const { sessions } = await App.data.sessions();
        for (const s of sessions) {
          const team = (s.teams || []).find(t => App.util.normCode(t.code) === code);
          if (team) return { session: s, team };
        }
        return null;
      },

      async getBoardsForSession(sessionId) {
        const { boards } = await App.data.boards();
        return boards.filter(b => b.sessionId === sessionId);
      },

      async getBoardsForTeam(sessionId, teamId) {
        const all = await App.data.getBoardsForSession(sessionId);
        return all.filter(b => (b.teams || []).includes(teamId));
      },

      async getBoardById(boardId) {
        const { boards } = await App.data.boards();
        return boards.find(b => b.id === boardId) || null;
      },

      async getItemsByIds(ids) {
        const { items } = await App.data.items();
        const map = new Map(items.map(i => [i.id, i]));
        return ids.map(id => map.get(id)).filter(Boolean);
      }
    },

    // ---------- Local stamping store ----------
    stamps: {
      key(sessionId, teamId, boardId) {
        return `${App.config.storagePrefix}.stamps.${sessionId}.${teamId}.${boardId}`;
      },

      get(sessionId, teamId, boardId) {
        const k = App.stamps.key(sessionId, teamId, boardId);
        try {
          const raw = localStorage.getItem(k);
          if (!raw) return {};
          const parsed = JSON.parse(raw);
          return parsed && typeof parsed === "object" ? parsed : {};
        } catch {
          return {};
        }
      },

      set(sessionId, teamId, boardId, obj) {
        const k = App.stamps.key(sessionId, teamId, boardId);
        localStorage.setItem(k, JSON.stringify(obj || {}));
      },

      isStamped(sessionId, teamId, boardId, tileIndex) {
        const s = App.stamps.get(sessionId, teamId, boardId);
        return !!s[String(tileIndex)];
      },

      toggle(sessionId, teamId, boardId, tileIndex) {
        const s = App.stamps.get(sessionId, teamId, boardId);
        const k = String(tileIndex);
        s[k] = !s[k];
        App.stamps.set(sessionId, teamId, boardId, s);
        return !!s[k];
      },

      resetAll() {
        const prefix = `${App.config.storagePrefix}.stamps.`;
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(prefix)) toRemove.push(key);
        }
        toRemove.forEach(k => localStorage.removeItem(k));
      }
    },

    // ---------- Board page rendering ----------
    boardPage: {
      state: {
        sessionId: null,
        teamId: null,
        teamCode: null,
        boardIds: [],
        boardIndex: 0
      },

      async init() {
        const stage = App.util.qs("#boardStage");
        if (!stage) return; // Not on board page.

        const sessionId = App.util.getParam("session", null);
        const teamId = App.util.getParam("team", null);
        const boardIdFromUrl = App.util.getParam("board", null);

        if (!sessionId || !teamId) {
          App.boardPage.renderError("Missing session/team in URL. Return to landing page.");
          return;
        }

        App.boardPage.state.sessionId = sessionId;
        App.boardPage.state.teamId = teamId;

        const session = await App.data.getSession(sessionId);
        if (!session) {
          App.boardPage.renderError("Unknown session. Return to landing page.");
          return;
        }

        const team = (session.teams || []).find(t => t.id === teamId) || null;
        if (!team) {
          App.boardPage.renderError("Unknown team. Return to landing page.");
          return;
        }

        App.boardPage.state.teamCode = team.code;

        const boards = await App.data.getBoardsForTeam(sessionId, teamId);
        if (!boards.length) {
          App.boardPage.renderError("No boards assigned to this team (mock data).");
          return;
        }

        App.boardPage.state.boardIds = boards.map(b => b.id);

        let index = 0;
        if (boardIdFromUrl) {
          const found = App.boardPage.state.boardIds.indexOf(boardIdFromUrl);
          if (found >= 0) index = found;
        }
        App.boardPage.state.boardIndex = index;

        App.boardPage.wireNav();
        await App.boardPage.loadAndRenderCurrent();
      },

      wireNav() {
        const prevBtn = App.util.qs("#prevBoardBtn");
        const nextBtn = App.util.qs("#nextBoardBtn");

        const apply = async (delta) => {
          const s = App.boardPage.state;
          s.boardIndex = (s.boardIndex + delta + s.boardIds.length) % s.boardIds.length;
          const boardId = s.boardIds[s.boardIndex];

          const url = new URL(window.location.href);
          url.searchParams.set("board", boardId);
          history.replaceState({}, "", url.toString());

          await App.boardPage.loadAndRenderCurrent();
        };

        if (prevBtn) prevBtn.addEventListener("click", () => apply(-1));
        if (nextBtn) nextBtn.addEventListener("click", () => apply(+1));
      },

      renderError(message) {
        const meta = App.util.qs("#boardMeta");
        const title = App.util.qs("#boardTitle");
        if (title) title.textContent = "Board";
        if (meta) meta.textContent = message;
        const grid = App.util.qs("#boardGrid");
        if (grid) grid.innerHTML = "";
      },

      async loadAndRenderCurrent() {
        const s = App.boardPage.state;
        const boardId = s.boardIds[s.boardIndex];

        const [session, board] = await Promise.all([
          App.data.getSession(s.sessionId),
          App.data.getBoardById(boardId)
        ]);

        if (!session || !board) {
          App.boardPage.renderError("Failed to load board from mock JSON.");
          return;
        }

        const team = (session.teams || []).find(t => t.id === s.teamId);
        const boardTitle = App.util.qs("#boardTitle");
        const boardSubtitle = App.util.qs("#boardSubtitle");
        const boardMeta = App.util.qs("#boardMeta");

        if (boardTitle) boardTitle.textContent = `${team.name} — ${board.name}`;
        if (boardSubtitle) boardSubtitle.textContent = `${session.name} • ${team.code}`;
        if (boardMeta) {
          boardMeta.textContent = `Zone: ${board.zone.name} • Board ${s.boardIndex + 1} of ${s.boardIds.length} • Size: ${board.size}×${board.size}`;
        }

        // Zone background class
        const zoneBg = App.util.qs("#zoneBg");
        if (zoneBg) {
          zoneBg.className = "board-bg";
          if (board.zone && board.zone.cssClass) zoneBg.classList.add(board.zone.cssClass);
        }

        // Render grid
        const grid = App.util.qs("#boardGrid");
        if (!grid) return;

        document.documentElement.style.setProperty("--gridSize", String(board.size || 5));

        // Resolve items
        const itemIds = (board.tiles || []).map(t => t.itemId);
        const items = await App.data.getItemsByIds(itemIds);
        const itemById = new Map(items.map(i => [i.id, i]));

        grid.innerHTML = "";
        (board.tiles || []).forEach((tile, idx) => {
          const item = itemById.get(tile.itemId) || { name: "Unknown Item", description: "", category: "N/A" };

          const el = document.createElement("button");
          el.type = "button";
          el.className = "tile";
          el.setAttribute("role", "gridcell");
          el.setAttribute("aria-label", `${item.name}. Click to toggle stamp.`);

          const isStamped = App.stamps.isStamped(s.sessionId, s.teamId, board.id, idx);
          if (isStamped) el.classList.add("is-stamped");

          el.innerHTML = `
            <div class="tile__top">
              <div class="tile__name">${App.util.escapeHtml(item.name)}</div>
              <div class="tile__tag">${App.util.escapeHtml(item.category || "Item")}</div>
            </div>
            <div class="tile__body">
              <div class="tile__desc">${App.util.escapeHtml(item.description || "")}</div>
              <div class="tile__icon" aria-hidden="true"></div>
            </div>
            <div class="tile__stamp" aria-hidden="true"></div>
          `;

          el.addEventListener("click", () => {
            const now = App.stamps.toggle(s.sessionId, s.teamId, board.id, idx);
            el.classList.toggle("is-stamped", now);
          });

          grid.appendChild(el);
        });
      }
    },

    // ---------- Landing page ----------
    landingPage: {
      async init() {
        const form = App.util.qs("#teamForm");
        if (!form) return;

        const input = App.util.qs("#teamCode");
        const status = App.util.qs("#formStatus");

        // Pre-fill from last join (optional)
        try {
          const last = localStorage.getItem(`${App.config.storagePrefix}.lastTeamCode`);
          if (last && input) input.value = last;
        } catch { /* ignore */ }

        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          const code = App.util.normCode(input ? input.value : "");
          App.util.setStatus(status, "Validating…", null);

          if (!code) {
            App.util.setStatus(status, "Enter a team code.", "bad");
            return;
          }

          let found;
          try {
            found = await App.data.findTeamByCode(code);
          } catch (err) {
            App.util.setStatus(status, "Failed to load mock JSON. Use a local server.", "bad");
            return;
          }

          if (!found) {
            App.util.setStatus(status, `Unknown code: ${code}. Try ALPHA / BRAVO / CHARLIE.`, "bad");
            return;
          }

          const { session, team } = found;

          // Choose first board for this team (optional)
          const boards = await App.data.getBoardsForTeam(session.id, team.id);
          const firstBoardId = boards[0]?.id || "";

          try {
            localStorage.setItem(`${App.config.storagePrefix}.lastTeamCode`, code);
          } catch { /* ignore */ }

          App.util.setStatus(status, `OK — joining ${team.name} (${team.code})…`, "ok");

          const url = new URL("board.html", window.location.href);
          url.searchParams.set("session", session.id);
          url.searchParams.set("team", team.id);
          if (firstBoardId) url.searchParams.set("board", firstBoardId);

          window.location.href = url.toString();
        });
      }
    },

    // ---------- Boot ----------
    async init() {
      // Initialize per-page modules safely.
      await App.landingPage.init();
      await App.boardPage.init();
      // admin.js initializes itself.
    }
  };

  window.App = App;
  document.addEventListener("DOMContentLoaded", () => {
    App.init().catch(() => {
      // Keep failures quiet; pages render their own status lines where applicable.
    });
  });
})();
