(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {
        if (!window.FirebaseAuth || !window.FirebaseAuthApi) {
            window.location.href = "admin-login.html";
            return;
        }

        const logoutBtn = document.getElementById("adminLogoutBtn");
        if (logoutBtn) {
            logoutBtn.addEventListener("click", async () => {
                try {
                    await window.FirebaseAuthApi.signOut(window.FirebaseAuth);
                } finally {
                    window.location.href = "admin-login.html";
                }
            });
        }

        window.FirebaseAuthApi.onAuthStateChanged(window.FirebaseAuth, (user) => {
            if (!user) {
                window.location.href = "admin-login.html";
            }
        });
    });
})();