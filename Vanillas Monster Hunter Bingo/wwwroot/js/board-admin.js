(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);

  const BoardAdmin = {
    state: {
      sessionId: null,
      teamId: null,
      boards: [],
      assignedBoardIds: [],
      pendingBoards: new Set(),
      boardsUnsub: null,
      assignmentsUnsub: null
    },

    async init() {
      const sessionPicker = $("#baSessionPicker");
      if (!sessionPicker) return;

      BoardAdmin.setMeta("Waking up live board data…");
      await BoardAdmin.waitForBoardData();
      BoardAdmin.wireSessionPicker();
      BoardAdmin.wireTeamPicker();
      await BoardAdmin.loadBoardsOnce();
      BoardAdmin.subscribeBoards();
      await BoardAdmin.renderSessions();
    },

    async waitForBoardData(timeoutMs = 10000) {
      const startedAt = Date.now();

      while (Date.now() - startedAt < timeoutMs) {
        if (window.App?.boardStore && window.App?.sessionStore && window.FirebaseDb && window.FirebaseDbApi) {
          return;
        }

        await new Promise((resolve) => window.setTimeout(resolve, 60));
      }

      throw new Error("Firebase board services did not initialize in time.");
    },

    async loadBoardsOnce() {
      const boards = await window.App.boardStore.getBoards();
      BoardAdmin.state.boards = boards || [];
      return BoardAdmin.state.boards;
    },

    setMeta(message) {
      const meta = $("#baMeta");
      if (meta) meta.textContent = message || "";
    },

    setBusy(specs, isBusy) {
      const list = (Array.isArray(specs) ? specs : [specs]).filter(Boolean);

      for (const spec of list) {
        const el = spec?.el || spec;
        if (!el) continue;

        if (spec?.busyText != null) {
          if (isBusy) {
            if (el.dataset.originalText == null) {
              el.dataset.originalText = el.textContent;
            }
            el.textContent = spec.busyText;
          } else if (el.dataset.originalText != null) {
            el.textContent = el.dataset.originalText;
            delete el.dataset.originalText;
          }
        }

        if ("disabled" in el) {
          el.disabled = !!isBusy;
        }

        if (isBusy) {
          el.setAttribute("aria-busy", "true");
        } else {
          el.removeAttribute("aria-busy");
        }
      }
    },

    subscribeBoards() {
      if (BoardAdmin.state.boardsUnsub) {
        BoardAdmin.state.boardsUnsub();
      }

      BoardAdmin.state.boardsUnsub = window.App.boardStore.subscribeBoards((boards) => {
        BoardAdmin.state.boards = boards || [];

        if (BoardAdmin.state.sessionId && BoardAdmin.state.teamId) {
          BoardAdmin.renderBoards().catch((err) => {
            console.error("Board list refresh failed:", err);
            BoardAdmin.setMeta("Failed to refresh boards.");
          });
        }
      });
    },

    clearAssignmentSubscription() {
      if (BoardAdmin.state.assignmentsUnsub) {
        BoardAdmin.state.assignmentsUnsub();
        BoardAdmin.state.assignmentsUnsub = null;
      }

      BoardAdmin.state.assignedBoardIds = [];
    },

    subscribeAssignments() {
      BoardAdmin.clearAssignmentSubscription();

      const { sessionId, teamId } = BoardAdmin.state;
      if (!sessionId || !teamId) return;

      BoardAdmin.state.assignmentsUnsub = window.App.boardAssignments.subscribe(sessionId, teamId, (assignedBoardIds) => {
        BoardAdmin.state.assignedBoardIds = assignedBoardIds || [];
        BoardAdmin.renderBoards().catch((err) => {
          console.error("Board assignment refresh failed:", err);
          BoardAdmin.setMeta("Failed to refresh board assignments.");
        });
      });
    },

    async renderSessions() {
      const picker = $("#baSessionPicker");
      if (!picker) return;

      const sessions = await window.App.sessionStore.getSessions();
      picker.innerHTML = '<option value="">Select a session</option>';

      sessions.forEach((session) => {
        const option = document.createElement("option");
        option.value = session.id;
        option.textContent = `${session.name} • ${session.era || ""}`;
        picker.appendChild(option);
      });

      BoardAdmin.setMeta(sessions.length ? "Select a session and team." : "No sessions available.");
    },

    async renderTeams(sessionId) {
      const picker = $("#baTeamPicker");
      if (!picker) return;

      picker.innerHTML = '<option value="">Select a team</option>';

      if (!sessionId) return;

      const teams = await window.App.sessionStore.getTeams(sessionId);
      teams.forEach((team) => {
        const option = document.createElement("option");
        option.value = team.id;
        option.textContent = `${team.name} (${team.code})`;
        picker.appendChild(option);
      });
    },

    wireSessionPicker() {
      const picker = $("#baSessionPicker");
      if (!picker) return;

      picker.addEventListener("change", async () => {
        BoardAdmin.state.sessionId = picker.value || null;
        BoardAdmin.state.teamId = null;
        BoardAdmin.clearAssignmentSubscription();

        await BoardAdmin.renderTeams(BoardAdmin.state.sessionId);

        const teamPicker = $("#baTeamPicker");
        const pane = $("#baBoardsPane");

        if (teamPicker) teamPicker.value = "";
        BoardAdmin.setMeta(BoardAdmin.state.sessionId ? "Select a team." : "Select a session and team.");

        if (pane) {
          pane.innerHTML = '<div class="empty-state muted">No team selected yet.</div>';
        }
      });
    },

    wireTeamPicker() {
      const picker = $("#baTeamPicker");
      if (!picker) return;

      picker.addEventListener("change", async () => {
        BoardAdmin.state.teamId = picker.value || null;

        if (!BoardAdmin.state.sessionId || !BoardAdmin.state.teamId) {
          BoardAdmin.clearAssignmentSubscription();
          BoardAdmin.setMeta("Select a session and team.");
          return;
        }

        BoardAdmin.setMeta("Loading board assignments…");
        BoardAdmin.subscribeAssignments();
        await BoardAdmin.renderBoards();
      });
    },

    async renderBoards() {
      const { sessionId, teamId } = BoardAdmin.state;
      const pane = $("#baBoardsPane");
      const title = $("#baTitle");

      if (!pane || !title) return;

      if (!sessionId || !teamId) {
        title.textContent = "Board Admin";
        pane.innerHTML = '<div class="empty-state muted">No team selected yet.</div>';
        return;
      }

      const session = await window.App.data.getSession(sessionId);
      const team = await window.App.data.getTeam(sessionId, teamId);
      const boards = BoardAdmin.state.boards || [];
      const assigned = BoardAdmin.state.assignedBoardIds || [];

      if (!session || !team) {
        title.textContent = "Board Admin";
        BoardAdmin.setMeta("Session or team not found.");
        pane.innerHTML = '<div class="empty-state muted">Session or team not found.</div>';
        return;
      }

      title.textContent = `${team.name} — Board Assignment`;
      BoardAdmin.setMeta(`${session.name} • ${team.code}`);
      pane.innerHTML = "";

      if (!boards.length) {
        pane.innerHTML = '<div class="empty-state muted">No boards available yet.</div>';
        return;
      }

      boards.forEach((board) => {
        const isAssigned = assigned.includes(board.id);
        const card = document.createElement("div");
        card.className = "board-card";

        card.innerHTML = `
          <div class="board-card__head">
            <div>
              <div class="board-card__title">${window.App.util.escapeHtml(board.name)}</div>
              <div class="board-card__meta">${window.App.util.escapeHtml(board.boardType === "fishing" ? "Fishing" : "Monster Hunter")} • Zone: ${window.App.util.escapeHtml(board.zone?.name || "")} • ${board.size}×${board.size}</div>
            </div>
            <button class="btn btn--small ${isAssigned ? "btn--danger" : "btn--primary"}" type="button">
              ${isAssigned ? "Unassign" : "Assign"}
            </button>
          </div>
        `;

        const btn = $("button", card);
        const actionKey = `${sessionId}:${teamId}:${board.id}`;

        btn.addEventListener("click", async () => {
          if (BoardAdmin.state.pendingBoards.has(actionKey)) return;

          BoardAdmin.state.pendingBoards.add(actionKey);
          BoardAdmin.setBusy({ el: btn, busyText: isAssigned ? "Unassigning…" : "Assigning…" }, true);

          try {
            if (isAssigned) {
              await window.App.boardAssignments.unassignBoard(sessionId, teamId, board.id);
              BoardAdmin.setMeta(`Unassigned ${board.name} from ${team.name}.`);
            } else {
              await window.App.boardAssignments.assignBoard(sessionId, teamId, board.id);
              BoardAdmin.setMeta(`Assigned ${board.name} to ${team.name}.`);
            }
          } catch (err) {
            console.error("Board assignment update failed:", err);
            BoardAdmin.setMeta(`Failed to update ${board.name}.`);
            BoardAdmin.setBusy({ el: btn, busyText: isAssigned ? "Unassigning…" : "Assigning…" }, false);
          } finally {
            BoardAdmin.state.pendingBoards.delete(actionKey);
          }
        });

        pane.appendChild(card);
      });
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    BoardAdmin.init().catch((err) => {
      console.error("Board admin init failed:", err);
      BoardAdmin.setMeta("Failed to initialize board admin.");
    });
  });
})();
