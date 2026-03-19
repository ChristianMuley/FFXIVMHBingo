(function () {
    "use strict";

    const $ = (sel, root = document) => root.querySelector(sel);

    const BoardAdmin = {
        state: {
            sessionId: null,
            teamId: null
        },

        async init() {
            const sessionPicker = $("#baSessionPicker");
            if (!sessionPicker) return;

            await BoardAdmin.renderSessions();
            BoardAdmin.wireSessionPicker();
            BoardAdmin.wireTeamPicker();
        },

        async renderSessions() {
            const picker = $("#baSessionPicker");
            const sessions = await window.App.sessionStore.getSessions();

            picker.innerHTML = `<option value="">Select a session</option>`;

            sessions.forEach(session => {
                const option = document.createElement("option");
                option.value = session.id;
                option.textContent = `${session.name} • ${session.era || ""}`;
                picker.appendChild(option);
            });
        },

        async renderTeams(sessionId) {
            const picker = $("#baTeamPicker");
            picker.innerHTML = `<option value="">Select a team</option>`;

            if (!sessionId) return;

            const teams = await window.App.sessionStore.getTeams(sessionId);

            teams.forEach(team => {
                const option = document.createElement("option");
                option.value = team.id;
                option.textContent = `${team.name} (${team.code})`;
                picker.appendChild(option);
            });
        },

        wireSessionPicker() {
            const picker = $("#baSessionPicker");
            picker.addEventListener("change", async () => {
                BoardAdmin.state.sessionId = picker.value || null;
                BoardAdmin.state.teamId = null;

                await BoardAdmin.renderTeams(BoardAdmin.state.sessionId);

                $("#baTeamPicker").value = "";
                $("#baMeta").textContent = BoardAdmin.state.sessionId
                    ? "Select a team."
                    : "Select a session and team.";

                $("#baBoardsPane").innerHTML = `
          <div class="empty-state muted">
            No team selected yet.
          </div>
        `;
            });
        },

        wireTeamPicker() {
            const picker = $("#baTeamPicker");
            picker.addEventListener("change", async () => {
                BoardAdmin.state.teamId = picker.value || null;

                if (!BoardAdmin.state.sessionId || !BoardAdmin.state.teamId) {
                    $("#baMeta").textContent = "Select a session and team.";
                    return;
                }

                await BoardAdmin.renderBoards();
            });
        },

        async renderBoards() {
            const { sessionId, teamId } = BoardAdmin.state;
            const pane = $("#baBoardsPane");

            const session = await window.App.data.getSession(sessionId);
            const team = await window.App.data.getTeam(sessionId, teamId);
            const boardsData = await window.App.data.boards();
            const boards = boardsData.boards || [];

            if (!session || !team) {
                $("#baTitle").textContent = "Board Admin";
                $("#baMeta").textContent = "Session or team not found.";
                pane.innerHTML = `<div class="empty-state muted">Session or team not found.</div>`;
                return;
            }
            
            $("#baTitle").textContent = `${team.name} — Board Assignment`;
            $("#baMeta").textContent = `${session.name} • ${team.code}`;

            pane.innerHTML = "";

            const assigned = await window.App.boardAssignments.getAssignedBoardIds(sessionId, teamId);

            boards.forEach(board => {
                const isAssigned = assigned.includes(board.id);

                const card = document.createElement("div");
                card.className = "board-card";

                card.innerHTML = `

          <div class="board-card__head">
            <div>
              <div class="board-card__title">${window.App.util.escapeHtml(board.name)}</div>
              <div class="board-card__meta">Zone: ${window.App.util.escapeHtml(board.zone?.name || "")} • ${board.size}×${board.size}</div>
            </div>
            <button class="btn btn--small ${isAssigned ? "btn--danger" : "btn--primary"}" type="button">
              ${isAssigned ? "Unassign" : "Assign"}
            </button>
          </div>
        `;

                const btn = $("button", card);
                btn.addEventListener("click", async () => {
                    if (isAssigned) {
                        await window.App.boardAssignments.unassignBoard(sessionId, teamId, board.id);
                    } else {
                        await window.App.boardAssignments.assignBoard(sessionId, teamId, board.id);
                    }

                    await BoardAdmin.renderBoards();
                });

                pane.appendChild(card);
            });
        }
    };

    document.addEventListener("DOMContentLoaded", () => {
        BoardAdmin.init().catch(() => {
            const meta = $("#baMeta");
            if (meta) meta.textContent = "Failed to initialize board admin.";
        });
    });
})();