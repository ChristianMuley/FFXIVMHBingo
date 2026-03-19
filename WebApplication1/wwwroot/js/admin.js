/* admin.js — Admin-only UI
   - Left sidebar: sessions + teams
   - Clicking a team loads all boards for that team
   - Clicking tiles toggles stamp/unstamp locally (same store as board page)
*/

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);

  const Admin = {
    state: {
      sessionId: null,
      teamId: null
    },

    async init() {
      const sidebar = $("#sessionList");
      if (!sidebar) return; // Not on admin page.

      $("#adminMeta").textContent = "Loading sessions…";

      await Admin.renderSessions();
      Admin.wireReset();

      // Auto-select first session/team for convenience
      const sessionsJson = await window.App.data.sessions();
      const firstSession = sessionsJson.sessions[0];
      if (firstSession) {
        Admin.selectSession(firstSession.id);
        const firstTeam = (firstSession.teams || [])[0];
        if (firstTeam) await Admin.selectTeam(firstTeam.id);
      }
    },

    wireReset() {
      const btn = $("#resetLocalBtn");
      if (!btn) return;
      btn.addEventListener("click", () => {
        window.App.stamps.resetAll();
        Admin.refreshBoardsPane();
      });
    },

    async renderSessions() {
      const { sessions } = await window.App.data.sessions();
      const host = $("#sessionList");
      host.innerHTML = "";

      sessions.forEach(s => {
        const el = document.createElement("div");
        el.className = "list-item";
        el.setAttribute("role", "option");
        el.dataset.sessionId = s.id;
        el.innerHTML = `
          <div>
            <div><strong>${window.App.util.escapeHtml(s.name)}</strong></div>
            <div class="muted small">${window.App.util.escapeHtml(s.era)} • ${window.App.util.escapeHtml(s.status)}</div>
          </div>
          <div class="badge">${(s.teams || []).length} teams</div>
        `;
        el.addEventListener("click", () => Admin.selectSession(s.id));
        host.appendChild(el);
      });

      $("#adminMeta").textContent = "Select a session and team.";
    },

    async selectSession(sessionId) {
      Admin.state.sessionId = sessionId;
      Admin.state.teamId = null;

      // highlight session
      window.App.util.qsa("#sessionList .list-item").forEach(el => {
        el.classList.toggle("is-active", el.dataset.sessionId === sessionId);
      });

      await Admin.renderTeams(sessionId);

      $("#adminTitle").textContent = "Admin";
      $("#adminMeta").textContent = "Select a team to load boards.";
      $("#boardsPane").innerHTML = `<div class="empty-state muted">Select a team to view boards.</div>`;
    },

    async renderTeams(sessionId) {
      const session = await window.App.data.getSession(sessionId);
      const host = $("#teamList");
      host.innerHTML = "";

      (session.teams || []).forEach(t => {
        const el = document.createElement("div");
        el.className = "list-item";
        el.setAttribute("role", "option");
        el.dataset.teamId = t.id;
        el.innerHTML = `
          <div>
            <div><strong>${window.App.util.escapeHtml(t.name)}</strong></div>
            <div class="muted small">Code: <span class="badge">${window.App.util.escapeHtml(t.code)}</span></div>
          </div>
          <div class="badge">${window.App.util.escapeHtml(t.region)}</div>
        `;
        el.addEventListener("click", () => Admin.selectTeam(t.id));
        host.appendChild(el);
      });
    },

    async selectTeam(teamId) {
      const sessionId = Admin.state.sessionId;
      if (!sessionId) return;
      Admin.state.teamId = teamId;

      // highlight team
      window.App.util.qsa("#teamList .list-item").forEach(el => {
        el.classList.toggle("is-active", el.dataset.teamId === teamId);
      });

      await Admin.renderBoardsPane();
    },

    async renderBoardsPane() {
      const { sessionId, teamId } = Admin.state;
      if (!sessionId || !teamId) return;

      const session = await window.App.data.getSession(sessionId);
      const team = (session.teams || []).find(t => t.id === teamId);

      $("#adminTitle").textContent = `${team.name} — Admin`;
      $("#adminMeta").textContent = `${session.name} • Team code: ${team.code} • Local stamps`;

      const boards = await window.App.data.getBoardsForTeam(sessionId, teamId);
      const pane = $("#boardsPane");
      pane.innerHTML = "";

      if (!boards.length) {
        pane.innerHTML = `<div class="empty-state muted">No boards assigned to this team (mock data).</div>`;
        return;
      }

      const { items } = await window.App.data.items();
      const itemById = new Map(items.map(i => [i.id, i]));

      boards.forEach(board => {
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

        (board.tiles || []).forEach((tile, idx) => {
          const item = itemById.get(tile.itemId) || { name: "Unknown Item", description: "" };
          const tileEl = document.createElement("div");
          tileEl.className = "admin-tile";
          const stamped = window.App.stamps.isStamped(sessionId, teamId, board.id, idx);
          tileEl.classList.toggle("is-stamped", stamped);

          tileEl.innerHTML = `
            <div class="admin-tile__name">${window.App.util.escapeHtml(item.name)}</div>
            <div class="admin-tile__desc">${window.App.util.escapeHtml(item.description || "")}</div>
          `;

          tileEl.addEventListener("click", () => {
            const now = window.App.stamps.toggle(sessionId, teamId, board.id, idx);
            tileEl.classList.toggle("is-stamped", now);
          });

          grid.appendChild(tileEl);
        });

        card.appendChild(head);
        card.appendChild(grid);
        pane.appendChild(card);
      });
    },

    boardLink(sessionId, teamId, boardId) {
      const url = new URL("board.html", window.location.href);
      url.searchParams.set("session", sessionId);
      url.searchParams.set("team", teamId);
      url.searchParams.set("board", boardId);
      return url.toString();
    },

    refreshBoardsPane() {
      // Re-render current boards if a team is selected
      if (Admin.state.sessionId && Admin.state.teamId) {
        Admin.renderBoardsPane().catch(() => {});
      }
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    Admin.init().catch(() => {
      const meta = $("#adminMeta");
      if (meta) meta.textContent = "Failed to initialize admin. Make sure JSON loads via a local server.";
    });
  });
})();
