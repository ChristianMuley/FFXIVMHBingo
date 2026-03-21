(function () {
  "use strict";

  const ADMIN_UID = window.FirebaseAdmin?.uid || "T9XOzzfNS3UKr6rzoGMn4PuYiGn1";

  function setBusy(el, isBusy, busyText) {
    if (!el) return;

    if (busyText != null) {
      if (isBusy) {
        if (el.dataset.originalText == null) {
          el.dataset.originalText = el.textContent;
        }
        el.textContent = busyText;
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

  document.addEventListener("DOMContentLoaded", () => {
    if (!window.FirebaseAuth || !window.FirebaseAuthApi) {
      window.location.href = "admin-login.html";
      return;
    }

    const logoutBtn = document.getElementById("adminLogoutBtn");
    let redirecting = false;

    const redirectToLogin = (reason = "") => {
      if (redirecting) return;
      redirecting = true;

      const url = new URL("admin-login.html", window.location.href);
      if (reason) {
        url.searchParams.set("reason", reason);
      }

      window.location.href = url.toString();
    };

    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        if (logoutBtn.disabled) return;

        setBusy(logoutBtn, true, "Logging out…");

        try {
          await window.FirebaseAuthApi.signOut(window.FirebaseAuth);
        } catch (err) {
          console.error("Logout failed:", err);
        } finally {
          redirectToLogin();
        }
      });
    }

    window.FirebaseAuthApi.onAuthStateChanged(window.FirebaseAuth, async (user) => {
      if (!user) {
        redirectToLogin();
        return;
      }

      if (user.uid !== ADMIN_UID) {
        if (redirecting) return;
        redirecting = true;

        try {
          await window.FirebaseAuthApi.signOut(window.FirebaseAuth);
        } catch (err) {
          console.error("Unauthorized user sign-out failed:", err);
        }

        const url = new URL("admin-login.html", window.location.href);
        url.searchParams.set("reason", "unauthorized");
        window.location.href = url.toString();
      }
    });
  });
})();
