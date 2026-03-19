/* admin.js — Admin UI
   - Session picker + current session display
   - Create/delete session
   - Create/delete team
   - Live board stamping via Firebase
*/

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);

  const Admin = {
    state: {
      sessionId: null,
      teamId: null,
      unsubscribes: [],
      unsubscribeSessions: null,
      unsubscribeTeams: null,
      modalAction: null
    },

    async init() {
      const picker = $("#sessionPicker");
      if (!picker) return;

      $("#adminMeta").textContent = "Loading sessions…";

      Admin.renderSessions();
      Admin.wireReset();
      Admin.wireSessionPicker();
      Admin.wireSessionUi();
      Admin.wireTeamUi();
      Admin.wireCreateSession();
      Admin.wireCreateTeam();
      Admin.wireSessionEraToggle();
      Admin.wireModal();

      const sessions = await window.App.sessionStore.getSessions();
      const firstSession = sessions[0];
      if (firstSession) {
        await Admin.selectSession(firstSession.id);

        const teams = await window.App.sessionStore.getTeams(firstSession.id);
        const firstTeam = teams[0];
        if (firstTeam) {
          await Admin.selectTeam(firstTeam.id);
        }
      } else {
        $("#adminMeta").textContent = "No sessions yet.";
      }
    },

    clearSubscriptions() {
      Admin.state.unsubscribes.forEach(unsub => {
        try { unsub(); } catch {}
      });
      Admin.state.unsubscribes = [];
    },

    updateCurrentSessionDisplay(session) {
      const currentDisplay = $("#currentSessionDisplay");
      if (!currentDisplay) return;

      currentDisplay.textContent = session
          ? `${session.name} • ${session.era || ""}`
          : "No session selected";
    },

    hideSessionCreate() {
      const form = $("#createSessionForm");
      if (form) form.style.display = "none";
    },

    hideTeamCreate() {
      const form = $("#createTeamForm");
      if (form) form.style.display = "none";
    },

    wireReset() {
      const btn = $("#resetLocalBtn");
      if (!btn) return;

      btn.addEventListener("click", () => {
        console.warn("Global reset is disabled for Firebase right now.");
      });
    },

    wireSessionPicker() {
      const picker = $("#sessionPicker");
      if (!picker) return;

      picker.addEventListener("change", async () => {
        const sessionId = picker.value;
        if (!sessionId) return;
        await Admin.selectSession(sessionId);
      });
    },

    wireSessionUi() {
      const toggleCreateBtn = $("#toggleCreateSessionBtn");
      const cancelCreateBtn = $("#cancelCreateSessionBtn");
      const toggleDeleteBtn = $("#toggleDeleteSessionBtn");

      if (toggleCreateBtn) {
        toggleCreateBtn.addEventListener("click", () => {
          const form = $("#createSessionForm");
          if (form) form.style.display = "";
        });
      }

      if (cancelCreateBtn) {
        cancelCreateBtn.addEventListener("click", () => {
          Admin.hideSessionCreate();
        });
      }

      if (toggleDeleteBtn) {
        toggleDeleteBtn.addEventListener("click", () => {
          if (!Admin.state.sessionId) {
            $("#adminMeta").textContent = "No session selected.";
            return;
          }

          Admin.showConfirmModal({
            title: "Delete session?",
            message: "This will remove the selected session and its teams. This cannot be undone.",
            confirmText: "Delete Session",
            onConfirm: async () => {
              await Admin.deleteCurrentSession();
            }
          });
        });
      }
    },

    wireTeamUi() {
      const toggleCreateBtn = $("#toggleCreateTeamBtn");
      const cancelCreateBtn = $("#cancelCreateTeamBtn");
      const toggleDeleteBtn = $("#toggleDeleteTeamBtn");

      if (toggleCreateBtn) {
        toggleCreateBtn.addEventListener("click", () => {
          if (!Admin.state.sessionId) {
            $("#adminMeta").textContent = "Select a session first.";
            return;
          }

          const form = $("#createTeamForm");
          if (form) form.style.display = "";
        });
      }

      if (cancelCreateBtn) {
        cancelCreateBtn.addEventListener("click", () => {
          Admin.hideTeamCreate();
        });
      }

      if (toggleDeleteBtn) {
        toggleDeleteBtn.addEventListener("click", () => {
          if (!Admin.state.teamId) {
            $("#adminMeta").textContent = "Select a team first.";
            return;
          }

          Admin.showConfirmModal({
            title: "Delete team?",
            message: "This will remove the selected team from the current session. This cannot be undone.",
            confirmText: "Delete Team",
            onConfirm: async () => {
              await Admin.deleteCurrentTeam();
            }
          });
        });
      }
    },

    wireSessionEraToggle() {
      const eraSelect = $("#newSessionEra");
      const customInput = $("#newSessionEraCustom");
      if (!eraSelect || !customInput) return;

      const apply = () => {
        const isCustom = eraSelect.value === "__custom__";
        customInput.style.display = isCustom ? "" : "none";
        if (!isCustom) customInput.value = "";
      };

      eraSelect.addEventListener("change", apply);
      apply();
    },

    wireCreateSession() {
      const form = $("#createSessionForm");
      if (!form) return;

      form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const nameInput = $("#newSessionName");
        const eraSelect = $("#newSessionEra");
        const customEraInput = $("#newSessionEraCustom");

        const name = (nameInput?.value || "").trim();

        let era = (eraSelect?.value || "ARR").trim();
        if (era === "__custom__") {
          era = (customEraInput?.value || "").trim();
        }

        if (!name) {
          $("#adminMeta").textContent = "Session name is required.";
          return;
        }

        if (!era) {
          $("#adminMeta").textContent = "Era is required.";
          return;
        }

        const session = await window.App.sessionStore.createSession({
          name,
          era,
          status: "active"
        });

        if (nameInput) nameInput.value = "";
        if (eraSelect) eraSelect.value = "ARR";
        if (customEraInput) {
          customEraInput.value = "";
          customEraInput.style.display = "none";
        }

        Admin.hideSessionCreate();
        $("#adminMeta").textContent = `Created session: ${session.name}`;
        await Admin.selectSession(session.id);
      });
    },

    wireCreateTeam() {
      const form = $("#createTeamForm");
      if (!form) return;

      form.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (!Admin.state.sessionId) {
          $("#adminMeta").textContent = "Select a session first.";
          return;
        }

        const nameInput = $("#newTeamName");
        const codeInput = $("#newTeamCode");
        const regionInput = $("#newTeamRegion");

        const name = (nameInput?.value || "").trim();
        const code = (codeInput?.value || "").trim().toUpperCase();
        const region = (regionInput?.value || "").trim();

        if (!name) {
          $("#adminMeta").textContent = "Team name is required.";
          return;
        }

        if (!code) {
          $("#adminMeta").textContent = "Team code is required.";
          return;
        }

        const team = await window.App.sessionStore.createTeam(Admin.state.sessionId, {
          name,
          code,
          region
        });

        if (nameInput) nameInput.value = "";
        if (codeInput) codeInput.value = "";
        if (regionInput) regionInput.value = "";

        Admin.hideTeamCreate();
        $("#adminMeta").textContent = `Created team: ${team.name}`;
        await Admin.selectTeam(team.id);
      });
    },

    wireModal() {
      const backdrop = $("#confirmModal");
      const cancelBtn = $("#confirmModalCancelBtn");
      const confirmBtn = $("#confirmModalConfirmBtn");

      if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
          Admin.hideConfirmModal();
        });
      }

      if (confirmBtn) {
        confirmBtn.addEventListener("click", async () => {
          if (!Admin.state.modalAction) {
            Admin.hideConfirmModal();
            return;
          }

          const action = Admin.state.modalAction;
          Admin.hideConfirmModal();
          await action();
        });
      }

      if (backdrop) {
        backdrop.addEventListener("click", (e) => {
          if (e.target === backdrop) {
            Admin.hideConfirmModal();
          }
        });
      }
    },

    showConfirmModal({ title, message, confirmText, onConfirm }) {
      const backdrop = $("#confirmModal");
      const titleEl = $("#confirmModalTitle");
      const messageEl = $("#confirmModalMessage");
      const confirmBtn = $("#confirmModalConfirmBtn");

      if (!backdrop || !titleEl || !messageEl || !confirmBtn) return;

      titleEl.textContent = title || "Are you sure?";
      messageEl.textContent = message || "This action cannot be undone.";
      confirmBtn.textContent = confirmText || "Confirm";
      Admin.state.modalAction = onConfirm || null;

      backdrop.style.display = "";
    },

    hideConfirmModal() {
      const backdrop = $("#confirmModal");
      if (backdrop) backdrop.style.display = "none";
      Admin.state.modalAction = null;
    },

    async deleteCurrentSession() {
      const sessionId = Admin.state.sessionId;
      if (!sessionId) {
        $("#adminMeta").textContent = "No session selected.";
        return;
      }

      const { remove } = window.FirebaseDbApi;

      await remove(window.App.sessionStore.dbRef(window.App.sessionStore.sessionPath(sessionId)));
      await remove(window.App.sessionStore.dbRef(window.App.sessionStore.teamPath(sessionId)));

      Admin.state.sessionId = null;
      Admin.state.teamId = null;
      Admin.clearSubscriptions();

      $("#teamList").innerHTML = "";
      $("#boardsPane").innerHTML = `<div class="empty-state muted">Choose a session and team to view their boards.</div>`;
      $("#adminTitle").textContent = "Admin";

      const sessions = await window.App.sessionStore.getSessions();
      const firstSession = sessions[0] || null;

      if (firstSession) {
        $("#adminMeta").textContent = "Session deleted.";
        await Admin.selectSession(firstSession.id);

        const teams = await window.App.sessionStore.getTeams(firstSession.id);
        const firstTeam = teams[0];
        if (firstTeam) await Admin.selectTeam(firstTeam.id);
      } else {
        Admin.updateCurrentSessionDisplay(null);
        const picker = $("#sessionPicker");
        if (picker) picker.value = "";
        $("#adminMeta").textContent = "Session deleted. No sessions left.";
      }
    },

    async deleteCurrentTeam() {
      const sessionId = Admin.state.sessionId;
      const teamId = Admin.state.teamId;

      if (!sessionId || !teamId) {
        $("#adminMeta").textContent = "No team selected.";
        return;
      }

      await window.App.sessionStore.deleteTeam(sessionId, teamId);

      Admin.state.teamId = null;
      Admin.clearSubscriptions();

      $("#boardsPane").innerHTML = `<div class="empty-state muted">Select a team to view boards.</div>`;
      $("#adminTitle").textContent = "Admin";

      const teams = await window.App.sessionStore.getTeams(sessionId);
      const firstTeam = teams[0] || null;

      if (firstTeam) {
        $("#adminMeta").textContent = "Team deleted.";
        await Admin.selectTeam(firstTeam.id);
      } else {
        $("#adminMeta").textContent = "Team deleted. No teams left in this session.";
      }
    },

    renderSessions() {
      const picker = $("#sessionPicker");
      if (!picker) return;

      if (Admin.state.unsubscribeSessions) {
        Admin.state.unsubscribeSessions();
        Admin.state.unsubscribeSessions = null;
      }

      Admin.state.unsubscribeSessions = window.App.sessionStore.subscribeSessions((sessions) => {
        picker.innerHTML = `<option value="">Select a session</option>`;

        sessions.forEach(s => {
          const option = document.createElement("option");
          option.value = s.id;
          option.textContent = s.name;
          option.selected = Admin.state.sessionId === s.id;
          picker.appendChild(option);
        });

        if (!sessions.length) {
          Admin.updateCurrentSessionDisplay(null);
          $("#adminMeta").textContent = "No sessions yet.";
          return;
        }

        const current = sessions.find(s => s.id === Admin.state.sessionId) || null;
        if (current) {
          Admin.updateCurrentSessionDisplay(current);
        } else if (!Admin.state.sessionId) {
          $("#adminMeta").textContent = "Select a session and team.";
        }
      });
    },

    async selectSession(sessionId) {
      Admin.state.sessionId = sessionId;
      Admin.state.teamId = null;
      Admin.clearSubscriptions();

      const sessions = await window.App.sessionStore.getSessions();
      const session = sessions.find(s => s.id === sessionId) || null;

      const picker = $("#sessionPicker");
      if (picker) picker.value = sessionId;

      Admin.updateCurrentSessionDisplay(session);
      Admin.renderTeams(sessionId);

      $("#adminTitle").textContent = "Admin";
      $("#adminMeta").textContent = "Select a team to load boards.";
      $("#boardsPane").innerHTML = `<div class="empty-state muted">Select a team to view boards.</div>`;
    },

    renderTeams(sessionId) {
      const host = $("#teamList");
      host.innerHTML = "";

      if (Admin.state.unsubscribeTeams) {
        Admin.state.unsubscribeTeams();
        Admin.state.unsubscribeTeams = null;
      }

      Admin.state.unsubscribeTeams = window.App.sessionStore.subscribeTeams(sessionId, (teams) => {
        host.innerHTML = "";

        teams.forEach(t => {
          const el = document.createElement("div");
          el.className = "list-item";
          el.setAttribute("role", "option");
          el.dataset.teamId = t.id;
          el.innerHTML = `
            <div>
              <div><strong>${window.App.util.escapeHtml(t.name)}</strong></div>
              <div class="muted small">Code: <span class="badge">${window.App.util.escapeHtml(t.code)}</span></div>
            </div>
            <div class="badge">${window.App.util.escapeHtml(t.region || "")}</div>
          `;
          el.addEventListener("click", () => Admin.selectTeam(t.id));
          el.classList.toggle("is-active", Admin.state.teamId === t.id);
          host.appendChild(el);
        });
      });
    },

    async selectTeam(teamId) {
      const sessionId = Admin.state.sessionId;
      if (!sessionId) return;

      Admin.state.teamId = teamId;

      window.App.util.qsa("#teamList .list-item").forEach(el => {
        el.classList.toggle("is-active", el.dataset.teamId === teamId);
      });

      await Admin.renderBoardsPane();
    },

    async renderBoardsPane() {
      const { sessionId, teamId } = Admin.state;
      if (!sessionId || !teamId) return;

      Admin.clearSubscriptions();

      const sessions = await window.App.sessionStore.getSessions();
      const session = sessions.find(s => s.id === sessionId) || null;

      const teams = await window.App.sessionStore.getTeams(sessionId);
      const team = teams.find(t => t.id === teamId) || null;

      if (!session || !team) {
        $("#adminTitle").textContent = "Admin";
        $("#adminMeta").textContent = "Session or team not found.";
        $("#boardsPane").innerHTML = `<div class="empty-state muted">Session or team not found.</div>`;
        return;
      }

      $("#adminTitle").textContent = `${team.name} — Admin`;
      $("#adminMeta").textContent = `${session.name} • Team code: ${team.code} • Firebase stamps`;

      const boards = await window.App.data.getBoardsForTeam(sessionId, teamId);
      const pane = $("#boardsPane");
      pane.innerHTML = "";

      if (!boards.length) {
        pane.innerHTML = `<div class="empty-state muted">No boards assigned to this team (mock data).</div>`;
        return;
      }

      const { items } = await window.App.data.items();
      const itemById = new Map(items.map(i => [i.id, i]));

      for (const board of boards) {
        const card = document.createElement("div");
        card.className = "board-card";

        const head = document.createElement("div");
        head.className = "board-card__head";
        head.innerHTML = `
          <div>
            <div class="board-card__title">${window.App.util.escapeHtml(board.name)}</div>
            <div class="board-card__meta">Zone: ${window.App.util.escapeHtml(board.zone.name)} • ${board.size}×${board.size}</div>
          </div>
          <a class="link" href="${Admin.boardLink(sessionId, teamId, board.id)}">Open board</a>
        `;

        const grid = document.createElement("div");
        grid.className = "admin-grid";
        grid.style.setProperty("--gridSize", String(board.size || 5));

        const stampState = await window.App.stamps.get(sessionId, teamId, board.id);
        const tiles = board.tiles || [];

        for (let idx = 0; idx < tiles.length; idx++) {
          const tile = tiles[idx];
          const item = itemById.get(tile.itemId) || { name: "Unknown Item", description: "" };

          const tileEl = document.createElement("div");
          tileEl.className = "admin-tile";

          const stamped = !!stampState[String(idx)];
          tileEl.classList.toggle("is-stamped", stamped);

          tileEl.innerHTML = `
            <div class="admin-tile__name">${window.App.util.escapeHtml(item.name)}</div>
            <div class="admin-tile__desc">${window.App.util.escapeHtml(item.description || "")}</div>
          `;

          tileEl.addEventListener("click", async () => {
            const now = await window.App.stamps.toggle(sessionId, teamId, board.id, idx);
            tileEl.classList.toggle("is-stamped", now);
          });

          grid.appendChild(tileEl);
        }

        const unsubscribe = window.App.stamps.subscribe(sessionId, teamId, board.id, (nextStampState) => {
          const tileEls = grid.querySelectorAll(".admin-tile");
          tileEls.forEach((tileEl, idx) => {
            tileEl.classList.toggle("is-stamped", !!nextStampState[String(idx)]);
          });
        });

        Admin.state.unsubscribes.push(unsubscribe);

        card.appendChild(head);
        card.appendChild(grid);
        pane.appendChild(card);
      }
    },

    boardLink(sessionId, teamId, boardId) {
      const url = new URL("board.html", window.location.href);
      url.searchParams.set("session", sessionId);
      url.searchParams.set("team", teamId);
      url.searchParams.set("board", boardId);
      return url.toString();
    },

    refreshBoardsPane() {
      if (Admin.state.sessionId && Admin.state.teamId) {
        Admin.renderBoardsPane().catch(() => {});
      }
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    Admin.init().catch(() => {
      const meta = $("#adminMeta");
      if (meta) meta.textContent = "Failed to initialize admin.";
    });
  });
})();

