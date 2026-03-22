/* app.js — shared runtime for index + board + admin
   - Data access (mock JSON)
   - URL/query helpers
   - Firebase-backed stamps
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


    catalog: {
      boardTypes: [
        { id: "monster-hunter", label: "Monster Hunter" },
        { id: "fishing", label: "Fishing" }
      ],

      expansions: [
        { id: "ARR", label: "ARR" },
        { id: "HW", label: "HW" },
        { id: "SB", label: "SB" },
        { id: "ShB", label: "ShB" },
        { id: "EW", label: "EW" },
        { id: "DT", label: "DT" }
      ],

      regionsByExpansion: {
        ARR: [
          { id: "la_noscea", label: "La Noscea", zoneId: "z_la_noscea", zoneName: "La Noscea", cssClass: "zone--limsa" },
          { id: "thanalan", label: "Thanalan", zoneId: "z_thanalan", zoneName: "Thanalan", cssClass: "zone--ul-dah" },
          { id: "black_shroud", label: "Black Shroud", zoneId: "z_black_shroud", zoneName: "Black Shroud", cssClass: "zone--gridania" },
          { id: "coerthas", label: "Coerthas", zoneId: "z_coerthas", zoneName: "Coerthas", cssClass: "zone--coerthas" },
          { id: "mor_dhona", label: "Mor Dhona", zoneId: "z_mor_dhona", zoneName: "Mor Dhona", cssClass: "zone--coerthas" }
        ]
      },

      backgroundThemes: [
        { id: "theme--la-noscea", label: "La Noscea" },
        { id: "theme--thanalan", label: "Thanalan" },
        { id: "theme--black-shroud", label: "Black Shroud" },
        { id: "theme--coerthas", label: "Coerthas" }
      ],

      getRegions(expansionId) {
        return App.catalog.regionsByExpansion[expansionId] || [];
      },

      getRegion(expansionId, regionId) {
        return App.catalog.getRegions(expansionId).find(r => r.id === regionId) || null;
      },

      makeZone(expansionId, regionId) {
        const region = App.catalog.getRegion(expansionId, regionId);
        if (!region) {
          return { id: regionId || "", name: regionId || "Unknown", cssClass: "" };
        }

        return {
          id: region.zoneId,
          name: region.zoneName,
          cssClass: region.cssClass
        };
      },

      inferThemeId(expansionId, regionId, zone = null) {
        const key = `${regionId || ""} ${zone?.cssClass || ""} ${zone?.name || ""}`.toLowerCase();

        if (key.includes("noscea") || key.includes("limsa")) return "theme--la-noscea";
        if (key.includes("thanalan") || key.includes("ul-dah") || key.includes("uldah")) return "theme--thanalan";
        if (key.includes("shroud") || key.includes("gridania")) return "theme--black-shroud";
        if (key.includes("coerthas")) return "theme--coerthas";

        return "";
      }
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
        if (App.boardStore) {
          const boards = await App.boardStore.getBoards();
          return sessionId ? boards.filter(b => !b.sessionId || b.sessionId === sessionId) : boards;
        }

        const { boards } = await App.data.boards();
        return boards;
      },

      async getBoardsForTeam(sessionId, teamId) {
        const all = await App.data.getBoardsForSession(sessionId);

        if (App.boardAssignments) {
          const assignedIds = await App.boardAssignments.getAssignedBoardIds(sessionId, teamId);
          return all.filter(b => assignedIds.includes(b.id));
        }

        return all.filter(b => (b.teams || []).includes(teamId));
      },

      async getBoardById(boardId) {
        if (App.boardStore) {
          const board = await App.boardStore.getBoardById(boardId);
          if (board) return board;
        }

        const { boards } = await App.data.boards();
        return boards.find(b => b.id === boardId) || null;
      },

      async getItemsByIds(ids) {
        const { items } = await App.data.items();
        const map = new Map(items.map(i => [i.id, i]));
        return ids.map(id => map.get(id)).filter(Boolean);
      }
    },

    // ---------- Firebase boards ----------
    boardStore: {
      path(boardId = "") {
        return boardId ? `boards/${boardId}` : "boards";
      },

      rawRef(path) {
        if (!window.FirebaseDb || !window.FirebaseDbApi) {
          throw new Error("Firebase not initialized.");
        }

        const { ref } = window.FirebaseDbApi;
        return ref(window.FirebaseDb, path);
      },

      dbRef(boardId = "") {
        return App.boardStore.rawRef(App.boardStore.path(boardId));
      },

      ensureTileShape(size, tiles) {
        const total = Math.max(1, Number(size) || 5) ** 2;
        const next = Array.isArray(tiles) ? tiles.slice(0, total) : [];

        while (next.length < total) {
          next.push({ itemId: "", amount: 1, descriptionOverride: "", commentOverride: "", valueOverride: null, hideNameForPlayers: false });
        }

        return next.map((tile, index) => ({
          index,
          itemId: tile?.itemId || "",
          amount: Number(tile?.amount) > 0 ? Number(tile.amount) : 1,
          descriptionOverride: tile?.descriptionOverride || "",
          commentOverride: tile?.commentOverride || "",
          valueOverride: tile?.valueOverride ?? null,
          hideNameForPlayers: !!tile?.hideNameForPlayers
        }));
      },

      normalize(board) {
        const size = Math.max(1, Number(board?.size) || 5);
        const expansion = board?.expansion || board?.era || "ARR";
        const region = board?.region || "";
        const zone = App.catalog.makeZone(expansion, region);
        const backgroundTheme = board?.backgroundTheme || App.catalog.inferThemeId(expansion, region, zone);
        
        return {
          id: board?.id || "",
          sessionId: board?.sessionId || "",
          name: board?.name || "Untitled Board",
          boardType: board?.boardType || "monster-hunter",
          expansion,
          era: expansion,
          region,
          zone,
          backgroundTheme,
          size,
          status: board?.status || "draft",
          version: Number(board?.version) || 1,
          createdAt: board?.createdAt || Date.now(),
          updatedAt: board?.updatedAt || Date.now(),
          tiles: App.boardStore.ensureTileShape(size, board?.tiles || []),
          teams: Array.isArray(board?.teams) ? board.teams : []
        };
      },

      async getBoards() {
        try {
          const { get } = window.FirebaseDbApi;
          const snapshot = await get(App.boardStore.dbRef());
          if (snapshot.exists()) {
            const obj = snapshot.val() || {};
            return Object.values(obj).map(App.boardStore.normalize).sort((a, b) => String(a.name).localeCompare(String(b.name)));
          }
        } catch {
          // fall back to JSON
        }

        const { boards } = await App.data.boards();
        return (boards || []).map(App.boardStore.normalize).sort((a, b) => String(a.name).localeCompare(String(b.name)));
      },

      async getBoardById(boardId) {
        if (!boardId) return null;

        try {
          const { get } = window.FirebaseDbApi;
          const snapshot = await get(App.boardStore.dbRef(boardId));
          if (snapshot.exists()) {
            return App.boardStore.normalize(snapshot.val() || {});
          }
        } catch {
          // fall back to JSON
        }

        const { boards } = await App.data.boards();
        return (boards || []).map(App.boardStore.normalize).find(b => b.id === boardId) || null;
      },

      async waitForFirebaseUser(timeoutMs = 2000) {
        const auth = window.FirebaseAuth;
        const authApi = window.FirebaseAuthApi;

        if (!auth || !authApi?.onAuthStateChanged) {
          return null;
        }

        if (auth.currentUser) {
          return auth.currentUser;
        }

        return new Promise((resolve) => {
          let settled = false;
          let unsubscribe = null;
          const finish = (user) => {
            if (settled) return;
            settled = true;
            if (unsubscribe) unsubscribe();
            resolve(user || auth.currentUser || null);
          };

          const timer = window.setTimeout(() => finish(null), timeoutMs);
          unsubscribe = authApi.onAuthStateChanged(auth, (user) => {
            window.clearTimeout(timer);
            finish(user);
          }, () => {
            window.clearTimeout(timer);
            finish(null);
          });
        });
      },

      async ensureAdminWriteAccess() {
        const adminUid = window.FirebaseAdmin?.uid || "";
        const user = await App.boardStore.waitForFirebaseUser();

        if (!user) {
          const err = new Error("Admin session is not ready yet.");
          err.code = "auth/not-ready";
          throw err;
        }

        if (adminUid && user.uid !== adminUid) {
          const err = new Error("This account is not allowed to edit boards.");
          err.code = "auth/unauthorized-admin";
          throw err;
        }

        return user;
      },

      async createBoard(board) {
        await App.boardStore.ensureAdminWriteAccess();
        const { push, set } = window.FirebaseDbApi;
        const ref = push(App.boardStore.dbRef());
        const payload = App.boardStore.normalize({
          ...board,
          id: ref.key,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1
        });
        await set(ref, payload);
        return payload;
      },

      async saveBoard(board) {
        await App.boardStore.ensureAdminWriteAccess();
        const { set } = window.FirebaseDbApi;
        const existing = await App.boardStore.getBoardById(board.id);
        const payload = App.boardStore.normalize({
          ...existing,
          ...board,
          updatedAt: Date.now(),
          version: (Number(existing?.version) || 0) + 1
        });
        await set(App.boardStore.dbRef(payload.id), payload);
        return payload;
      },

      async deleteBoard(boardId) {
        await App.boardStore.ensureAdminWriteAccess();
        const { remove } = window.FirebaseDbApi;
        await remove(App.boardStore.dbRef(boardId));
      },

      subscribeBoards(callback) {
        const { onValue } = window.FirebaseDbApi;
        return onValue(App.boardStore.dbRef(), (snapshot) => {
          const obj = snapshot.exists() ? (snapshot.val() || {}) : {};
          const boards = Object.values(obj).map(App.boardStore.normalize).sort((a, b) => String(a.name).localeCompare(String(b.name)));
          callback(boards);
        });
      },

      subscribeBoard(boardId, callback) {
        const { onValue } = window.FirebaseDbApi;
        return onValue(App.boardStore.dbRef(boardId), (snapshot) => {
          callback(snapshot.exists() ? App.boardStore.normalize(snapshot.val() || {}) : null);
        });
      }
    },

    // ---------- Firebase stamps ----------
    stamps: {
      path(sessionId, teamId, boardId) {
        return `stamps/${sessionId}/${teamId}/${boardId}`;
      },

      teamPath(sessionId, teamId) {
        return `stamps/${sessionId}/${teamId}`;
      },

      sessionPath(sessionId) {
        return `stamps/${sessionId}`;
      },

      tilePath(sessionId, teamId, boardId, tileIndex) {
        return `stamps/${sessionId}/${teamId}/${boardId}/${tileIndex}`;
      },

      rawRef(path) {
        if (!window.FirebaseDb || !window.FirebaseDbApi) {
          throw new Error("Firebase not initialized.");
        }

        const { ref } = window.FirebaseDbApi;
        return ref(window.FirebaseDb, path);
      },

      dbRef(sessionId, teamId, boardId) {
        return App.stamps.rawRef(App.stamps.path(sessionId, teamId, boardId));
      },

      teamRef(sessionId, teamId) {
        return App.stamps.rawRef(App.stamps.teamPath(sessionId, teamId));
      },

      tileRef(sessionId, teamId, boardId, tileIndex) {
        return App.stamps.rawRef(App.stamps.tilePath(sessionId, teamId, boardId, tileIndex));
      },

      makeStampData() {
        return {
          stamped: true,
          x: +(Math.random() * 33 - 16.5).toFixed(2),
          y: +(Math.random() * 33 - 16.5).toFixed(2),
          rot: +(Math.random() * 320 - 160).toFixed(2),
          scale: +(0.92 + Math.random() * 0.25).toFixed(3)
        };
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
        const { get } = window.FirebaseDbApi;
        const snapshot = await get(App.stamps.tileRef(sessionId, teamId, boardId, tileIndex));
        return !!snapshot.val()?.stamped;
      },

      async toggle(sessionId, teamId, boardId, tileIndex) {
        const { runTransaction } = window.FirebaseDbApi;
        const nextStamp = App.stamps.makeStampData();

        const result = await runTransaction(
            App.stamps.tileRef(sessionId, teamId, boardId, tileIndex),
            (current) => {
              if (current?.stamped) {
                return null;
              }

              return nextStamp;
            }
        );

        return result.snapshot.exists() ? (result.snapshot.val() || null) : null;
      },

      async resetAll() {
        console.warn("resetAll() is not implemented for Firebase yet.");
      },

      async resetSession(sessionId) {
        const { remove } = window.FirebaseDbApi;
        await remove(App.stamps.rawRef(App.stamps.sessionPath(sessionId)));
      },

      async resetTeam(sessionId, teamId) {
        const { remove } = window.FirebaseDbApi;
        await remove(App.stamps.teamRef(sessionId, teamId));
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
          code: data.code || "TEAM"
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

      async deleteSession(sessionId) {
        const { remove } = window.FirebaseDbApi;
        await Promise.all([
          remove(App.sessionStore.dbRef(App.sessionStore.sessionPath(sessionId))),
          remove(App.sessionStore.dbRef(App.sessionStore.teamPath(sessionId))),
          App.stamps.resetSession(sessionId),
          App.boardAssignments.resetSession(sessionId)
        ]);
      },

      async deleteTeam(sessionId, teamId) {
        const { remove } = window.FirebaseDbApi;
        await Promise.all([
          remove(App.sessionStore.dbRef(App.sessionStore.teamPath(sessionId, teamId))),
          App.stamps.resetTeam(sessionId, teamId),
          App.boardAssignments.resetTeam(sessionId, teamId)
        ]);
      }
    },

    // ---------- Firebase board assignments ----------
    boardAssignments: {
      sessionPath(sessionId) {
        return `boardAssignments/${sessionId}`;
      },

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
      },

      async resetSession(sessionId) {
        const { remove } = window.FirebaseDbApi;
        await remove(App.boardAssignments.dbRef(App.boardAssignments.sessionPath(sessionId)));
      },

      async resetTeam(sessionId, teamId) {
        const { remove } = window.FirebaseDbApi;
        await remove(App.boardAssignments.dbRef(App.boardAssignments.path(sessionId, teamId)));
      },

      subscribe(sessionId, teamId, callback) {
        const { onValue } = window.FirebaseDbApi;
        return onValue(
            App.boardAssignments.dbRef(App.boardAssignments.path(sessionId, teamId)),
            (snapshot) => {
              const obj = snapshot.exists() ? (snapshot.val() || {}) : {};
              const boardIds = Object.keys(obj).filter(boardId => !!obj[boardId]);
              callback(boardIds);
            }
        );
      }
    },

    // ---------- Stamp FX ----------
    stampFx: {
      audioBuffer: null,
      audioContext: null,
      audioReady: null,
      armBound: false,

      async ensureContext() {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) throw new Error("Web Audio not supported.");

        if (!App.stampFx.audioContext) {
          App.stampFx.audioContext = new Ctx();
        }

        if (App.stampFx.audioContext.state === "suspended") {
          try {
            await App.stampFx.audioContext.resume();
          } catch {
            // ignore resume failures until the user interacts
          }
        }

        return App.stampFx.audioContext;
      },

      armOnInteraction() {
        if (App.stampFx.armBound) return;
        App.stampFx.armBound = true;

        const arm = () => {
          App.stampFx.ensureContext().catch(() => {
            // ignore
          });
        };

        window.addEventListener("pointerdown", arm, { passive: true });
        window.addEventListener("keydown", arm, { passive: true });
        window.addEventListener("touchstart", arm, { passive: true });
      },

      async ensureAudio() {
        if (App.stampFx.audioBuffer) return App.stampFx.audioBuffer;
        if (App.stampFx.audioReady) return App.stampFx.audioReady;

        App.stampFx.audioReady = (async () => {
          const ctx = await App.stampFx.ensureContext();
          const res = await fetch("/assets/stamp-hit.mp3");
          const arrayBuffer = await res.arrayBuffer();
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          App.stampFx.audioBuffer = audioBuffer;
          return audioBuffer;
        })();

        return App.stampFx.audioReady;
      },

      async playHit() {
        try {
          const buffer = await App.stampFx.ensureAudio();
          const ctx = await App.stampFx.ensureContext();

          const source = ctx.createBufferSource();
          const gain = ctx.createGain();

          gain.gain.value = 0.9;
          source.buffer = buffer;
          source.connect(gain);
          gain.connect(ctx.destination);

          source.start(0, 0.13);
        } catch {
          // ignore audio failures
        }
      },

      randomizeStamp(tileEl) {
        const stampImg = tileEl.querySelector(".tile__stamp-img");
        if (!stampImg) return;

        const rotation = (Math.random() * 320 - 160).toFixed(2);
        const offsetX = (Math.random() * 33 - 16.5).toFixed(2);
        const offsetY = (Math.random() * 33 - 16.5).toFixed(2);
        const scale = (0.92 + Math.random() * 0.25).toFixed(3);

        stampImg.style.setProperty("--stamp-rot", `${rotation}deg`);
        stampImg.style.setProperty("--stamp-x", `${offsetX}px`);
        stampImg.style.setProperty("--stamp-y", `${offsetY}px`);
        stampImg.style.setProperty("--stamp-scale", scale);
      },

      applySaved(tileEl, stampData) {
        const stampImg = tileEl.querySelector(".tile__stamp-img");
        if (!stampImg || !stampData?.stamped) return;

        stampImg.style.setProperty("--stamp-x", `${stampData.x ?? 0}px`);
        stampImg.style.setProperty("--stamp-y", `${stampData.y ?? 0}px`);
        stampImg.style.setProperty("--stamp-rot", `${stampData.rot ?? 0}deg`);
        stampImg.style.setProperty("--stamp-scale", `${stampData.scale ?? 1}`);
      },

      clearSaved(tileEl) {
        const stampImg = tileEl.querySelector(".tile__stamp-img");
        if (!stampImg) return;

        stampImg.style.removeProperty("--stamp-x");
        stampImg.style.removeProperty("--stamp-y");
        stampImg.style.removeProperty("--stamp-rot");
        stampImg.style.removeProperty("--stamp-scale");

        tileEl.classList.remove("stamp-pop");
      },

      animateIn(tileEl) {
        tileEl.classList.remove("stamp-pop");
        void tileEl.offsetWidth;
        tileEl.classList.add("stamp-pop");

        window.setTimeout(() => {
          App.stampFx.playHit();
        }, 0);
      }
    },


    // ---------- Bingo FX ----------
    bingoFx: {
      svgNs: "http://www.w3.org/2000/svg",
      audioBuffer: null,
      audioReady: null,

      getLineDefs(size) {
        const lines = [];

        for (let row = 0; row < size; row += 1) {
          lines.push({
            key: `row-${row}`,
            cells: Array.from({ length: size }, (_, col) => row * size + col)
          });
        }

        for (let col = 0; col < size; col += 1) {
          lines.push({
            key: `col-${col}`,
            cells: Array.from({ length: size }, (_, row) => row * size + col)
          });
        }

        lines.push({
          key: "diag-main",
          cells: Array.from({ length: size }, (_, i) => i * size + i)
        });

        lines.push({
          key: "diag-anti",
          cells: Array.from({ length: size }, (_, i) => i * size + (size - 1 - i))
        });

        return lines;
      },

      getCompletedLines(size, stampState) {
        if (!size || !stampState) return [];

        return App.bingoFx.getLineDefs(size).filter((line) => {
          return line.cells.every((idx) => !!stampState[String(idx)]?.stamped);
        });
      },

      getCompletedLineKeys(size, stampState) {
        return App.bingoFx.getCompletedLines(size, stampState).map((line) => line.key);
      },

      makeSeed(key) {
        let h = 2166136261;
        const str = String(key || "bingo");

        for (let i = 0; i < str.length; i += 1) {
          h ^= str.charCodeAt(i);
          h = Math.imul(h, 16777619);
        }

        return () => {
          h += 0x6D2B79F5;
          let t = h;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      },

      getRelativePoint(gridEl, tileEl) {
        const gridRect = gridEl.getBoundingClientRect();
        const tileRect = tileEl.getBoundingClientRect();

        return {
          x: tileRect.left - gridRect.left + tileRect.width / 2,
          y: tileRect.top - gridRect.top + tileRect.height / 2
        };
      },

      extendEndpoints(points) {
        if (points.length < 2) return points.slice();

        const next = points[1];
        const prev = points[points.length - 2];
        const first = { ...points[0] };
        const last = { ...points[points.length - 1] };

        const dx1 = next.x - first.x;
        const dy1 = next.y - first.y;
        const len1 = Math.hypot(dx1, dy1) || 1;
        const dx2 = last.x - prev.x;
        const dy2 = last.y - prev.y;
        const len2 = Math.hypot(dx2, dy2) || 1;
        const extend = Math.min(len1, len2) * 0.10;

        first.x -= (dx1 / len1) * extend;
        first.y -= (dy1 / len1) * extend;
        last.x += (dx2 / len2) * extend;
        last.y += (dy2 / len2) * extend;

        return [first, ...points.slice(1, -1), last];
      },

      jitterPoints(points, lineKey, size) {
        if (points.length < 3) return points.slice();

        const rand = App.bingoFx.makeSeed(lineKey);
        const first = points[0];
        const last = points[points.length - 1];
        const dx = last.x - first.x;
        const dy = last.y - first.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const jitter = Math.max(0.75, Math.min(2.5, (Math.min(size?.width || 0, size?.height || 0) || 180) / 180));

        return points.map((point, idx) => {
          if (idx === 0 || idx === points.length - 1) return { ...point };

          const t = idx / (points.length - 1);
          const centerWeight = 1 - Math.abs(t - 0.5) * 1.6;
          const offset = (rand() - 0.5) * jitter * Math.max(0.2, centerWeight);

          return {
            x: point.x + nx * offset,
            y: point.y + ny * offset
          };
        });
      },

      buildPath(points) {
        if (!points.length) return "";
        if (points.length === 1) {
          return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
        }
        if (points.length === 2) {
          return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} L ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;
        }

        let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

        for (let i = 1; i < points.length - 1; i += 1) {
          const midX = (points[i].x + points[i + 1].x) / 2;
          const midY = (points[i].y + points[i + 1].y) / 2;
          d += ` Q ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`;
        }

        const penultimate = points[points.length - 2];
        const last = points[points.length - 1];
        d += ` Q ${penultimate.x.toFixed(2)} ${penultimate.y.toFixed(2)} ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;

        return d;
      },

      watchLayout(targetEl, callback) {
        if (!targetEl || typeof callback !== "function") return () => {};

        let rafId = null;
        const run = () => {
          if (rafId != null) {
            window.cancelAnimationFrame(rafId);
          }

          rafId = window.requestAnimationFrame(() => {
            rafId = null;
            callback();
          });
        };

        if (window.ResizeObserver) {
          const ro = new ResizeObserver(() => run());
          ro.observe(targetEl);
          return () => {
            if (rafId != null) window.cancelAnimationFrame(rafId);
            ro.disconnect();
          };
        }

        window.addEventListener("resize", run);
        return () => {
          if (rafId != null) window.cancelAnimationFrame(rafId);
          window.removeEventListener("resize", run);
        };
      },

      renderOverlay({ gridEl, overlayEl, size, stampState, newLineKeys = [] }) {
        if (!gridEl || !overlayEl) return;

        const width = gridEl.clientWidth || 0;
        const height = gridEl.clientHeight || 0;
        overlayEl.innerHTML = "";
        overlayEl.setAttribute("viewBox", `0 0 ${width} ${height}`);
        overlayEl.setAttribute("preserveAspectRatio", "none");

        if (!width || !height) return;

        const completedLines = App.bingoFx.getCompletedLines(size, stampState);
        if (!completedLines.length) return;

        const tileEls = Array.from(gridEl.children);
        const newSet = new Set(newLineKeys || []);
        const strokeWidth = Math.max(9, Math.min(14, Math.min(width, height) / 24));

        completedLines.forEach((line) => {
          const rawPoints = line.cells
            .map((idx) => tileEls[idx])
            .filter(Boolean)
            .map((tileEl) => App.bingoFx.getRelativePoint(gridEl, tileEl));

          if (rawPoints.length !== line.cells.length) return;

          const extended = App.bingoFx.extendEndpoints(rawPoints);
          const points = App.bingoFx.jitterPoints(extended, line.key, { width, height });
          const d = App.bingoFx.buildPath(points);
          if (!d) return;

          const group = document.createElementNS(App.bingoFx.svgNs, "g");
          group.setAttribute("class", `bingo-stroke${newSet.has(line.key) ? " is-new" : ""}`);

          const shadow = document.createElementNS(App.bingoFx.svgNs, "path");
          shadow.setAttribute("class", "bingo-stroke__shadow");
          shadow.setAttribute("d", d);
          shadow.setAttribute("stroke-width", String(strokeWidth * 1.25));

          const main = document.createElementNS(App.bingoFx.svgNs, "path");
          main.setAttribute("class", "bingo-stroke__main");
          main.setAttribute("d", d);
          main.setAttribute("stroke-width", String(strokeWidth));

          const highlight = document.createElementNS(App.bingoFx.svgNs, "path");
          highlight.setAttribute("class", "bingo-stroke__highlight");
          highlight.setAttribute("d", d);
          highlight.setAttribute("stroke-width", String(Math.max(2.5, strokeWidth * 0.18)));

          group.appendChild(shadow);
          group.appendChild(main);
          group.appendChild(highlight);
          overlayEl.appendChild(group);

          if (newSet.has(line.key)) {
            [shadow, main, highlight].forEach((pathEl) => {
              try {
                const len = pathEl.getTotalLength();
                pathEl.style.setProperty("--path-len", `${len}`);
                pathEl.style.strokeDasharray = `${len}`;
                pathEl.style.strokeDashoffset = `${len}`;
              } catch {
                // ignore svg length failures
              }
            });
          }
        });
      },

      renderOverlayNextFrame(options) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            App.bingoFx.renderOverlay(options);
          });
        });
      },

      async ensureAudio() {
        if (App.bingoFx.audioBuffer) return App.bingoFx.audioBuffer;
        if (App.bingoFx.audioReady) return App.bingoFx.audioReady;

        App.bingoFx.audioReady = (async () => {
          const ctx = await App.stampFx.ensureContext();
          const res = await fetch("/assets/bingojingle.mp3");
          const arrayBuffer = await res.arrayBuffer();
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          App.bingoFx.audioBuffer = audioBuffer;
          return audioBuffer;
        })();

        return App.bingoFx.audioReady;
      },

      async playJingle() {
        try {
          const ctx = await App.stampFx.ensureContext();
          const buffer = await App.bingoFx.ensureAudio();

          const source = ctx.createBufferSource();
          const gain = ctx.createGain();

          source.buffer = buffer;
          gain.gain.value = 0.9;

          source.connect(gain);
          gain.connect(ctx.destination);

          source.start(0);
        } catch {
          // ignore audio failures
        }
      }
    },

    // ---------- Board page rendering ----------
    boardPage: {
      themeClasses: [
        "theme--la-noscea",
        "theme--thanalan",
        "theme--black-shroud",
        "theme--coerthas"
      ],

      getThemeClass(boardOrZone) {
        if (boardOrZone?.backgroundTheme) return boardOrZone.backgroundTheme;

        const zone = boardOrZone?.zone ? boardOrZone.zone : boardOrZone;
        const key = `${zone?.cssClass || ""} ${zone?.name || ""}`.toLowerCase();

        if (key.includes("limsa") || key.includes("noscea")) return "theme--la-noscea";
        if (key.includes("ul-dah") || key.includes("uldah") || key.includes("thanalan")) return "theme--thanalan";
        if (key.includes("gridania") || key.includes("shroud")) return "theme--black-shroud";
        if (key.includes("coerthas")) return "theme--coerthas";

        return "";
      },

      applyPageTheme(boardOrZone) {
        const body = document.body;
        if (!body) return;

        body.classList.remove(...App.boardPage.themeClasses, "page--board-themed");

        const themeClass = App.boardPage.getThemeClass(boardOrZone);
        if (themeClass) {
          body.classList.add("page--board-themed", themeClass);
        }
      },

      clearPageTheme() {
        const body = document.body;
        if (!body) return;

        body.classList.remove(...App.boardPage.themeClasses, "page--board-themed");
      },
      hideTileInfo() {
        App.util.qsa("#boardGrid .tile.is-info-open").forEach((tile) => {
          if (!tile.classList.contains("is-info-pinned")) {
            tile.classList.remove("is-info-open");
          }
        });
      },

      showTileInfo(tileEl, item, amount) {
        if (!tileEl) return;
        const card = App.util.qs(".tile__info-card", tileEl);
        if (!card) return;

        const amountEl = App.util.qs(".tile__info-card__amount", card);
        const categoryEl = App.util.qs(".tile__info-card__category", card);
        const titleEl = App.util.qs(".tile__info-card__title", card);
        const descEl = App.util.qs(".tile__info-card__desc", card);
        const loreEl = App.util.qs(".tile__info-card__lore", card);

        if (amountEl) amountEl.textContent = `x${amount}`;
        if (categoryEl) categoryEl.textContent = item.category || "Item";
        if (titleEl) titleEl.textContent = item.name || "Unknown Item";
        if (descEl) descEl.textContent = item.description || "";
        if (loreEl) loreEl.textContent = item.lore || item.description || "";

        tileEl.classList.add("is-info-open");
      },

      bindTileInfo(tileEl, item, amount) {
        if (!tileEl) return;

        if (!App.boardPage._outsideBound) {
          document.addEventListener("click", (e) => {
            if (e.target.closest("#boardGrid .tile")) return;
            App.util.qsa("#boardGrid .tile.is-info-pinned, #boardGrid .tile.is-info-open").forEach((tile) => {
              tile.classList.remove("is-info-pinned", "is-info-open");
            });
          });
          App.boardPage._outsideBound = true;
        }

        tileEl.addEventListener("mouseenter", () => {
          App.boardPage.showTileInfo(tileEl, item, amount);
        });

        tileEl.addEventListener("mouseleave", () => {
          if (!tileEl.classList.contains("is-info-pinned")) {
            tileEl.classList.remove("is-info-open");
          }
        });

        tileEl.addEventListener("focus", () => {
          App.boardPage.showTileInfo(tileEl, item, amount);
        });

        tileEl.addEventListener("blur", () => {
          if (!tileEl.classList.contains("is-info-pinned")) {
            tileEl.classList.remove("is-info-open");
          }
        });

        tileEl.addEventListener("click", (e) => {
          e.preventDefault();
          const shouldPin = !tileEl.classList.contains("is-info-pinned");
          App.util.qsa("#boardGrid .tile.is-info-pinned").forEach((tile) => {
            if (tile !== tileEl) tile.classList.remove("is-info-pinned", "is-info-open");
          });
          tileEl.classList.toggle("is-info-pinned", shouldPin);
          if (shouldPin) {
            App.boardPage.showTileInfo(tileEl, item, amount);
          } else {
            tileEl.classList.remove("is-info-open");
          }
        });
      },

      state: {
        sessionId: null,
        teamId: null,
        teamCode: null,
        boardIds: [],
        boardIndex: 0,
        unsubscribe: null,
        assignmentUnsubscribe: null,
        overlayResizeCleanup: null,
        currentBoardId: null,
        currentBoardSize: 5,
        currentStampState: {},
        activeBingoKeys: []
      },

      async init() {
        const stage = App.util.qs("#boardStage");
        if (!stage) return;

        App.stampFx.armOnInteraction();

        if (App.boardPage.state.assignmentUnsubscribe) {
          App.boardPage.state.assignmentUnsubscribe();
          App.boardPage.state.assignmentUnsubscribe = null;
        }

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
        App.boardPage.state.boardIds = boards.map((b) => b.id);

        let index = 0;
        if (boardIdFromUrl) {
          const found = App.boardPage.state.boardIds.indexOf(boardIdFromUrl);
          if (found >= 0) index = found;
        }
        App.boardPage.state.boardIndex = index;

        if (!App.boardPage.state.boardIds.length) {
          App.boardPage.renderError("No boards assigned to this team.");
        }

        if (App.boardPage.state.assignmentUnsubscribe) {
          App.boardPage.state.assignmentUnsubscribe();
          App.boardPage.state.assignmentUnsubscribe = null;
        }

        App.boardPage.state.assignmentUnsubscribe = App.boardAssignments.subscribe(sessionId, teamId, async (assignedBoardIds) => {
          const currentBoardId = App.boardPage.state.boardIds[App.boardPage.state.boardIndex] || null;
          const nextBoardIds = assignedBoardIds;

          App.boardPage.state.boardIds = nextBoardIds;

          if (!nextBoardIds.length) {
            App.boardPage.state.boardIndex = 0;

            if (App.boardPage.state.unsubscribe) {
              App.boardPage.state.unsubscribe();
              App.boardPage.state.unsubscribe = null;
            }

            App.boardPage.renderError("No boards assigned to this team.");
            const url = new URL(window.location.href);
            url.searchParams.delete("board");
            history.replaceState({}, "", url.toString());
            return;
          }

          let nextIndex = 0;

          if (currentBoardId) {
            const found = nextBoardIds.indexOf(currentBoardId);
            if (found >= 0) {
              nextIndex = found;
            }
          }

          App.boardPage.state.boardIndex = nextIndex;

          const nextBoardId = nextBoardIds[nextIndex];
          const url = new URL(window.location.href);
          url.searchParams.set("board", nextBoardId);
          history.replaceState({}, "", url.toString());

          await App.boardPage.loadAndRenderCurrent();
        });

        App.boardPage.wireNav();

        if (App.boardPage.state.boardIds.length) {
          await App.boardPage.loadAndRenderCurrent();
        }
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

          if (s.overlayResizeCleanup) {
            s.overlayResizeCleanup();
            s.overlayResizeCleanup = null;
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
        App.boardPage.clearPageTheme();
        App.boardPage.hideTileInfo();

        const meta = App.util.qs("#boardMeta");
        const title = App.util.qs("#boardTitle");
        if (title) title.textContent = "Board";
        if (meta) meta.textContent = message;

        const s = App.boardPage.state;
        if (s.overlayResizeCleanup) {
          s.overlayResizeCleanup();
          s.overlayResizeCleanup = null;
        }

        s.currentBoardId = null;
        s.currentBoardSize = 5;
        s.currentStampState = {};
        s.activeBingoKeys = [];

        const grid = App.util.qs("#boardGrid");
        if (grid) grid.innerHTML = "";

        const overlay = App.util.qs("#boardBingoOverlay");
        if (overlay) overlay.innerHTML = "";
      },

      async loadAndRenderCurrent() {
        const s = App.boardPage.state;
        const boardId = s.boardIds[s.boardIndex];

        if (!boardId) {
          App.boardPage.renderError("No boards assigned to this team.");
          return;
        }

        if (s.unsubscribe) {
          s.unsubscribe();
          s.unsubscribe = null;
        }

        if (s.overlayResizeCleanup) {
          s.overlayResizeCleanup();
          s.overlayResizeCleanup = null;
        }

        const [session, board] = await Promise.all([
          App.data.getSession(s.sessionId),
          App.data.getBoardById(boardId)
        ]);

        if (!session || !board) {
          App.boardPage.renderError("Failed to load team/session data.");
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
          boardMeta.textContent = `Zone: ${board.zone?.name || "Unknown"} • Board ${s.boardIndex + 1} of ${s.boardIds.length} • Size: ${board.size}×${board.size}`;
        }

        const zoneBg = App.util.qs("#zoneBg");
        if (zoneBg) {
          zoneBg.className = "board-bg";
          if (board.zone && board.zone.cssClass) zoneBg.classList.add(board.zone.cssClass);
        }

        App.boardPage.applyPageTheme(board);

        const grid = App.util.qs("#boardGrid");
        const overlay = App.util.qs("#boardBingoOverlay");
        if (!grid) return;

        document.documentElement.style.setProperty("--gridSize", String(board.size || 5));

        const itemIds = (board.tiles || []).map((t) => t.itemId);
        const items = await App.data.getItemsByIds(itemIds);
        const itemById = new Map(items.map((i) => [i.id, i]));
        const stampState = await App.stamps.get(s.sessionId, s.teamId, board.id);

        s.currentBoardId = board.id;
        s.currentBoardSize = board.size || 5;
        s.currentStampState = stampState;
        s.activeBingoKeys = App.bingoFx.getCompletedLineKeys(s.currentBoardSize, stampState);

        grid.innerHTML = "";
        if (overlay) overlay.innerHTML = "";

        const tiles = board.tiles || [];

        for (let idx = 0; idx < tiles.length; idx += 1) {
          const tile = tiles[idx];
          const item = itemById.get(tile.itemId) || {
            name: "Unknown Item",
            description: "",
            lore: "",
            category: "N/A",
            defaultAmount: 1
          };
          const amount = tile.amount ?? item.defaultAmount ?? 1;

          const el = document.createElement("button");
          el.type = "button";
          el.className = "tile";
          const size = board.size || 5;
          const row = Math.floor(idx / size);
          if (row === 0) {
            el.classList.add("tile--top-row");
          }          
          el.setAttribute("role", "gridcell");
          el.setAttribute("aria-label", `${item.name} x${amount}. Stamped status shown by host.`);
          
          const value = tile.valueOverride ?? item.value ?? null;
          const category = item.category || "Item";
          const description = (tile.descriptionOverride || item.description || "").trim();
          const comment = (tile.commentOverride || item.comment || "").trim();
          const lore = (item.lore || "").trim();
          
          if (item?.icon) {
            el.style.setProperty("--tile-icon", `url("${item.icon}")`);
          } else {
            el.style.removeProperty("--tile-icon");
          }
          

          const stampData = stampState[String(idx)];
          const isStamped = !!stampData?.stamped;
          if (isStamped) {
            el.classList.add("is-stamped");
          }

          el.innerHTML = `
            <div class="tile__face">
              ${value != null && value !== "" ? `<div class="tile__value">#${App.util.escapeHtml(String(value))}</div>` : ""}
              <div class="tile__amount">${App.util.escapeHtml(String(amount))}</div>
              <div class="tile__tag">${App.util.escapeHtml(category)}</div>
          
              <div class="tile__stamp" aria-hidden="true">
                <img class="tile__stamp-img" src="/assets/stamp.png" alt="" />
              </div>
            </div>
          
            <div class="tile__info-card">
              <div class="tile__info-card__amount">x${App.util.escapeHtml(String(amount))}</div>
              <div class="tile__info-card__category">${App.util.escapeHtml(category)}</div>
              <div class="tile__info-card__title">${App.util.escapeHtml(item.name || "Unknown Item")}</div>
          
              ${description ? `
                <div class="tile__info-card__label">Description</div>
                <div class="tile__info-card__desc">${App.util.escapeHtml(description)}</div>
              ` : ""}
          
              ${comment ? `
                <div class="tile__info-card__label">Comment</div>
                <div class="tile__info-card__comment">${App.util.escapeHtml(comment)}</div>
              ` : ""}
          
              ${lore ? `
                <div class="tile__info-card__label">Lore</div>
                <div class="tile__info-card__lore">${App.util.escapeHtml(lore)}</div>
              ` : ""}
            </div>
          `;

          el.dataset.itemName = item.name || "";
          el.dataset.itemCategory = item.category || "";
          el.dataset.itemDesc = item.description || "";
          el.dataset.itemLore = item.lore || item.description || "";
          el.dataset.itemAmount = String(amount);

          if (stampData?.stamped) {
            App.stampFx.applySaved(el, stampData);
          }

          App.boardPage.bindTileInfo(el, item, amount);
          grid.appendChild(el);
        }

        App.bingoFx.renderOverlayNextFrame({
          gridEl: grid,
          overlayEl: overlay,
          size: s.currentBoardSize,
          stampState: s.currentStampState
        });

        if (overlay) {
          s.overlayResizeCleanup = App.bingoFx.watchLayout(grid, () => {
            App.bingoFx.renderOverlayNextFrame({
              gridEl: grid,
              overlayEl: overlay,
              size: s.currentBoardSize,
              stampState: s.currentStampState
            });
          });
        }

        s.unsubscribe = App.stamps.subscribe(s.sessionId, s.teamId, board.id, (nextStampState) => {
          const tileEls = grid.querySelectorAll(".tile");

          tileEls.forEach((tileEl, idx) => {
            const wasStamped = tileEl.classList.contains("is-stamped");
            const stampData = nextStampState[String(idx)];
            const isStamped = !!stampData?.stamped;

            tileEl.classList.toggle("is-stamped", isStamped);

            if (stampData?.stamped) {
              App.stampFx.applySaved(tileEl, stampData);
            } else {
              App.stampFx.clearSaved(tileEl);
            }

            if (!wasStamped && isStamped) {
              App.stampFx.animateIn(tileEl);
            }
          });

          const prevKeys = new Set(s.activeBingoKeys || []);
          const nextKeys = App.bingoFx.getCompletedLineKeys(s.currentBoardSize, nextStampState);
          const newLineKeys = nextKeys.filter((key) => !prevKeys.has(key));

          s.currentStampState = nextStampState;
          s.activeBingoKeys = nextKeys;

          App.bingoFx.renderOverlayNextFrame({
            gridEl: grid,
            overlayEl: overlay,
            size: s.currentBoardSize,
            stampState: nextStampState,
            newLineKeys
          });

          if (newLineKeys.length) {
            App.bingoFx.playJingle();
          }
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

        try {
          const last = localStorage.getItem(`${App.config.storagePrefix}.lastTeamCode`);
          if (last && input) input.value = last;
        } catch {
          // ignore
        }

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
            App.util.setStatus(status, "Failed to load data.", "bad");
            return;
          }

          if (!found) {
            App.util.setStatus(status, `Unknown code: ${code}.`, "bad");
            return;
          }

          const { session, team } = found;
          const boards = await App.data.getBoardsForTeam(session.id, team.id);
          const firstBoardId = boards[0]?.id || "";

          try {
            localStorage.setItem(`${App.config.storagePrefix}.lastTeamCode`, code);
          } catch {
            // ignore
          }

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
      await App.landingPage.init();
      await App.boardPage.init();
    }
  };

  window.App = App;

  document.addEventListener("DOMContentLoaded", () => {
    App.init().catch(() => {
      // Keep failures quiet; pages render their own status lines where applicable.
    });
  });
})();