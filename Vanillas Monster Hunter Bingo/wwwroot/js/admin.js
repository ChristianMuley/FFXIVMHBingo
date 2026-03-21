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
      boardUnsubscribes: [],
      unsubscribeSessions: null,
      unsubscribeTeams: null,
      modalAction: null,
      pendingActions: new Set()
    },

    async init() {
      const picker = $("#sessionPicker");
      if (!picker) return;

      if (window.App?.stampFx) {
        window.App.stampFx.armOnInteraction();
      }

      Admin.setMeta("Loading sessions…");

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
      const firstSession = sessions[0] || null;

      if (!firstSession) {
        Admin.setMeta("No sessions yet.");
        return;
      }

      await Admin.selectSession(firstSession.id);

      const teams = await window.App.sessionStore.getTeams(firstSession.id);
      const firstTeam = teams[0] || null;
      if (firstTeam) {
        await Admin.selectTeam(firstTeam.id);
      }
    },

    setMeta(message) {
      const meta = $("#adminMeta");
      if (meta) meta.textContent = message || "";
    },

    clearBoardSubscriptions() {
      Admin.state.boardUnsubscribes.forEach((unsub) => {
        try {
          unsub();
        } catch {
          // ignore
        }
      });

      Admin.state.boardUnsubscribes = [];
    },

    getBusyTargets(specs) {
      return (Array.isArray(specs) ? specs : [specs]).filter(Boolean);
    },

    setBusy(specs, isBusy) {
      for (const spec of Admin.getBusyTargets(specs)) {
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

    async runLocked(actionKey, busySpecs, action) {
      if (Admin.state.pendingActions.has(actionKey)) return;

      Admin.state.pendingActions.add(actionKey);
      Admin.setBusy(busySpecs, true);

      try {
        return await action();
      } finally {
        Admin.setBusy(busySpecs, false);
        Admin.state.pendingActions.delete(actionKey);
      }
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
        const { sessionId, teamId } = Admin.state;

        if (!sessionId || !teamId) {
          Admin.setMeta("Select a team first.");
          return;
        }

        Admin.showConfirmModal({
          title: "Reset all stamps?",
          message: "This will clear all stamps for the selected team on all assigned boards.",
          confirmText: "Reset Stamps",
          onConfirm: async () => {
            const confirmBtn = $("#confirmModalConfirmBtn");
            const cancelBtn = $("#confirmModalCancelBtn");

            await Admin.runLocked(
              "reset-stamps",
              [
                { el: confirmBtn, busyText: "Resetting…" },
                cancelBtn
              ],
              async () => {
                try {
                  await window.App.stamps.resetTeam(sessionId, teamId);
                  Admin.hideConfirmModal();
                  Admin.setMeta("Stamps reset.");
                  await Admin.renderBoardsPane();
                } catch (err) {
                  console.error("Reset stamps failed:", err);
                  Admin.setMeta("Failed to reset stamps.");
                }
              }
            );
          }
        });
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
            Admin.setMeta("No session selected.");
            return;
          }

          Admin.showConfirmModal({
            title: "Delete session?",
            message: "This will remove the selected session, its teams, its board assignments, and all of its stamps. This cannot be undone.",
            confirmText: "Delete Session",
            onConfirm: async () => {
              const confirmBtn = $("#confirmModalConfirmBtn");
              const cancelBtn = $("#confirmModalCancelBtn");

              await Admin.runLocked(
                "delete-session",
                [
                  { el: confirmBtn, busyText: "Deleting…" },
                  cancelBtn
                ],
                async () => {
                  try {
                    await Admin.deleteCurrentSession();
                    Admin.hideConfirmModal();
                  } catch (err) {
                    console.error("Delete session failed:", err);
                    Admin.setMeta("Failed to delete session.");
                  }
                }
              );
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
            Admin.setMeta("Select a session first.");
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
            Admin.setMeta("Select a team first.");
            return;
          }

          Admin.showConfirmModal({
            title: "Delete team?",
            message: "This will remove the selected team, its board assignments, and all of its stamps from the current session. This cannot be undone.",
            confirmText: "Delete Team",
            onConfirm: async () => {
              const confirmBtn = $("#confirmModalConfirmBtn");
              const cancelBtn = $("#confirmModalCancelBtn");

              await Admin.runLocked(
                "delete-team",
                [
                  { el: confirmBtn, busyText: "Deleting…" },
                  cancelBtn
                ],
                async () => {
                  try {
                    await Admin.deleteCurrentTeam();
                    Admin.hideConfirmModal();
                  } catch (err) {
                    console.error("Delete team failed:", err);
                    Admin.setMeta("Failed to delete team.");
                  }
                }
              );
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
        const submitBtn = form.querySelector('button[type="submit"]');
        const cancelBtn = $("#cancelCreateSessionBtn");

        const name = (nameInput?.value || "").trim();
        let era = (eraSelect?.value || "ARR").trim();

        if (era === "__custom__") {
          era = (customEraInput?.value || "").trim();
        }

        if (!name) {
          Admin.setMeta("Session name is required.");
          return;
        }

        if (!era) {
          Admin.setMeta("Era is required.");
          return;
        }

        await Admin.runLocked(
          "create-session",
          [
            { el: submitBtn, busyText: "Creating…" },
            cancelBtn,
            nameInput,
            eraSelect,
            customEraInput
          ],
          async () => {
            try {
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
              Admin.setMeta(`Created session: ${session.name}`);
              await Admin.selectSession(session.id);
            } catch (err) {
              console.error("Create session failed:", err);
              Admin.setMeta("Failed to create session.");
            }
          }
        );
      });
    },

    wireCreateTeam() {
      const form = $("#createTeamForm");
      if (!form) return;

      form.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (!Admin.state.sessionId) {
          Admin.setMeta("Select a session first.");
          return;
        }

        const nameInput = $("#newTeamName");
        const codeInput = $("#newTeamCode");
        const submitBtn = form.querySelector('button[type="submit"]');
        const cancelBtn = $("#cancelCreateTeamBtn");

        const name = (nameInput?.value || "").trim();
        const code = (codeInput?.value || "").trim().toUpperCase();

        if (!name) {
          Admin.setMeta("Team name is required.");
          return;
        }

        if (!code) {
          Admin.setMeta("Team code is required.");
          return;
        }

        await Admin.runLocked(
          "create-team",
          [
            { el: submitBtn, busyText: "Creating…" },
            cancelBtn,
            nameInput,
            codeInput
          ],
          async () => {
            try {
              const team = await window.App.sessionStore.createTeam(Admin.state.sessionId, {
                name,
                code
              });

              if (nameInput) nameInput.value = "";
              if (codeInput) codeInput.value = "";

              Admin.hideTeamCreate();
              Admin.setMeta(`Created team: ${team.name}`);
              await Admin.selectTeam(team.id);
            } catch (err) {
              console.error("Create team failed:", err);
              Admin.setMeta("Failed to create team.");
            }
          }
        );
      });
    },

    wireModal() {
      const backdrop = $("#confirmModal");
      const cancelBtn = $("#confirmModalCancelBtn");
      const confirmBtn = $("#confirmModalConfirmBtn");

      if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
          if (cancelBtn.disabled) return;
          Admin.hideConfirmModal();
        });
      }

      if (confirmBtn) {
        confirmBtn.addEventListener("click", async () => {
          if (!Admin.state.modalAction) {
            Admin.hideConfirmModal();
            return;
          }

          await Admin.state.modalAction();
        });
      }

      if (backdrop) {
        backdrop.addEventListener("click", (e) => {
          if (e.target === backdrop && !(cancelBtn && cancelBtn.disabled)) {
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
      const cancelBtn = $("#confirmModalCancelBtn");

      if (!backdrop || !titleEl || !messageEl || !confirmBtn || !cancelBtn) return;

      titleEl.textContent = title || "Are you sure?";
      messageEl.textContent = message || "This action cannot be undone.";
      confirmBtn.textContent = confirmText || "Confirm";
      delete confirmBtn.dataset.originalText;
      delete cancelBtn.dataset.originalText;
      confirmBtn.disabled = false;
      cancelBtn.disabled = false;
      confirmBtn.removeAttribute("aria-busy");
      cancelBtn.removeAttribute("aria-busy");
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
        Admin.setMeta("No session selected.");
        return;
      }

      await window.App.sessionStore.deleteSession(sessionId);

      Admin.state.sessionId = null;
      Admin.state.teamId = null;
      Admin.clearBoardSubscriptions();

      const teamList = $("#teamList");
      const boardsPane = $("#boardsPane");
      const title = $("#adminTitle");
      const picker = $("#sessionPicker");

      if (teamList) teamList.innerHTML = "";
      if (boardsPane) {
        boardsPane.innerHTML = '<div class="empty-state muted">Choose a session and team to view their boards.</div>';
      }
      if (title) title.textContent = "Admin";
      if (picker) picker.value = "";

      const sessions = await window.App.sessionStore.getSessions();
      const firstSession = sessions[0] || null;

      if (!firstSession) {
        Admin.updateCurrentSessionDisplay(null);
        Admin.setMeta("Session deleted. No sessions left.");
        return;
      }

      Admin.setMeta("Session deleted.");
      await Admin.selectSession(firstSession.id);

      const teams = await window.App.sessionStore.getTeams(firstSession.id);
      const firstTeam = teams[0] || null;
      if (firstTeam) {
        await Admin.selectTeam(firstTeam.id);
      }
    },

    async deleteCurrentTeam() {
      const sessionId = Admin.state.sessionId;
      const teamId = Admin.state.teamId;

      if (!sessionId || !teamId) {
        Admin.setMeta("No team selected.");
        return;
      }

      await window.App.sessionStore.deleteTeam(sessionId, teamId);

      Admin.state.teamId = null;
      Admin.clearBoardSubscriptions();

      const boardsPane = $("#boardsPane");
      const title = $("#adminTitle");

      if (boardsPane) {
        boardsPane.innerHTML = '<div class="empty-state muted">Select a team to view boards.</div>';
      }
      if (title) title.textContent = "Admin";

      const teams = await window.App.sessionStore.getTeams(sessionId);
      const firstTeam = teams[0] || null;

      if (!firstTeam) {
        Admin.setMeta("Team deleted. No teams left in this session.");
        return;
      }

      Admin.setMeta("Team deleted.");
      await Admin.selectTeam(firstTeam.id);
    },

    renderSessions() {
      const picker = $("#sessionPicker");
      if (!picker) return;

      if (Admin.state.unsubscribeSessions) {
        Admin.state.unsubscribeSessions();
        Admin.state.unsubscribeSessions = null;
      }

      Admin.state.unsubscribeSessions = window.App.sessionStore.subscribeSessions((sessions) => {
        picker.innerHTML = '<option value="">Select a session</option>';

        sessions.forEach((session) => {
          const option = document.createElement("option");
          option.value = session.id;
          option.textContent = session.name;
          option.selected = Admin.state.sessionId === session.id;
          picker.appendChild(option);
        });

        if (!sessions.length) {
          Admin.updateCurrentSessionDisplay(null);
          Admin.setMeta("No sessions yet.");
          return;
        }

        const current = sessions.find((session) => session.id === Admin.state.sessionId) || null;
        if (current) {
          Admin.updateCurrentSessionDisplay(current);
        } else if (!Admin.state.sessionId) {
          Admin.setMeta("Select a session and team.");
        }
      });
    },

    async selectSession(sessionId) {
      Admin.state.sessionId = sessionId;
      Admin.state.teamId = null;
      Admin.clearBoardSubscriptions();

      const sessions = await window.App.sessionStore.getSessions();
      const session = sessions.find((entry) => entry.id === sessionId) || null;
      const picker = $("#sessionPicker");
      const title = $("#adminTitle");
      const boardsPane = $("#boardsPane");

      if (picker) picker.value = sessionId;
      if (title) title.textContent = "Admin";
      if (boardsPane) {
        boardsPane.innerHTML = '<div class="empty-state muted">Select a team to view boards.</div>';
      }

      Admin.updateCurrentSessionDisplay(session);
      Admin.renderTeams(sessionId);
      Admin.setMeta("Select a team to load boards.");
    },

    renderTeams(sessionId) {
      const host = $("#teamList");
      if (!host) return;

      host.innerHTML = "";

      if (Admin.state.unsubscribeTeams) {
        Admin.state.unsubscribeTeams();
        Admin.state.unsubscribeTeams = null;
      }

      Admin.state.unsubscribeTeams = window.App.sessionStore.subscribeTeams(sessionId, (teams) => {
        host.innerHTML = "";

        teams.forEach((team) => {
          const el = document.createElement("div");
          el.className = "list-item";
          el.setAttribute("role", "option");
          el.dataset.teamId = team.id;
          el.innerHTML = `
            <div>
              <div><strong>${window.App.util.escapeHtml(team.name)}</strong></div>
              <div class="muted small">Code: <span class="badge">${window.App.util.escapeHtml(team.code)}</span></div>
            </div>
          `;
          el.addEventListener("click", () => Admin.selectTeam(team.id));
          el.classList.toggle("is-active", Admin.state.teamId === team.id);
          host.appendChild(el);
        });
      });
    },

    async selectTeam(teamId) {
      const sessionId = Admin.state.sessionId;
      if (!sessionId) return;

      Admin.state.teamId = teamId;

      window.App.util.qsa("#teamList .list-item").forEach((el) => {
        el.classList.toggle("is-active", el.dataset.teamId === teamId);
      });

      await Admin.renderBoardsPane();
    },

    async renderBoardsPane() {
      const { sessionId, teamId } = Admin.state;
      if (!sessionId || !teamId) return;

      Admin.clearBoardSubscriptions();

      const sessions = await window.App.sessionStore.getSessions();
      const session = sessions.find((entry) => entry.id === sessionId) || null;
      const teams = await window.App.sessionStore.getTeams(sessionId);
      const team = teams.find((entry) => entry.id === teamId) || null;

      const title = $("#adminTitle");
      const pane = $("#boardsPane");

      if (!title || !pane) return;

      if (!session || !team) {
        title.textContent = "Admin";
        Admin.setMeta("Session or team not found.");
        pane.innerHTML = '<div class="empty-state muted">Session or team not found.</div>';
        return;
      }

      title.textContent = `${team.name} — Admin`;
      Admin.setMeta(`${session.name} • Team code: ${team.code} • Live Firebase stamps`);

      const boards = await window.App.data.getBoardsForTeam(sessionId, teamId);
      pane.innerHTML = "";

      if (!boards.length) {
        pane.innerHTML = '<div class="empty-state muted">No boards assigned to this team.</div>';
        return;
      }

      const { items } = await window.App.data.items();
      const itemById = new Map(items.map((item) => [item.id, item]));

      for (const board of boards) {
        const card = document.createElement("div");
        card.className = "board-card";

        const head = document.createElement("div");
        head.className = "board-card__head";
        head.innerHTML = `
          <div>
            <div class="board-card__title">${window.App.util.escapeHtml(board.name)}</div>
            <div class="board-card__meta">Zone: ${window.App.util.escapeHtml(board.zone?.name || "")} • ${board.size}×${board.size}</div>
          </div>
          <a class="link" href="${Admin.boardLink(sessionId, teamId, board.id)}">Open board</a>
        `;

        const gridStack = document.createElement("div");
        gridStack.className = "admin-grid-stack";

        const grid = document.createElement("div");
        grid.className = "admin-grid";
        grid.style.setProperty("--gridSize", String(board.size || 5));

        const overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        overlay.setAttribute("class", "bingo-overlay");
        overlay.setAttribute("aria-hidden", "true");

        const stampState = await window.App.stamps.get(sessionId, teamId, board.id);
        let latestStampState = stampState;
        let activeBingoKeys = window.App.bingoFx.getCompletedLineKeys(board.size || 5, stampState);
        const tiles = board.tiles || [];

        for (let idx = 0; idx < tiles.length; idx += 1) {
          const tile = tiles[idx];
          const item = itemById.get(tile.itemId) || { name: "Unknown Item", description: "" };
          const tileEl = document.createElement("div");
          const tileKey = `${board.id}:${idx}`;

          tileEl.className = "admin-tile";
          const row = Math.floor(idx / (board.size || 5));
          const col = idx % (board.size || 5);
          tileEl.classList.add(((row + col) % 2 === 0) ? "tile--even" : "tile--odd");
          tileEl.classList.toggle("is-stamped", !!stampState[String(idx)]?.stamped);
          tileEl.innerHTML = `
            <div class="admin-tile__name">${window.App.util.escapeHtml(item.name)}</div>
            <div class="admin-tile__desc">${window.App.util.escapeHtml(item.description || "")}</div>
          `;

          tileEl.addEventListener("click", async () => {
            if (tileEl.dataset.busy === "1") return;

            tileEl.dataset.busy = "1";
            tileEl.setAttribute("aria-busy", "true");

            try {
              const nextStamp = await window.App.stamps.toggle(sessionId, teamId, board.id, idx);
              tileEl.classList.toggle("is-stamped", !!nextStamp?.stamped);
            } catch (err) {
              console.error("Stamp toggle failed:", err);
              Admin.setMeta(`Failed to update tile ${idx + 1} on ${board.name}.`);
            } finally {
              delete tileEl.dataset.busy;
              tileEl.removeAttribute("aria-busy");
            }
          });

          grid.appendChild(tileEl);
        }

        gridStack.appendChild(grid);
        gridStack.appendChild(overlay);

        window.App.bingoFx.renderOverlayNextFrame({
          gridEl: grid,
          overlayEl: overlay,
          size: board.size || 5,
          stampState: latestStampState
        });

        const overlayCleanup = window.App.bingoFx.watchLayout(grid, () => {
          window.App.bingoFx.renderOverlayNextFrame({
            gridEl: grid,
            overlayEl: overlay,
            size: board.size || 5,
            stampState: latestStampState
          });
        });

        const unsubscribe = window.App.stamps.subscribe(sessionId, teamId, board.id, (nextStampState) => {
          const tileEls = grid.querySelectorAll(".admin-tile");
          tileEls.forEach((tileEl, idx) => {
            tileEl.classList.toggle("is-stamped", !!nextStampState[String(idx)]?.stamped);
          });

          const prevKeys = new Set(activeBingoKeys || []);
          const nextKeys = window.App.bingoFx.getCompletedLineKeys(board.size || 5, nextStampState);
          const newLineKeys = nextKeys.filter((key) => !prevKeys.has(key));

          latestStampState = nextStampState;
          activeBingoKeys = nextKeys;

          window.App.bingoFx.renderOverlayNextFrame({
            gridEl: grid,
            overlayEl: overlay,
            size: board.size || 5,
            stampState: latestStampState,
            newLineKeys
          });

          if (newLineKeys.length) {
            window.App.bingoFx.playJingle();
          }
        });

        Admin.state.boardUnsubscribes.push(unsubscribe, overlayCleanup);
        card.appendChild(head);
        card.appendChild(gridStack);
        pane.appendChild(card);
      }
    },

    boardLink(sessionId, teamId, boardId) {
      const url = new URL("board.html", window.location.href);
      url.searchParams.set("session", sessionId);
      url.searchParams.set("team", teamId);
      url.searchParams.set("board", boardId);
      return url.toString();
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    Admin.init().catch((err) => {
      console.error("Admin init failed:", err);
      Admin.setMeta("Failed to initialize admin.");
    });
  });
})();
