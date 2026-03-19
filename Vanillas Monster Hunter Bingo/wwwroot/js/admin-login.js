(function () {
    "use strict";

    const $ = (sel, root = document) => root.querySelector(sel);

    document.addEventListener("DOMContentLoaded", () => {
        const form = $("#adminLoginForm");
        if (!form) return;

        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            const email = ($("#adminEmail")?.value || "").trim();
            const password = ($("#adminPassword")?.value || "").trim();
            const status = $("#adminLoginStatus");

            if (!email || !password) {
                if (status) status.textContent = "Email and password are required.";
                return;
            }

            try {
                await window.FirebaseAuthApi.signInWithEmailAndPassword(window.FirebaseAuth, email, password);
                window.location.href = "admin.html";
            } catch (err) {
                if (status) status.textContent = "Login failed.";
            }
        });
    });
})();