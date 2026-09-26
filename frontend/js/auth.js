/**
 * Authentication and Role-Based Navigation Manager
 * Enforces dual-role login (Admin: email+password, Farmer: phone+password)
 */

class AuthManager {
  constructor() {
    this.currentUser = api.user;
    this.initElements();
    this.bindEvents();
    this.updateUI();
  }

  initElements() {
    this.loginModal = document.getElementById("authModal");
    this.tabFarmer = document.getElementById("tabFarmerLogin");
    this.tabAdmin = document.getElementById("tabAdminLogin");
    this.farmerForm = document.getElementById("farmerLoginForm");
    this.adminForm = document.getElementById("adminLoginForm");
    this.authError = document.getElementById("authError");
    this.userBadge = document.getElementById("userProfileBadge");
    this.userName = document.getElementById("userNameDisplay");
    this.userRoleTag = document.getElementById("userRoleTag");
    this.btnLogout = document.getElementById("btnLogout");
    this.adminNavLinks = document.querySelectorAll(".nav-link.admin-only, .mobile-nav-item.admin-only");
  }

  bindEvents() {
    if (this.tabFarmer && this.tabAdmin) {
      this.tabFarmer.addEventListener("click", () => this.switchTab("farmer"));
      this.tabAdmin.addEventListener("click", () => this.switchTab("admin"));
    }

    if (this.farmerForm) {
      this.farmerForm.addEventListener("submit", (e) => this.handleFarmerLogin(e));
    }

    if (this.adminForm) {
      this.adminForm.addEventListener("submit", (e) => this.handleAdminLogin(e));
    }

    if (this.btnLogout) {
      this.btnLogout.addEventListener("click", () => this.handleLogout());
    }

    document.addEventListener("languageChanged", () => {
      this.updateUI();
      const themeBtn = document.getElementById("themeToggleBtn");
      if (themeBtn) {
        const isDark = document.body.classList.contains("dark-theme");
        themeBtn.title = isDark
          ? (i18n?.currentLang === "kn" ? "ಬೆಳಕಿನ ಥೀಮ್‌ಗೆ ಬದಲಾಯಿಸಿ" : "Switch to Light Theme")
          : (i18n?.currentLang === "kn" ? "ಡಾರ್ಕ್ ಥೀಮ್‌ಗೆ ಬದಲಾಯಿಸಿ" : "Switch to Dark Theme");
      }
    });

    // Language toggle button
    const langBtn = document.getElementById("langToggleBtn");
    if (langBtn) {
      langBtn.addEventListener("click", () => {
        const nextLang = i18n.currentLang === "kn" ? "en" : "kn";
        i18n.setLanguage(nextLang);
      });
    }

    // Theme Switcher: Controlled via Settings Modal (Light / Dark Theme cards)
    const btnThemeLight = document.getElementById("btnThemeLight");
    const btnThemeDark = document.getElementById("btnThemeDark");
    const badgeThemeLight = document.getElementById("badgeThemeLight");
    const badgeThemeDark = document.getElementById("badgeThemeDark");

    const applyTheme = (theme) => {
      const isDark = theme === "dark";
      if (isDark) {
        document.body.classList.remove("light-theme");
        document.body.classList.add("dark-theme");
        if (btnThemeDark) btnThemeDark.classList.add("active");
        if (btnThemeLight) btnThemeLight.classList.remove("active");
        if (badgeThemeDark) badgeThemeDark.style.display = "inline-block";
        if (badgeThemeLight) badgeThemeLight.style.display = "none";
      } else {
        document.body.classList.remove("dark-theme");
        document.body.classList.add("light-theme");
        if (btnThemeLight) btnThemeLight.classList.add("active");
        if (btnThemeDark) btnThemeDark.classList.remove("active");
        if (badgeThemeLight) badgeThemeLight.style.display = "inline-block";
        if (badgeThemeDark) badgeThemeDark.style.display = "none";
      }
    };

    // Default to 'light' (Surely Nature Companion Theme)
    let savedTheme = localStorage.getItem("areca_companion_theme");
    if (!savedTheme) {
      try {
        localStorage.removeItem("areca_theme");
      } catch (e) {}
      savedTheme = "light";
      localStorage.setItem("areca_companion_theme", "light");
    }
    applyTheme(savedTheme);

    if (btnThemeLight) {
      btnThemeLight.addEventListener("click", () => {
        localStorage.setItem("areca_companion_theme", "light");
        applyTheme("light");
      });
    }

    if (btnThemeDark) {
      btnThemeDark.addEventListener("click", () => {
        localStorage.setItem("areca_companion_theme", "dark");
        applyTheme("dark");
      });
    }

    // General Section Sub-Modals: Edit User Name, Password, Mobile Number
    this.bindSettingsProfileEvents();
  }

  bindSettingsProfileEvents() {
    // 1. Edit User Name
    const btnEditUserName = document.getElementById("btnEditUserName");
    const modalEditUserName = document.getElementById("modalEditUserName");
    const formEditUserName = document.getElementById("formEditUserName");
    const inputEditUserName = document.getElementById("inputEditUserName");
    const btnCancelEditUserName = document.getElementById("btnCancelEditUserName");
    const btnCloseEditUserName = document.getElementById("btnCloseEditUserName");

    if (btnEditUserName && modalEditUserName) {
      btnEditUserName.addEventListener("click", () => {
        if (inputEditUserName) inputEditUserName.value = this.currentUser?.name || "Farmer";
        modalEditUserName.classList.add("open");
      });
    }
    const closeEditUser = () => modalEditUserName?.classList.remove("open");
    if (btnCancelEditUserName) btnCancelEditUserName.addEventListener("click", closeEditUser);
    if (btnCloseEditUserName) btnCloseEditUserName.addEventListener("click", closeEditUser);
    if (formEditUserName) {
      formEditUserName.addEventListener("submit", (e) => {
        e.preventDefault();
        const newName = inputEditUserName?.value.trim();
        if (newName) {
          if (!this.currentUser) this.currentUser = {};
          this.currentUser.name = newName;
          api.setSession(api.token || "token", this.currentUser);
          this.updateUI();
          closeEditUser();
        }
      });
    }

    // 2. Change Password
    const btnChangePassword = document.getElementById("btnChangePassword");
    const modalChangePassword = document.getElementById("modalChangePassword");
    const formChangePassword = document.getElementById("formChangePassword");
    const inputNewPw = document.getElementById("inputNewPassword");
    const inputConfPw = document.getElementById("inputConfirmPassword");
    const pwErr = document.getElementById("changePwError");
    const pwSucc = document.getElementById("changePwSuccess");
    const btnCancelPw = document.getElementById("btnCancelChangePassword");
    const btnClosePw = document.getElementById("btnCloseChangePassword");

    if (btnChangePassword && modalChangePassword) {
      btnChangePassword.addEventListener("click", () => {
        if (formChangePassword) formChangePassword.reset();
        if (pwErr) pwErr.style.display = "none";
        if (pwSucc) pwSucc.style.display = "none";
        modalChangePassword.classList.add("open");
      });
    }
    const closeChangePw = () => modalChangePassword?.classList.remove("open");
    if (btnCancelPw) btnCancelPw.addEventListener("click", closeChangePw);
    if (btnClosePw) btnClosePw.addEventListener("click", closeChangePw);
    if (formChangePassword) {
      formChangePassword.addEventListener("submit", (e) => {
        e.preventDefault();
        if (inputNewPw.value !== inputConfPw.value) {
          if (pwErr) {
            pwErr.textContent = i18n?.currentLang === "kn" ? "ಹೊಸ ಪಾಸ್‌ವರ್ಡ್ ಹೊಂದಿಕೆಯಾಗುತ್ತಿಲ್ಲ" : "New passwords do not match";
            pwErr.style.display = "block";
          }
          return;
        }
        if (pwErr) pwErr.style.display = "none";
        if (pwSucc) {
          pwSucc.textContent = i18n?.currentLang === "kn" ? "ಪಾಸ್‌ವರ್ಡ್ ಯಶಸ್ವಿಯಾಗಿ ಬದಲಾಗಿದೆ!" : "Password updated successfully!";
          pwSucc.style.display = "block";
        }
        setTimeout(() => closeChangePw(), 1000);
      });
    }

    // 3. Edit Mobile Number
    const btnEditUserPhone = document.getElementById("btnEditUserPhone");
    const modalEditUserPhone = document.getElementById("modalEditUserPhone");
    const formEditUserPhone = document.getElementById("formEditUserPhone");
    const inputEditUserPhone = document.getElementById("inputEditUserPhone");
    const btnCancelPhone = document.getElementById("btnCancelEditUserPhone");
    const btnClosePhone = document.getElementById("btnCloseEditUserPhone");

    if (btnEditUserPhone && modalEditUserPhone) {
      btnEditUserPhone.addEventListener("click", () => {
        const curPhone = this.currentUser?.phone || "+91 98450 12345";
        if (inputEditUserPhone) inputEditUserPhone.value = curPhone;
        modalEditUserPhone.classList.add("open");
      });
    }
    const closeEditPhone = () => modalEditUserPhone?.classList.remove("open");
    if (btnCancelPhone) btnCancelPhone.addEventListener("click", closeEditPhone);
    if (btnClosePhone) btnClosePhone.addEventListener("click", closeEditPhone);
    if (formEditUserPhone) {
      formEditUserPhone.addEventListener("submit", (e) => {
        e.preventDefault();
        const newPhone = inputEditUserPhone?.value.trim();
        if (newPhone) {
          if (!this.currentUser) this.currentUser = {};
          this.currentUser.phone = newPhone;
          api.setSession(api.token || "token", this.currentUser);
          this.updateUI();
          closeEditPhone();
        }
      });
    }
  }

  switchTab(type) {
    if (type === "farmer") {
      this.tabFarmer.classList.add("active");
      this.tabAdmin.classList.remove("active");
      this.farmerForm.style.display = "block";
      this.adminForm.style.display = "none";
    } else {
      this.tabAdmin.classList.add("active");
      this.tabFarmer.classList.remove("active");
      this.adminForm.style.display = "block";
      this.farmerForm.style.display = "none";
    }
    this.authError.style.display = "none";
  }

  async handleFarmerLogin(e) {
    e.preventDefault();
    this.authError.style.display = "none";
    const phone = document.getElementById("farmerPhoneInput").value.trim();
    const password = document.getElementById("farmerPasswordInput").value;

    try {
      const data = await api.loginFarmer(phone, password);
      api.setSession(data.access_token, data);
      this.currentUser = data;
      this.loginModal.classList.remove("open");
      this.updateUI();
      window.farmerDashboard?.loadData();
    } catch (err) {
      this.showError(err.message || i18n.t("invalid_phone_or_pw"));
    }
  }

  async handleAdminLogin(e) {
    e.preventDefault();
    this.authError.style.display = "none";
    const email = document.getElementById("adminEmailInput").value.trim();
    const password = document.getElementById("adminPasswordInput").value;

    try {
      const data = await api.loginAdmin(email, password);
      api.setSession(data.access_token, data);
      this.currentUser = data;
      this.loginModal.classList.remove("open");
      this.updateUI();
      window.farmerDashboard?.loadData();
      window.adminPortal?.loadOverview();
    } catch (err) {
      this.showError(err.message || i18n.t("invalid_admin_creds"));
    }
  }

  showError(msg) {
    this.authError.textContent = msg;
    this.authError.style.display = "block";
  }

  handleLogout() {
    api.clearSession();
    this.currentUser = null;
    this.updateUI();
    this.loginModal.classList.add("open");
  }

  updateUI() {
    if (!api.isAuthenticated()) {
      this.loginModal.classList.add("open");
      if (this.userBadge) this.userBadge.style.display = "none";
      return;
    }

    this.loginModal.classList.remove("open");
    if (this.userBadge) this.userBadge.style.display = "flex";
    const displayName = this.currentUser?.name || (i18n.currentLang === "kn" ? "ರೈತ" : "Farmer");
    const roleText = this.currentUser?.role === "admin" ? i18n.t("role_admin") : i18n.t("role_farmer");
    if (this.userName) this.userName.textContent = displayName;
    if (this.userRoleTag) {
      this.userRoleTag.textContent = roleText;
    }

    // Sync mobile navigation drawer profile
    const drawerNameEl = document.getElementById("drawerUserName");
    const drawerRoleEl = document.getElementById("drawerUserRoleTag");
    const drawerAvatarEl = document.getElementById("drawerAvatarLetter");
    if (drawerNameEl) drawerNameEl.textContent = displayName;
    if (drawerRoleEl) drawerRoleEl.textContent = roleText;
    if (drawerAvatarEl) drawerAvatarEl.textContent = (this.currentUser?.name || "F")[0].toUpperCase();

    // Sync Settings modal profile fields
    const settingsNameEl = document.getElementById("settingsUserNameDisplay");
    const settingsPhoneEl = document.getElementById("settingsUserPhoneDisplay");
    if (settingsNameEl) settingsNameEl.textContent = displayName;
    if (settingsPhoneEl) settingsPhoneEl.textContent = this.currentUser?.phone || "+91 98450 12345";

    // Dynamic Companion Hero Greeting
    const greetingNameEl = document.getElementById("farmerGreetingName");
    if (greetingNameEl) {
      const rawName = this.currentUser?.name || (i18n.currentLang === "kn" ? "ರೈತ" : "Shivraj");
      greetingNameEl.textContent = rawName.split(" ")[0];
    }
    const salutationEl = document.getElementById("greetingTimeSalutation");
    if (salutationEl) {
      const hr = new Date().getHours();
      const isKn = i18n.currentLang === "kn";
      if (hr < 12) {
        salutationEl.textContent = isKn ? i18n.t("greeting_morning") : "Good morning";
      } else if (hr < 17) {
        salutationEl.textContent = isKn ? i18n.t("greeting_afternoon") : "Good afternoon";
      } else {
        salutationEl.textContent = isKn ? i18n.t("greeting_evening") : "Good evening";
      }
    }

    // Role-based visibility for nav links
    const isAdmin = this.currentUser?.role === "admin";
    document.querySelectorAll(".nav-link.admin-only, .mobile-nav-item.admin-only").forEach(el => {
      el.style.display = isAdmin ? "flex" : "none";
    });

    // Guard admin-only sections if a farmer is logged in
    if (!isAdmin) {
      const currentActive = document.querySelector(".view-section.active");
      if (currentActive && (currentActive.id === "view-oled" || currentActive.id === "view-admin")) {
        window.farmerDashboard?.switchView("view-home");
      }
    }

    i18n.applyTranslations();

    // Trigger initial data load if authenticated and not yet loaded
    if (!window.farmerDashboard?.currentData) {
      window.farmerDashboard?.loadData();
    }
    if (isAdmin) {
      if (window.adminPortal) window.adminPortal.loadOverview();
      if (window.oledSimulator) window.oledSimulator.loadData();
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.auth = new AuthManager();
});
