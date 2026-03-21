(function () {
  "use strict";

  const ADMIN_UID = window.FirebaseAdmin?.uid || "T9XOzzfNS3UKr6rzoGMn4PuYiGn1";
  const $ = (sel, root = document) => root.querySelector(sel);

  function setBusy(specs, isBusy) {
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
  }

  function getLoginErrorMessage(err) {
    const code = err?.code || "";

    if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
      return "Login failed. Check your email and password.";
    }

    if (code === "auth/too-many-requests") {
      return "Too many attempts. Try again in a bit.";
    }

    return "Login failed.";
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form = $("#adminLoginForm");
    if (!form) return;

    const emailInput = $("#adminEmail");
    const passwordInput = $("#adminPassword");
    const status = $("#adminLoginStatus");
    const submitBtn = form.querySelector('button[type="submit"]');
    const params = new URLSearchParams(window.location.search);
    let submitting = false;

    if (params.get("reason") === "unauthorized" && status) {
      status.textContent = "This account is not allowed to access admin pages.";
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (submitting) return;

      const email = (emailInput?.value || "").trim();
      const password = (passwordInput?.value || "").trim();

      if (!email || !password) {
        if (status) status.textContent = "Email and password are required.";
        return;
      }

      submitting = true;
      setBusy([
        { el: submitBtn, busyText: "Signing in…" },
        emailInput,
        passwordInput
      ], true);
      if (status) status.textContent = "Signing in…";

      try {
        const cred = await window.FirebaseAuthApi.signInWithEmailAndPassword(window.FirebaseAuth, email, password);

        if (cred.user.uid !== ADMIN_UID) {
          await window.FirebaseAuthApi.signOut(window.FirebaseAuth);
          if (status) status.textContent = "This account is not allowed to access admin pages.";
          return;
        }

        if (status) status.textContent = "Signed in. Redirecting…";
        window.location.href = "admin.html";
      } catch (err) {
        console.error("Admin login failed:", err);
        if (status) status.textContent = getLoginErrorMessage(err);
      } finally {
        submitting = false;
        setBusy([
          { el: submitBtn, busyText: "Signing in…" },
          emailInput,
          passwordInput
        ], false);
      }
    });
  });
})();
