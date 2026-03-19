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
        if (App.sessionStore) {
          const sessions = await App.sessionStore.getSessions();
          const session = sessions.find(s => s.id === sessionId);
          if (session) return session;
        }

        const { sessions } = await App.data.sessions();
        return sessions.find(s => s.id === sessionId) || null;
      },

      async getTeam(sessionId, teamId) {
        if (App.sessionStore) {
          const teams = await App.sessionStore.getTeams(sessionId);
          const team = teams.find(t => t.id === teamId);
          if (team) return team;
        }

        const { sessions } = await App.data.sessions();
        const session = sessions.find(s => s.id === sessionId);
        return (session?.teams || []).find(t => t.id === teamId) || null;
      },

      async findTeamByCode(teamCode) {
        const code = App.util.normCode(teamCode);

        if (App.sessionStore) {
          const sessions = await App.sessionStore.getSessions();

          for (const s of sessions) {
            const teams = await App.sessionStore.getTeams(s.id);
            const team = teams.find(t => App.util.normCode(t.code) === code);
            if (team) return { session: s, team };
          }
        }

        const { sessions } = await App.data.sessions();
        for (const s of sessions) {
          const team = (s.teams || []).find(t => App.util.normCode(t.code) === code);
          if (team) return { session: s, team };
        }

        return null;
      },

      async getBoardsForSession(sessionId) {
        const { boards } = await App.data.boards();
        return boards;
      },

      async getBoardsForTeam(sessionId, teamId) {
        const all = await App.data.getBoardsForSession(sessionId);

        if (App.boardAssignments) {
          const assignedIds = await App.boardAssignments.getAssignedBoardIds(sessionId, teamId);
          if (assignedIds.length > 0) {
            return all.filter(b => assignedIds.includes(b.id));
          }
        }

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
      path(sessionId, teamId, boardId) {
        return `stamps/${sessionId}/${teamId}/${boardId}`;
      },

      dbRef(sessionId, teamId, boardId) {
        if (!window.FirebaseDb || !window.FirebaseDbApi) {
          throw new Error("Firebase not initialized.");
        }

        const { ref } = window.FirebaseDbApi;
        return ref(window.FirebaseDb, App.stamps.path(sessionId, teamId, boardId));
      },

      async get(sessionId, teamId, boardId) {
        const { get } = window.FirebaseDbApi;
        const snapshot = await get(App.stamps.dbRef(sessionId, teamId, boardId));
        return snapshot.exists() ? (snapshot.val() || {}) : {};
      },

      async set(sessionId, teamId, boardId, obj) {
        const { set } = window.FirebaseDbApi;
        await set(App.stamps.dbRef(sessionId, teamId, boardId), obj || {});
      },

      async isStamped(sessionId, teamId, boardId, tileIndex) {
        const s = await App.stamps.get(sessionId, teamId, boardId);
        return !!s[String(tileIndex)];
      },

      async toggle(sessionId, teamId, boardId, tileIndex) {
        const s = await App.stamps.get(sessionId, teamId, boardId);
        const k = String(tileIndex);
        s[k] = !s[k];
        await App.stamps.set(sessionId, teamId, boardId, s);
        return !!s[k];
      },

      async resetAll() {
        // Leave this disabled for now since Firebase reset should be targeted, not global.
        console.warn("resetAll() is not implemented for Firebase yet.");
      },

      subscribe(sessionId, teamId, boardId, callback) {
        const { onValue } = window.FirebaseDbApi;
        return onValue(App.stamps.dbRef(sessionId, teamId, boardId), (snapshot) => {
          callback(snapshot.exists() ? (snapshot.val() || {}) : {});
        });
      }
    },

    // ---------- Firebase session/team store ----------
    sessionStore: {
      sessionPath(sessionId = "") {
        return sessionId ? `sessions/${sessionId}` : "sessions";
      },

      teamPath(sessionId, teamId = "") {
        return teamId ? `teams/${sessionId}/${teamId}` : `teams/${sessionId}`;
      },

      dbRef(path) {
        if (!window.FirebaseDb || !window.FirebaseDbApi) {
          throw new Error("Firebase not initialized.");
        }

        const { ref } = window.FirebaseDbApi;
        return ref(window.FirebaseDb, path);
      },

      async getSessions() {
        const { get } = window.FirebaseDbApi;
        const snapshot = await get(App.sessionStore.dbRef(App.sessionStore.sessionPath()));
        const obj = snapshot.exists() ? (snapshot.val() || {}) : {};
        return Object.values(obj);
      },

      async getTeams(sessionId) {
        const { get } = window.FirebaseDbApi;
        const snapshot = await get(App.sessionStore.dbRef(App.sessionStore.teamPath(sessionId)));
        const obj = snapshot.exists() ? (snapshot.val() || {}) : {};
        return Object.values(obj);
      },

      async createSession(data) {
        const { push, set } = window.FirebaseDbApi;
        const sessionsRef = App.sessionStore.dbRef(App.sessionStore.sessionPath());
        const newRef = push(sessionsRef);
        const id = newRef.key;

        const session = {
          id,
          name: data.name || "New Session",
          era: data.era || "ARR",
          status: data.status || "active"
        };

        await set(newRef, session);
        return session;
      },

      async createTeam(sessionId, data) {
        const { push, set } = window.FirebaseDbApi;
        const teamsRef = App.sessionStore.dbRef(App.sessionStore.teamPath(sessionId));
        const newRef = push(teamsRef);
        const id = newRef.key;

        const team = {
          id,
          name: data.name || "New Team",
          code: data.code || "TEAM",
          region: data.region || "Unknown"
        };

        await set(newRef, team);
        return team;
      },

      subscribeSessions(callback) {
        const { onValue } = window.FirebaseDbApi;
        return onValue(App.sessionStore.dbRef(App.sessionStore.sessionPath()), (snapshot) => {
          const obj = snapshot.exists() ? (snapshot.val() || {}) : {};
          callback(Object.values(obj));
        });
      },

      subscribeTeams(sessionId, callback) {
        const { onValue } = window.FirebaseDbApi;
        return onValue(App.sessionStore.dbRef(App.sessionStore.teamPath(sessionId)), (snapshot) => {
          const obj = snapshot.exists() ? (snapshot.val() || {}) : {};
          callback(Object.values(obj));
        });
      },
      
      async deleteTeam(sessionId, teamId) {
        const { remove } = window.FirebaseDbApi;
        await remove(App.sessionStore.dbRef(App.sessionStore.teamPath(sessionId, teamId)));
      }
    },


    // ---------- Firebase board assignments ----------
    // ---------- Firebase board assignments ----------
    boardAssignments: {
      path(sessionId, teamId, boardId = "") {
        return boardId
            ? `boardAssignments/${sessionId}/${teamId}/${boardId}`
            : `boardAssignments/${sessionId}/${teamId}`;
      },

      dbRef(path) {
        if (!window.FirebaseDb || !window.FirebaseDbApi) {
          throw new Error("Firebase not initialized.");
        }

        const { ref } = window.FirebaseDbApi;
        return ref(window.FirebaseDb, path);
      },

      async getAssignedBoardIds(sessionId, teamId) {
        const { get } = window.FirebaseDbApi;
        const snapshot = await get(
            App.boardAssignments.dbRef(App.boardAssignments.path(sessionId, teamId))
        );

        const obj = snapshot.exists() ? (snapshot.val() || {}) : {};
        return Object.keys(obj).filter(boardId => !!obj[boardId]);
      },

      async assignBoard(sessionId, teamId, boardId) {
        const { set } = window.FirebaseDbApi;
        await set(
            App.boardAssignments.dbRef(App.boardAssignments.path(sessionId, teamId, boardId)),
            true
        );
      },

      async unassignBoard(sessionId, teamId, boardId) {
        const { remove } = window.FirebaseDbApi;
        await remove(
            App.boardAssignments.dbRef(App.boardAssignments.path(sessionId, teamId, boardId))
        );
      }
    },
    
    // ---------- Board page rendering ----------
    boardPage: {
      state: {
        sessionId: null,
        teamId: null,
        teamCode: null,
        boardIds: [],
        boardIndex: 0,
        unsubscribe: null,
        
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

        const team = await App.data.getTeam(sessionId, teamId);
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

          if (s.unsubscribe) {
            s.unsubscribe();
            s.unsubscribe = null;
          }

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
        
        if (s.unsubscribe) {
          s.unsubscribe();
          s.unsubscribe = null;
        }

        const [session, board] = await Promise.all([
          App.data.getSession(s.sessionId),
          App.data.getBoardById(boardId)
        ]);

        if (!session || !board) {
          App.boardPage.renderError("Failed to load board from mock JSON.");
          return;
        }

        const team = await App.data.getTeam(s.sessionId, s.teamId);
        if (!team) {
          App.boardPage.renderError("Unknown team. Return to landing page.");
          return;
        }
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
        const itemById = new Map(items.map(i => [i.id, i]))

        let stampState = await App.stamps.get(s.sessionId, s.teamId, board.id);

        grid.innerHTML = "";

        const tiles = board.tiles || [];

        for (let idx = 0; idx < tiles.length; idx++) {
          const tile = tiles[idx];
          const item = itemById.get(tile.itemId) || {
            name: "Unknown Item",
            description: "",
            category: "N/A"
          };

          const el = document.createElement("button");
          el.type = "button";
          el.className = "tile";
          el.setAttribute("role", "gridcell");
          el.setAttribute("aria-label", `${item.name}. Stamped status shown by host.`);

          const isStamped = !!stampState[String(idx)];
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

          grid.appendChild(el);
        }
        s.unsubscribe = App.stamps.subscribe(s.sessionId, s.teamId, board.id, (nextStampState) => {
          const tileEls = grid.querySelectorAll(".tile");
          tileEls.forEach((tileEl, idx) => {
            tileEl.classList.toggle("is-stamped", !!nextStampState[String(idx)]);
          });
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
